import { Injectable, inject } from '@angular/core';

import { calendarDateOf } from '../../domain/fitness-profile';
import {
  ActivityDay,
  ExercisePerformance,
  TrainingOverview,
  WorkoutLog,
  completedWorkouts,
  exercisePerformance,
  performedExercises,
  trainingOverview,
  weeklyActivity,
} from '../../domain/workout-session';
import { CLOCK, localCalendarDateOf } from '../time/clock';
import { WorkoutLogRepository } from './workout-log.repository';
import { WorkoutLogService } from './workout-log.service';

export type WorkoutHistoryResult =
  | { readonly ok: true; readonly workouts: readonly WorkoutLog[] }
  /** History could not be read (details are not exposed). */
  | { readonly ok: false };

export type ProgressResult =
  | {
      readonly ok: true;
      readonly overview: TrainingOverview;
      /** Monday–Sunday of the current local week. */
      readonly week: readonly ActivityDay[];
      /** Exercises with completed sets, most recently performed first. */
      readonly exercises: readonly ExercisePerformance[];
    }
  | { readonly ok: false };

/**
 * Read access to finished workouts: the history list, single workouts and
 * simple progress facts. Everything comes from the logs themselves (the plan
 * and catalog are never consulted), so history stays true to what the user
 * did even after the plan, profile or engine changes.
 *
 * Home and other features should use `overview()` rather than recomputing.
 */
@Injectable({ providedIn: 'root' })
export class WorkoutHistoryService {
  private readonly repository = inject(WorkoutLogRepository);
  private readonly logs = inject(WorkoutLogService);
  private readonly clock = inject(CLOCK);

  /** Finished workouts, most recently finished first. */
  async list(): Promise<WorkoutHistoryResult> {
    try {
      const stored = await this.repository.listCompleted();
      // Include workouts finished this session whose save failed.
      const ids = new Set(stored.map((l) => l.id));
      const unsaved = this.logs.finishedThisSession().filter((l) => !ids.has(l.id));
      return { ok: true, workouts: completedWorkouts([...stored, ...unsaved]) };
    } catch {
      return { ok: false };
    }
  }

  /** One finished workout by id (null if unknown). */
  get(id: string): Promise<WorkoutLog | null> {
    return this.logs.loadCompleted(id);
  }

  async mostRecent(): Promise<WorkoutLog | null> {
    const result = await this.list();
    return result.ok ? (result.workouts[0] ?? null) : null;
  }

  async hasHistory(): Promise<boolean> {
    const result = await this.list();
    return result.ok && result.workouts.length > 0;
  }

  /** Consistency and totals as of today (local calendar). Null if history can't be read. */
  async overview(): Promise<TrainingOverview | null> {
    const result = await this.list();
    return result.ok ? trainingOverview(result.workouts, calendarDateOf(this.clock()), localCalendarDateOf) : null;
  }

  /** The overview plus this week's finished workouts per day (Home), from one read of the history. */
  async weekOverview(): Promise<{ readonly overview: TrainingOverview; readonly week: readonly ActivityDay[] } | null> {
    const result = await this.list();
    if (!result.ok) {
      return null;
    }
    const today = calendarDateOf(this.clock());
    return {
      overview: trainingOverview(result.workouts, today, localCalendarDateOf),
      week: weeklyActivity(result.workouts, today, localCalendarDateOf),
    };
  }

  /** Everything the Progress screen needs, from one read of the history. */
  async progress(): Promise<ProgressResult> {
    const result = await this.list();
    if (!result.ok) {
      return { ok: false };
    }
    const today = calendarDateOf(this.clock());
    return {
      ok: true,
      overview: trainingOverview(result.workouts, today, localCalendarDateOf),
      week: weeklyActivity(result.workouts, today, localCalendarDateOf),
      exercises: performedExercises(result.workouts),
    };
  }

  /** Completed sets of one exercise across finished workouts (foundation for progress features). */
  async exercisePerformance(exerciseId: string): Promise<ExercisePerformance | null> {
    const result = await this.list();
    return result.ok ? exercisePerformance(result.workouts, exerciseId) : null;
  }
}
