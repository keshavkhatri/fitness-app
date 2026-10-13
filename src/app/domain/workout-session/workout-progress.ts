import { CalendarDate, compareCalendarDates } from '../fitness-profile';
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
  /** Their start-to-finish time, in whole minutes (0 without workouts). */
  readonly minutes: number;
}

/** The seven days (Monday–Sunday) of the week containing `today`, with workouts per day. */
export function weeklyActivity(logs: readonly WorkoutLog[], today: CalendarDate, localDate: LocalDateOf): ActivityDay[] {
  const training = completedWorkouts(logs).filter(isTrainingWorkout);
  const finished = training.map((log) => ({
    day: localDate(log.completedAt as string),
    seconds: Math.max(0, (Date.parse(log.completedAt as string) - Date.parse(log.startedAt)) / 1000),
  }));
  const monday = startOfWeek(today);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const that = finished.filter((f) => sameDay(f.day, date));
    return { date, workouts: that.length, minutes: Math.round(that.reduce((n, f) => n + f.seconds, 0) / 60) };
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

// --- Weekly consistency -----------------------------------------------------------------------

export interface WeekCount {
  /** The Monday of the local week. */
  readonly weekStart: CalendarDate;
  /** Training workouts (≥ 1 completed set) finished in that Monday–Sunday week. */
  readonly workouts: number;
}

/**
 * Training workouts per local week (Monday–Sunday) for the `weeks` weeks
 * ending with the week of `today`, oldest first. A week with 0 is a week with
 * no finished workout on this device; callers decide whether weeks before the
 * first workout count (see `firstTrainingDate`).
 */
export function weeklyWorkoutCounts(logs: readonly WorkoutLog[], today: CalendarDate, weeks: number, localDate: LocalDateOf): WeekCount[] {
  const days = completedWorkouts(logs)
    .filter(isTrainingWorkout)
    .map((log) => localDate(log.completedAt as string));
  const currentMonday = startOfWeek(today);
  return Array.from({ length: weeks }, (_, i) => {
    const weekStart = addDays(currentMonday, -7 * (weeks - 1 - i));
    const weekEnd = addDays(weekStart, 6);
    const workouts = days.filter((d) => compareCalendarDates(d, weekStart) >= 0 && compareCalendarDates(d, weekEnd) <= 0).length;
    return { weekStart, workouts };
  });
}

/** The local date of the first finished training workout, or null without one. */
export function firstTrainingDate(logs: readonly WorkoutLog[], localDate: LocalDateOf): CalendarDate | null {
  const training = completedWorkouts(logs).filter(isTrainingWorkout);
  const first = training[training.length - 1];
  return first ? localDate(first.completedAt as string) : null;
}

// --- Volume -----------------------------------------------------------------------------------

/**
 * Recorded training volume: weight × reps summed over completed weighted
 * (weight-and-reps) sets, in the log's unit. Null when there were none
 * (bodyweight and timed work have no load to add up).
 */
export function workoutVolume(log: WorkoutLog): number | null {
  const sets = log.exercises
    .filter((e) => e.logging === 'weight-reps')
    .flatMap((e) => e.sets)
    .filter((s) => s.status === 'completed' && s.weight !== null && s.reps !== null);
  return sets.length > 0 ? sets.reduce((sum, s) => sum + (s.weight as number) * (s.reps as number), 0) : null;
}

/** The same for one exercise in one workout (its completed sets); null unless weight and reps were logged. */
export function sessionVolume(session: ExercisePerformanceSession): number | null {
  if (session.logging !== 'weight-reps') {
    return null;
  }
  const sets = session.sets.filter((s) => s.weight !== null && s.reps !== null);
  return sets.length > 0 ? sets.reduce((sum, s) => sum + (s.weight as number) * (s.reps as number), 0) : null;
}

/**
 * Total recorded volume across finished training workouts, per weight unit
 * (kg and lb are never added together). Units without weighted sets are absent.
 */
export function totalVolumeByUnit(logs: readonly WorkoutLog[]): Partial<Record<WorkoutLog['weightUnit'], number>> {
  const totals: Partial<Record<WorkoutLog['weightUnit'], number>> = {};
  for (const log of completedWorkouts(logs).filter(isTrainingWorkout)) {
    const volume = workoutVolume(log);
    if (volume !== null) {
      totals[log.weightUnit] = (totals[log.weightUnit] ?? 0) + volume;
    }
  }
  return totals;
}
