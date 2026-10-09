import { CalendarDate, compareCalendarDates } from '../fitness-profile';
import { LoggingMode, WorkoutLog } from './workout-log.model';
import { summarizeWorkoutLog } from './workout-log';

/**
 * Workout history and progress facts, computed only from finished workout
 * logs (never from the plan). Framework-free and time-zone free: callers pass
 * `localDate`, which maps a recorded instant to the user's calendar date, and
 * `today` as a calendar date. Nothing here is inferred beyond what was logged
 * (no calories, PRs, 1RM or scores).
 */

/** Maps an ISO-8601 instant to the user's local calendar date (supplied by the app layer). */
export type LocalDateOf = (instant: string) => CalendarDate;

/** Finished workouts, most recently finished first (ties: started later first, then id). */
export function completedWorkouts(logs: readonly WorkoutLog[]): WorkoutLog[] {
  return logs
    .filter((log): log is WorkoutLog & { completedAt: string } => log.status === 'completed' && log.completedAt !== null)
    .sort(
      (a, b) =>
        Date.parse(b.completedAt) - Date.parse(a.completedAt) ||
        Date.parse(b.startedAt) - Date.parse(a.startedAt) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

/** A finished workout counts as training only if at least one set was completed. */
export const isTrainingWorkout = (log: WorkoutLog) =>
  log.status === 'completed' && log.exercises.some((e) => e.sets.some((s) => s.status === 'completed'));

export type CompletionStatus = 'complete' | 'partial';

/** complete: every set done; partial: finished with skipped or not-done sets. */
export const completionStatus = (log: WorkoutLog): CompletionStatus =>
  summarizeWorkoutLog(log).fullyCompleted ? 'complete' : 'partial';

// --- Calendar arithmetic (proleptic Gregorian, no time zones) ---------------------------

const dayNumber = ({ year, month, day }: CalendarDate) => Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);

/** 0 = Monday … 6 = Sunday. */
export const weekdayOf = (date: CalendarDate) => (((dayNumber(date) + 3) % 7) + 7) % 7;

export function addDays(date: CalendarDate, days: number): CalendarDate {
  const d = new Date((dayNumber(date) + days) * 86_400_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Monday of the calendar week (Monday–Sunday) containing `date`. */
export const startOfWeek = (date: CalendarDate) => addDays(date, -weekdayOf(date));

export const sameDay = (a: CalendarDate, b: CalendarDate) => compareCalendarDates(a, b) === 0;

// --- Grouping --------------------------------------------------------------------------

export interface HistoryDay {
  readonly date: CalendarDate;
  /** Most recent first. */
  readonly workouts: readonly WorkoutLog[];
}

/** Finished workouts grouped by the local calendar date they were completed on, newest day first. */
export function groupByCompletionDay(logs: readonly WorkoutLog[], localDate: LocalDateOf): HistoryDay[] {
  const days: { date: CalendarDate; workouts: WorkoutLog[] }[] = [];
  for (const log of completedWorkouts(logs)) {
    const date = localDate(log.completedAt as string);
    const last = days[days.length - 1];
    if (last && sameDay(last.date, date)) {
      last.workouts.push(log);
    } else {
      days.push({ date, workouts: [log] });
    }
  }
  return days;
}

// --- Progress facts ---------------------------------------------------------------------

export interface TrainingOverview {
  /** Finished workouts with at least one completed set. */
  readonly workoutsCompleted: number;
  /** …completed in the local calendar week (Monday–Sunday) containing `today`. */
  readonly workoutsThisWeek: number;
  /** …completed in the local calendar month of `today`. */
  readonly workoutsThisMonth: number;
  readonly totalSetsCompleted: number;
  /** Sum of start-to-finish durations of those workouts. */
  readonly totalDurationSeconds: number;
  /** The most recently finished training workout, if any. */
  readonly lastWorkout: WorkoutLog | null;
  readonly lastWorkoutDate: CalendarDate | null;
}

export function trainingOverview(logs: readonly WorkoutLog[], today: CalendarDate, localDate: LocalDateOf): TrainingOverview {
  const training = completedWorkouts(logs).filter(isTrainingWorkout);
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const dates = training.map((log) => localDate(log.completedAt as string));
  const inWeek = dates.filter((d) => compareCalendarDates(d, weekStart) >= 0 && compareCalendarDates(d, weekEnd) <= 0);
  const inMonth = dates.filter((d) => d.year === today.year && d.month === today.month);
  const summaries = training.map((log) => summarizeWorkoutLog(log));
  return {
    workoutsCompleted: training.length,
    workoutsThisWeek: inWeek.length,
    workoutsThisMonth: inMonth.length,
    totalSetsCompleted: summaries.reduce((n, s) => n + s.setsCompleted, 0),
    totalDurationSeconds: summaries.reduce((n, s) => n + s.durationSeconds, 0),
    lastWorkout: training[0] ?? null,
    lastWorkoutDate: dates[0] ?? null,
  };
}

// --- Exercise performance (foundation for progress features) -----------------------------

export interface PerformedSet {
  readonly setNumber: number;
  readonly weight: number | null;
  readonly reps: number | null;
  readonly durationSeconds: number | null;
  readonly completedAt: string;
}

export interface ExercisePerformanceSession {
  readonly workoutId: string;
  /** When the workout was finished. */
  readonly completedAt: string;
  readonly logging: LoggingMode;
  readonly weightUnit: WorkoutLog['weightUnit'];
  /** Completed sets only, in set order (skipped and not-done sets are not performance). */
  readonly sets: readonly PerformedSet[];
}

export interface ExercisePerformance {
  readonly exerciseId: string;
  /** Name from the most recent log's own snapshot. */
  readonly exerciseName: string;
  /** Most recent first. */
  readonly sessions: readonly ExercisePerformanceSession[];
}

/**
 * Every finished workout's completed sets of one exercise. No comparisons,
 * records or estimates: just what was logged. Null when it was never performed.
 */
export function exercisePerformance(logs: readonly WorkoutLog[], exerciseId: string): ExercisePerformance | null {
  const sessions: ExercisePerformanceSession[] = [];
  let name: string | null = null;
  for (const log of completedWorkouts(logs)) {
    for (const exercise of log.exercises.filter((e) => e.exerciseId === exerciseId)) {
      const sets = exercise.sets
        .filter((s) => s.status === 'completed' && s.completedAt !== null)
        .map((s) => ({
          setNumber: s.setNumber,
          weight: s.weight,
          reps: s.reps,
          durationSeconds: s.durationSeconds,
          completedAt: s.completedAt as string,
        }));
      if (sets.length > 0) {
        name ??= exercise.name;
        sessions.push({
          workoutId: log.id,
          completedAt: log.completedAt as string,
          logging: exercise.logging,
          weightUnit: log.weightUnit,
          sets,
        });
      }
    }
  }
  return name === null ? null : { exerciseId, exerciseName: name, sessions };
}
