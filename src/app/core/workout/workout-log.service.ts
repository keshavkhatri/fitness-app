import { Injectable, computed, inject, signal } from '@angular/core';

import {
  SetEntry,
  SetPosition,
  WorkoutLog,
  WorkoutLogError,
  WorkoutLogResult,
  completeSet,
  finishWorkout,
  goToExercise,
  resetSet,
  setRestSeconds,
  skipExercise,
  skipSet,
  startDecision,
  startWorkoutLog,
} from '../../domain/workout-session';
import { FitnessProfileService } from '../profile/fitness-profile.service';
import { CLOCK } from '../time/clock';
import { WorkoutLogRepository } from './workout-log.repository';
import { WorkoutPlanService } from './workout-plan.service';

export type StartWorkoutResult =
  | { readonly kind: 'started' | 'resumed'; readonly log: WorkoutLog }
  /** A different workout is in progress; nothing was started. */
  | { readonly kind: 'conflict'; readonly active: WorkoutLog }
  /** No current plan, or the session isn't a resistance session of it. */
  | { readonly kind: 'unavailable' };

export type LogUpdate = { readonly ok: true; readonly log: WorkoutLog } | { readonly ok: false; readonly error: WorkoutLogError };

/**
 * App-wide orchestration of performed workouts. The plan (WorkoutPlanService)
 * is only read when a workout starts; everything after works on the log's own
 * snapshot, so a plan regenerated mid-workout never changes it.
 *
 * - One workout in progress at a time (a different one reports a conflict).
 * - Every change is applied by the pure domain rules, serialized, and saved.
 * - If saving fails the workout continues in memory and `saveFailed` is set.
 */
@Injectable({ providedIn: 'root' })
export class WorkoutLogService {
  private readonly plans = inject(WorkoutPlanService);
  private readonly profiles = inject(FitnessProfileService);
  private readonly repository = inject(WorkoutLogRepository);
  private readonly clock = inject(CLOCK);

  private readonly state = signal<WorkoutLog | null>(null);
  private readonly failedSave = signal(false);
  /** Finished in this app session (lets the summary render even if saving failed). */
  private readonly finished = new Map<string, WorkoutLog>();
  private loaded: Promise<WorkoutLog | null> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  /** The in-progress workout, once `loadActive()` has run. */
  readonly active = this.state.asReadonly();
  readonly hasActive = computed(() => this.state() !== null);
  /** The latest change could not be saved on this device. */
  readonly saveFailed = this.failedSave.asReadonly();

  /** Reads the stored in-progress workout once (recovery after the app was closed). */
  loadActive(): Promise<WorkoutLog | null> {
    this.loaded ??= this.repository.loadActive().then(
      (log) => {
        this.state.set(log);
        return log;
      },
      () => {
        this.loaded = null;
        return null;
      },
    );
    return this.loaded;
  }

  /**
   * Starts (or resumes) a planned resistance session. With `replaceActive`, a
   * different in-progress workout is discarded first; without it, a conflict
   * is reported and nothing changes.
   */
  start(sessionId: string, options: { readonly replaceActive?: boolean } = {}): Promise<StartWorkoutResult> {
    return this.serialize(async () => {
      const active = await this.current();
      const decision = startDecision(active, sessionId);
      if (decision === 'resume' && active) {
        return { kind: 'resumed', log: active };
      }
      if (decision === 'conflict' && active && !options.replaceActive) {
        return { kind: 'conflict', active };
      }

      const planState = await this.plans.load();
      if (planState.kind !== 'ready') {
        return { kind: 'unavailable' };
      }
      const now = this.clock();
      const profile = await this.profiles.load();
      const created = startWorkoutLog(planState.plan, sessionId, {
        id: `wl-${now.getTime()}-${sessionId}`,
        startedAt: now.toISOString(),
        weightUnit: profile?.unitSystem === 'imperial' ? 'lb' : 'kg',
      });
      if (!created.ok) {
        return { kind: 'unavailable' };
      }
      if (active) {
        await this.repository.clearActive().catch(() => undefined);
      }
      await this.persist(() => this.repository.saveActive(created.value));
      this.state.set(created.value);
      return { kind: 'started', log: created.value };
    });
  }

  completeSet(position: SetPosition, entry: SetEntry): Promise<LogUpdate> {
    return this.update((log) => completeSet(log, position, entry, this.clock().toISOString()));
  }

  skipSet(position: SetPosition): Promise<LogUpdate> {
    return this.update((log) => skipSet(log, position));
  }

  resetSet(position: SetPosition): Promise<LogUpdate> {
    return this.update((log) => resetSet(log, position));
  }

  skipExercise(exerciseIndex: number): Promise<LogUpdate> {
    return this.update((log) => skipExercise(log, exerciseIndex));
  }

  /** The user's own rest between sets: one exercise, or all of them with `null`; `seconds` null restores the plan's rest. */
  setRestSeconds(exerciseIndex: number | null, seconds: number | null): Promise<LogUpdate> {
    return this.update((log) => setRestSeconds(log, exerciseIndex, seconds));
  }

  goToExercise(exerciseIndex: number): Promise<LogUpdate> {
    return this.update((log) => goToExercise(log, exerciseIndex));
  }

  /** Completes the active workout and stores it with finished workouts. */
  finish(): Promise<LogUpdate> {
    return this.serialize(async () => {
      const active = await this.current();
      if (!active) {
        return { ok: false, error: { code: 'workout-not-in-progress', message: 'No workout in progress.' } };
      }
      const done = finishWorkout(active, this.clock().toISOString());
      if (!done.ok) {
        return done;
      }
      this.finished.set(done.value.id, done.value);
      await this.persist(() => this.repository.saveCompleted(done.value));
      this.state.set(null);
      return { ok: true, log: done.value };
    });
  }

  /** Abandons the active workout (nothing is kept). */
  discard(): Promise<void> {
    return this.serialize(async () => {
      await this.loadActive();
      await this.repository.clearActive().catch(() => undefined);
      this.state.set(null);
    });
  }

  /** Workouts finished in this app session (includes any whose save failed). */
  finishedThisSession(): readonly WorkoutLog[] {
    return [...this.finished.values()];
  }

  /** A finished workout, for its summary. */
  async loadCompleted(id: string): Promise<WorkoutLog | null> {
    return this.finished.get(id) ?? (await this.repository.loadCompleted(id).catch(() => null));
  }

  /** The live in-progress workout (after the stored one has been loaded once). */
  private async current(): Promise<WorkoutLog | null> {
    await this.loadActive();
    return this.state();
  }

  private update(change: (log: WorkoutLog) => WorkoutLogResult<WorkoutLog>): Promise<LogUpdate> {
    return this.serialize(async () => {
      const active = await this.current();
      if (!active) {
        return { ok: false, error: { code: 'workout-not-in-progress', message: 'No workout in progress.' } };
      }
      const result = change(active);
      if (!result.ok) {
        return result;
      }
      this.state.set(result.value);
      await this.persist(() => this.repository.saveActive(result.value));
      return { ok: true, log: result.value };
    });
  }

  private async persist(save: () => Promise<void>): Promise<void> {
    try {
      await save();
      this.failedSave.set(false);
    } catch {
      this.failedSave.set(true);
    }
  }

  /** Changes apply one at a time, each to the result of the previous one. */
  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
