import { Injectable, computed, inject, signal } from '@angular/core';

import { WORKOUT_PROGRAMMING_CONFIG } from '../../../core/workout/workout-programming-config.token';
import { WorkoutPlanService } from '../../../core/workout/workout-plan.service';
import { customSpecFromPlan } from '../../../domain/training-plan';
import { Exercise, WorkoutPlan } from '../../../domain/workout-programming';
import { CATALOG } from '../workout-view-model';
import {
  PlanDraft,
  PrescriptionField,
  addExercise,
  draftFromSpec,
  moveExercise,
  removeExercise,
  sameDraft,
  setField,
} from './custom-plan-draft';

/**
 * The custom plan being edited, kept for the whole editing session so the editor and the exercise picker
 * share it (selections survive going to the library and back). Nothing here touches the active plan:
 * only WorkoutPlanService.saveCustomPlan does, and only when the user saves.
 */
@Injectable({ providedIn: 'root' })
export class CustomPlanDraftService {
  private readonly plans = inject(WorkoutPlanService);
  private readonly config = inject(WORKOUT_PROGRAMMING_CONFIG);

  private readonly state = signal<{ readonly base: WorkoutPlan; readonly original: PlanDraft; readonly draft: PlanDraft } | null>(null);

  /** The plan the edit started from (its days and sessions). Null until `begin()` succeeds. */
  readonly base = computed(() => this.state()?.base ?? null);
  readonly draft = computed(() => this.state()?.draft ?? null);
  /** Anything differs from the plan the edit started from. */
  readonly dirty = computed(() => {
    const s = this.state();
    return !!s && !sameDraft(s.original, s.draft);
  });

  /**
   * Starts a fresh edit from the active plan, discarding any earlier unsaved draft.
   * False when there is no plan to edit.
   */
  async begin(): Promise<boolean> {
    const result = await this.plans.load();
    if (result.kind !== 'ready') {
      this.state.set(null);
      return false;
    }
    const original = draftFromSpec(customSpecFromPlan(result.plan));
    this.state.set({ base: result.plan, original, draft: original });
    return true;
  }

  /** Keeps the current draft (e.g. returning from the picker); starts one only if there is none. */
  async ensure(): Promise<boolean> {
    return this.state() ? true : this.begin();
  }

  discard(): void {
    this.state.set(null);
  }

  add(sessionId: string, exercise: Exercise): void {
    this.change((s) => addExercise(s.draft, sessionId, exercise, s.base, this.config));
  }

  remove(sessionId: string, exerciseId: string): void {
    this.change((s) => removeExercise(s.draft, sessionId, exerciseId));
  }

  move(sessionId: string, exerciseId: string, direction: -1 | 1): void {
    this.change((s) => moveExercise(s.draft, sessionId, exerciseId, direction));
  }

  edit(sessionId: string, exerciseId: string, field: PrescriptionField, value: string): void {
    this.change((s) => setField(s.draft, sessionId, exerciseId, field, value));
  }

  /** Whether the exercise is already in that day. */
  has(sessionId: string, exerciseId: string): boolean {
    return !!this.draft()?.find((d) => d.sessionId === sessionId)?.exercises.some((e) => e.exerciseId === exerciseId);
  }

  readonly catalog: ReadonlyMap<string, Exercise> = CATALOG;

  private change(next: (s: { base: WorkoutPlan; draft: PlanDraft }) => PlanDraft): void {
    this.state.update((s) => (s ? { ...s, draft: next(s) } : s));
  }
}
