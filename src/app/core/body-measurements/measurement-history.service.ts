import { Injectable, InjectionToken, inject, signal } from '@angular/core';

import {
  MeasurementEntry,
  MeasurementEntryErrors,
  MeasurementEntryInput,
  createMeasurementEntry,
  sortMeasurementEntries,
  updateMeasurementEntry,
} from '../../domain/body-measurements';
import { UnitSystem } from '../../domain/fitness-profile';
import { FitnessProfileService } from '../profile/fitness-profile.service';
import { CLOCK, localIsoDate } from '../time/clock';
import { MeasurementHistoryRepository } from './measurement-history.repository';

/** Creates ids for new measurement entries (replaceable in tests). */
export const MEASUREMENT_ENTRY_ID = new InjectionToken<() => string>('MEASUREMENT_ENTRY_ID', {
  providedIn: 'root',
  factory: () => () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `measurement-${crypto.randomUUID()}`
      : `measurement-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
});

export type MeasurementHistoryState =
  | { readonly status: 'loading' }
  /** `entries` oldest first; `unitSystem` is the profile's display preference (metric without a profile). */
  | { readonly status: 'ready'; readonly entries: readonly MeasurementEntry[]; readonly unitSystem: UnitSystem }
  /** The history couldn't be read (e.g. stored by a newer app version, or corrupt). */
  | { readonly status: 'error' };

export type MeasurementSaveResult =
  | { readonly ok: true; readonly entry: MeasurementEntry }
  | { readonly ok: false; readonly kind: 'invalid'; readonly errors: MeasurementEntryErrors }
  /** Nothing was saved (storage failed or unreadable, or the entry no longer exists). */
  | { readonly ok: false; readonly kind: 'save-failed' };

export type MeasurementDeleteResult = { readonly ok: true } | { readonly ok: false };

/**
 * Recorded body measurements. Changes are serialized and applied to the
 * shown list only after storage confirmed them.
 *
 * Never touches the profile or weight history; the profile is only read,
 * for the user's unit system.
 */
@Injectable({ providedIn: 'root' })
export class MeasurementHistoryService {
  private readonly repository = inject(MeasurementHistoryRepository);
  private readonly profiles = inject(FitnessProfileService);
  private readonly clock = inject(CLOCK);
  private readonly newId = inject(MEASUREMENT_ENTRY_ID);

  private readonly current = signal<MeasurementHistoryState>({ status: 'loading' });
  private loadToken = 0;
  private queue: Promise<unknown> = Promise.resolve();

  readonly state = this.current.asReadonly();

  /** The user's local calendar date now (the latest allowed measurement date). */
  today(): string {
    return localIsoDate(this.clock());
  }

  async load(): Promise<void> {
    const token = ++this.loadToken;
    if (this.current().status !== 'ready') {
      this.current.set({ status: 'loading' });
    }
    const [entries, unitSystem] = await Promise.all([
      this.repository.list().catch(() => null),
      this.unitSystem(),
    ]);
    if (token === this.loadToken) {
      this.current.set(entries ? { status: 'ready', entries, unitSystem } : { status: 'error' });
    }
  }

  /**
   * Whether a stored entry with this id exists but can't be shown (e.g. it has
   * sites from a newer app version). Only reads; rejects when the store can't be read.
   */
  isUnsupportedEntry(id: string): Promise<boolean> {
    return this.repository.hasUnreadable(id);
  }

  /** How many stored entries can't be shown (they're kept as they are). Only reads; rejects when the store can't be read. */
  unsupportedEntryCount(): Promise<number> {
    return this.repository.countUnreadable();
  }

  add(input: MeasurementEntryInput): Promise<MeasurementSaveResult> {
    return this.serialize(async () => {
      const created = createMeasurementEntry(input, { id: this.newId(), now: this.clock().toISOString(), today: this.today() });
      if (!created.ok) {
        return { ok: false, kind: 'invalid', errors: created.errors };
      }
      try {
        await this.repository.add(created.value);
      } catch {
        return { ok: false, kind: 'save-failed' };
      }
      this.apply((entries) => [...entries, created.value]);
      return { ok: true, entry: created.value };
    });
  }

  update(entry: MeasurementEntry, input: MeasurementEntryInput): Promise<MeasurementSaveResult> {
    return this.serialize(async () => {
      const updated = updateMeasurementEntry(entry, input, { now: this.clock().toISOString(), today: this.today() });
      if (!updated.ok) {
        return { ok: false, kind: 'invalid', errors: updated.errors };
      }
      try {
        await this.repository.update(updated.value);
      } catch {
        return { ok: false, kind: 'save-failed' };
      }
      this.apply((entries) => entries.map((e) => (e.id === entry.id ? updated.value : e)));
      return { ok: true, entry: updated.value };
    });
  }

  remove(entry: MeasurementEntry): Promise<MeasurementDeleteResult> {
    return this.serialize(async () => {
      try {
        await this.repository.remove(entry.id);
      } catch {
        return { ok: false };
      }
      this.apply((entries) => entries.filter((e) => e.id !== entry.id));
      return { ok: true };
    });
  }

  private async unitSystem(): Promise<UnitSystem> {
    try {
      return (await this.profiles.load())?.unitSystem ?? 'metric';
    } catch {
      return 'metric';
    }
  }

  private apply(change: (entries: readonly MeasurementEntry[]) => readonly MeasurementEntry[]): void {
    const state = this.current();
    if (state.status === 'ready') {
      this.current.set({ ...state, entries: sortMeasurementEntries(change(state.entries)) });
    }
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
