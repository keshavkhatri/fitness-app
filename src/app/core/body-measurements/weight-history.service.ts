import { Injectable, InjectionToken, inject, signal } from '@angular/core';

import {
  WeightEntry,
  WeightEntryErrors,
  WeightEntryInput,
  createWeightEntry,
  sortWeightEntries,
  updateWeightEntry,
} from '../../domain/body-measurements';
import { UnitSystem } from '../../domain/fitness-profile';
import { FitnessProfileService } from '../profile/fitness-profile.service';
import { CLOCK, localIsoDate } from '../time/clock';
import { WeightHistoryRepository } from './weight-history.repository';

/** Creates ids for new weight entries (replaceable in tests). */
export const WEIGHT_ENTRY_ID = new InjectionToken<() => string>('WEIGHT_ENTRY_ID', {
  providedIn: 'root',
  factory: () => () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `weight-${crypto.randomUUID()}`
      : `weight-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
});

export type WeightHistoryState =
  | { readonly status: 'loading' }
  /** `entries` oldest first; `unitSystem` is the profile's display preference (metric without a profile). */
  | { readonly status: 'ready'; readonly entries: readonly WeightEntry[]; readonly unitSystem: UnitSystem }
  /** The history couldn't be read (e.g. stored by a newer app version). */
  | { readonly status: 'error' };

export type WeightSaveResult =
  | { readonly ok: true; readonly entry: WeightEntry }
  | { readonly ok: false; readonly kind: 'invalid'; readonly errors: WeightEntryErrors }
  /** Nothing was saved (storage failed, or the entry no longer exists). */
  | { readonly ok: false; readonly kind: 'save-failed' };

export type WeightDeleteResult = { readonly ok: true } | { readonly ok: false };

/**
 * Recorded body weights. Changes are serialized and applied to the shown
 * list only after storage confirmed them.
 *
 * Kept separate from the profile on purpose: the profile's weight feeds the
 * assessment, calorie targets and plan, so recording a measurement never
 * changes it (nor regenerates anything). The profile is only read, for the
 * user's unit system.
 */
@Injectable({ providedIn: 'root' })
export class WeightHistoryService {
  private readonly repository = inject(WeightHistoryRepository);
  private readonly profiles = inject(FitnessProfileService);
  private readonly clock = inject(CLOCK);
  private readonly newId = inject(WEIGHT_ENTRY_ID);

  private readonly current = signal<WeightHistoryState>({ status: 'loading' });
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

  add(input: WeightEntryInput): Promise<WeightSaveResult> {
    return this.serialize(async () => {
      const created = createWeightEntry(input, { id: this.newId(), now: this.clock().toISOString(), today: this.today() });
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

  update(entry: WeightEntry, input: WeightEntryInput): Promise<WeightSaveResult> {
    return this.serialize(async () => {
      const updated = updateWeightEntry(entry, input, { now: this.clock().toISOString(), today: this.today() });
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

  remove(entry: WeightEntry): Promise<WeightDeleteResult> {
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

  private apply(change: (entries: readonly WeightEntry[]) => readonly WeightEntry[]): void {
    const state = this.current();
    if (state.status === 'ready') {
      this.current.set({ ...state, entries: sortWeightEntries(change(state.entries)) });
    }
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
