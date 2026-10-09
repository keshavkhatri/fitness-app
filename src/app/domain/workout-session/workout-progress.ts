import { CalendarDate } from '../fitness-profile';
import {
  ExercisePerformance,
  ExercisePerformanceSession,
  LocalDateOf,
  PerformedSet,
  addDays,
  completedWorkouts,
  exercisePerformance,
  isTrainingWorkout,
  sameDay,
  startOfWeek,
} from './workout-history';
import { LoggingMode, WorkoutLog } from './workout-log.model';

/**
 * Progress facts built on the history functions: weekly activity and recent
 * per-exercise performance. Framework-free and time-zone free (callers pass
 * `today` and `localDate`). Only what was logged is used: no estimates,
 * percentages, records or scores.
 */

// --- Weekly activity ----------------------------------------------------------------------

export interface ActivityDay {
  readonly date: CalendarDate;
  /** Training workouts (≥ 1 completed set) finished on this local day. */
  readonly workouts: number;
}

/** The seven days (Monday–Sunday) of the week containing `today`, with workouts per day. */
export function weeklyActivity(logs: readonly WorkoutLog[], today: CalendarDate, localDate: LocalDateOf): ActivityDay[] {
  const training = completedWorkouts(logs).filter(isTrainingWorkout);
  const finishedOn = training.map((log) => localDate(log.completedAt as string));
  const monday = startOfWeek(today);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { date, workouts: finishedOn.filter((d) => sameDay(d, date)).length };
  });
}

// --- Exercise performance ---------------------------------------------------------------------

/** Every exercise with at least one completed set, most recently performed first (grouped by exercise id). */
export function performedExercises(logs: readonly WorkoutLog[]): ExercisePerformance[] {
  const order: string[] = [];
  for (const log of completedWorkouts(logs)) {
    for (const exercise of log.exercises) {
      if (!order.includes(exercise.exerciseId) && exercise.sets.some((s) => s.status === 'completed')) {
        order.push(exercise.exerciseId);
      }
    }
  }
  return order.map((id) => exercisePerformance(logs, id)).filter((p): p is ExercisePerformance => p !== null);
}

/** The `limit` most recently performed exercises. */
export const recentExercisePerformance = (logs: readonly WorkoutLog[], limit: number) => performedExercises(logs).slice(0, limit);

/**
 * Whether set `a` beats set `b` under one logging mode, by an explicit rule:
 * - weight and reps: heavier weight, then more reps;
 * - reps only: more reps;
 * - duration: longer time.
 * Only meaningful for sets with the same logging mode and weight unit.
 */
export function isBetterSet(logging: LoggingMode, a: PerformedSet, b: PerformedSet): boolean {
  switch (logging) {
    case 'duration':
      return (a.durationSeconds ?? 0) > (b.durationSeconds ?? 0);
    case 'reps':
      return (a.reps ?? 0) > (b.reps ?? 0);
    default:
      return (a.weight ?? 0) > (b.weight ?? 0) || ((a.weight ?? 0) === (b.weight ?? 0) && (a.reps ?? 0) > (b.reps ?? 0));
  }
}

/**
 * A session's top set (ties go to the earlier set). A description of what
 * was logged, not a personal record.
 */
export function topSet(session: ExercisePerformanceSession): PerformedSet {
  return session.sets.reduce((best, set) => (isBetterSet(session.logging, set, best) ? set : best));
}

export interface RecentBest {
  readonly set: PerformedSet;
  readonly session: ExercisePerformanceSession;
  /** How many recent sessions were considered. */
  readonly sessionsConsidered: number;
}

/**
 * The best top set across the latest `window` sessions that are comparable
 * with the most recent one (same logging mode and same weight unit, so kg and
 * lb are never mixed). Ties go to the more recent session. Null when the
 * exercise was never performed.
 */
export function recentBest(performance: ExercisePerformance, window = 5): RecentBest | null {
  const latest = performance.sessions[0];
  if (!latest) {
    return null;
  }
  const comparable = performance.sessions
    .filter((s) => s.logging === latest.logging && s.weightUnit === latest.weightUnit)
    .slice(0, window);
  let best = { set: topSet(latest), session: latest };
  for (const session of comparable) {
    const candidate = topSet(session);
    if (isBetterSet(latest.logging, candidate, best.set)) {
      best = { set: candidate, session };
    }
  }
  return { ...best, sessionsConsidered: comparable.length };
}
