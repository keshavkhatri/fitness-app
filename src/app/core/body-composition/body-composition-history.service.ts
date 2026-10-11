import { Injectable, InjectionToken, inject, signal } from '@angular/core';

import {
  BodyCompositionAssessment,
  BodyCompositionErrors,
  BodyCompositionInput,
  createBodyCompositionAssessment,
  sortBodyCompositionAssessments,
  updateBodyCompositionAssessment,
} from '../../domain/body-composition';
import { CLOCK, localIsoDate } from '../time/clock';
import { BodyCompositionHistoryRepository } from './body-composition-history.repository';

/** Creates ids for new assessments (replaceable in tests). */
export const BODY_COMPOSITION_ASSESSMENT_ID = new InjectionToken<() => string>('BODY_COMPOSITION_ASSESSMENT_ID', {
  providedIn: 'root',
  factory: () => () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `body-composition-${crypto.randomUUID()}`
      : `body-composition-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
});

export type BodyCompositionHistoryState =
  | { readonly status: 'loading' }
  /** `assessments` oldest first. */
  | { readonly status: 'ready'; readonly assessments: readonly BodyCompositionAssessment[] }
  /** The history couldn't be read (e.g. stored by a newer app version, or corrupt). */
  | { readonly status: 'error' };

export type BodyCompositionSaveResult =
  | { readonly ok: true; readonly assessment: BodyCompositionAssessment }
  | { readonly ok: false; readonly kind: 'invalid'; readonly errors: BodyCompositionErrors }
  /** Nothing was saved (storage failed or unreadable). */
  | { readonly ok: false; readonly kind: 'save-failed' };

/** `ok: false`: nothing was deleted. */
export type BodyCompositionDeleteResult = { readonly ok: boolean };

/**
 * Recorded body-composition assessments. Saves are serialized and applied to
 * the shown list only after storage confirmed them.
 *
 * Never touches the profile, weight history or tape measurements (and reads
 * none of them): an assessment's weight is not a weigh-in and never changes
 * the profile.
 */
@Injectable({ providedIn: 'root' })
export class BodyCompositionHistoryService {
  private readonly repository = inject(BodyCompositionHistoryRepository);
  private readonly clock = inject(CLOCK);
  private readonly newId = inject(BODY_COMPOSITION_ASSESSMENT_ID);

  private readonly current = signal<BodyCompositionHistoryState>({ status: 'loading' });
  private loadToken = 0;
  private queue: Promise<unknown> = Promise.resolve();

  readonly state = this.current.asReadonly();

  /** The user's local calendar date now (the latest allowed assessment date). */
  today(): string {
    return localIsoDate(this.clock());
  }

  async load(): Promise<void> {
    const token = ++this.loadToken;
    if (this.current().status !== 'ready') {
      this.current.set({ status: 'loading' });
    }
    const assessments = await this.repository.list().catch(() => null);
    if (token === this.loadToken) {
      this.current.set(assessments ? { status: 'ready', assessments } : { status: 'error' });
    }
  }

  /** How many stored assessments can't be shown (they're kept as they are). Only reads; rejects when the store can't be read. */
  unsupportedAssessmentCount(): Promise<number> {
    return this.repository.countUnreadable();
  }

  add(input: BodyCompositionInput): Promise<BodyCompositionSaveResult> {
    return this.serialize(async () => {
      const created = createBodyCompositionAssessment(input, { id: this.newId(), now: this.clock().toISOString(), today: this.today() });
      if (!created.ok) {
        return { ok: false, kind: 'invalid', errors: created.errors };
      }
      try {
        await this.repository.add(created.value);
      } catch {
        return { ok: false, kind: 'save-failed' };
      }
      this.apply((assessments) => [...assessments, created.value]);
      return { ok: true, assessment: created.value };
    });
  }

  /** A user correction; never touches the profile or weight history. */
  update(assessment: BodyCompositionAssessment, input: BodyCompositionInput): Promise<BodyCompositionSaveResult> {
    return this.serialize(async () => {
      const updated = updateBodyCompositionAssessment(assessment, input, { now: this.clock().toISOString(), today: this.today() });
      if (!updated.ok) {
        return { ok: false, kind: 'invalid', errors: updated.errors };
      }
      try {
        await this.repository.update(updated.value);
      } catch {
        return { ok: false, kind: 'save-failed' };
      }
      this.apply((assessments) => assessments.map((a) => (a.id === assessment.id ? updated.value : a)));
      return { ok: true, assessment: updated.value };
    });
  }

  /** Removes this assessment only; weigh-ins and the profile stay as they are. */
  remove(assessment: BodyCompositionAssessment): Promise<BodyCompositionDeleteResult> {
    return this.serialize(async () => {
      try {
        await this.repository.remove(assessment.id);
      } catch {
        return { ok: false };
      }
      this.apply((assessments) => assessments.filter((a) => a.id !== assessment.id));
      return { ok: true };
    });
  }

  private apply(change: (assessments: readonly BodyCompositionAssessment[]) => readonly BodyCompositionAssessment[]): void {
    const state = this.current();
    if (state.status === 'ready') {
      this.current.set({ status: 'ready', assessments: sortBodyCompositionAssessments(change(state.assessments)) });
    }
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
