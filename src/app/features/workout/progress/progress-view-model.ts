import { ProgressResult } from '../../../core/workout/workout-history.service';
import { CalendarDate, calendarDateOf, compareCalendarDates } from '../../../domain/fitness-profile';
import {
  ActivityDay,
  ExercisePerformance,
  ExercisePerformanceSession,
  LoggingMode,
  PerformedSet,
  WeightUnit,
  addDays,
  recentBest,
  topSet,
} from '../../../domain/workout-session';
import { dayLabel } from '../history/history-view-model';
import { formatDuration } from '../summary/workout-summary-view-model';
import { WEEKDAYS, WORKOUT_COPY } from '../workout-content';

/**
 * Presentation models for Progress. Everything shown is something the user
 * logged (completed sets, finished workouts); nothing is estimated. Dates are
 * formatted here in local time; calculations live in the domain.
 */

const copy = WORKOUT_COPY.progress;
const localDateOf = (instant: string) => calendarDateOf(new Date(instant));
const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const monthDayYear = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** "Today", "Yesterday", "Oct 8" (with the year when it isn't this year). */
export function performedOnLabel(date: CalendarDate, today: CalendarDate): string {
  if (compareCalendarDates(date, today) === 0) {
    return WORKOUT_COPY.history.today;
  }
  if (compareCalendarDates(date, addDays(today, -1)) === 0) {
    return WORKOUT_COPY.history.yesterday;
  }
  const value = new Date(date.year, date.month - 1, date.day);
  return (date.year === today.year ? monthDay : monthDayYear).format(value);
}

/** What was actually done: "62.5 kg × 7", "15 reps", "45 sec". Never a weight that wasn't logged. */
export function formatPerformedSet(set: PerformedSet, logging: LoggingMode, unit: WeightUnit): string {
  switch (logging) {
    case 'duration':
      return `${set.durationSeconds} sec`;
    case 'reps':
      return `${set.reps} reps`;
    default:
      return `${set.weight} ${unit} × ${set.reps}`;
  }
}

const formatTopSet = (session: ExercisePerformanceSession) => formatPerformedSet(topSet(session), session.logging, session.weightUnit);

// --- Progress screen --------------------------------------------------------------------------

export interface WeekDayView {
  readonly key: string;
  /** "M", "T", … (visual only) */
  readonly letter: string;
  /** "Monday: workout completed" */
  readonly spoken: string;
  readonly status: 'done' | 'none' | 'upcoming';
  readonly isToday: boolean;
}

export interface PerformanceCardView {
  readonly exerciseId: string;
  readonly name: string;
  /** Top set of the latest session, e.g. "62.5 kg × 7". */
  readonly latest: string;
  /** "Last performed · Oct 8" */
  readonly lastPerformed: string;
}

export interface FactView {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

/** A count tile: the number large, its unit below ("4" / "workouts"). */
export interface CountView {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly unit: string;
}

export type ProgressScreen =
  | {
      readonly kind: 'ready';
      readonly overview: readonly CountView[];
      readonly week: { readonly summary: string; readonly days: readonly WeekDayView[] };
      readonly activity: readonly FactView[];
      readonly recent: readonly PerformanceCardView[];
      /** More exercises exist than the recent list shows. */
      readonly hasMoreExercises: boolean;
    }
  | { readonly kind: 'empty' }
  | { readonly kind: 'error' };

export const RECENT_PERFORMANCE_LIMIT = 4;

function toWeekDay(day: ActivityDay, index: number, today: CalendarDate): WeekDayView {
  const weekday = WEEKDAYS[index];
  const upcoming = compareCalendarDates(day.date, today) > 0;
  return {
    key: weekday.key,
    letter: weekday.short.charAt(0),
    spoken: copy.week.days(weekday.name, day.workouts, upcoming),
    status: day.workouts > 0 ? 'done' : upcoming ? 'upcoming' : 'none',
    isToday: compareCalendarDates(day.date, today) === 0,
  };
}

export function toPerformanceCard(performance: ExercisePerformance, today: CalendarDate): PerformanceCardView {
  const latest = performance.sessions[0];
  return {
    exerciseId: performance.exerciseId,
    name: performance.exerciseName,
    latest: formatTopSet(latest),
    lastPerformed: copy.recent.lastPerformed(performedOnLabel(localDateOf(latest.completedAt), today)),
  };
}

export function toProgressScreen(result: ProgressResult, now: Date): ProgressScreen {
  if (!result.ok) {
    return { kind: 'error' };
  }
  const { overview, week, exercises } = result;
  if (overview.workoutsCompleted === 0) {
    return { kind: 'empty' };
  }
  const today = calendarDateOf(now);
  const workouts = WORKOUT_COPY.history.workouts;
  return {
    kind: 'ready',
    overview: [
      { key: 'week', label: copy.overview.thisWeek, count: overview.workoutsThisWeek },
      { key: 'month', label: copy.overview.thisMonth, count: overview.workoutsThisMonth },
      { key: 'total', label: copy.overview.total, count: overview.workoutsCompleted },
    ].map((tile) => ({ ...tile, unit: tile.count === 1 ? copy.overview.workout : copy.overview.workouts })),
    week: { summary: workouts(overview.workoutsThisWeek), days: week.map((d, i) => toWeekDay(d, i, today)) },
    activity: [
      { key: 'sets', label: copy.activity.sets, value: `${overview.totalSetsCompleted}` },
      { key: 'time', label: copy.activity.time, value: formatDuration(overview.totalDurationSeconds) },
      {
        key: 'last',
        label: copy.activity.last,
        value: overview.lastWorkoutDate ? dayLabel(overview.lastWorkoutDate, today) : copy.activity.none,
      },
    ],
    recent: exercises.slice(0, RECENT_PERFORMANCE_LIMIT).map((p) => toPerformanceCard(p, today)),
    hasMoreExercises: exercises.length > RECENT_PERFORMANCE_LIMIT,
  };
}

/** Every performed exercise, most recent first (the "View all exercises" list). */
export function toExerciseList(result: ProgressResult, now: Date): readonly PerformanceCardView[] | null {
  if (!result.ok) {
    return null;
  }
  const today = calendarDateOf(now);
  return result.exercises.map((p) => toPerformanceCard(p, today));
}

// --- Exercise performance detail -----------------------------------------------------------

export interface PerformanceSessionView {
  readonly key: string;
  /** "Thursday, Oct 8" */
  readonly dateLabel: string;
  readonly sets: readonly { readonly key: number; readonly label: string; readonly value: string }[];
}

export interface ExercisePerformanceView {
  readonly name: string;
  readonly latest: { readonly value: string; readonly date: string };
  readonly recentBest: { readonly value: string; readonly date: string; readonly note: string } | null;
  readonly sessions: readonly PerformanceSessionView[];
}

export const PERFORMANCE_SESSION_LIMIT = 10;

export function toExercisePerformance(performance: ExercisePerformance, now: Date): ExercisePerformanceView {
  const today = calendarDateOf(now);
  const latest = performance.sessions[0];
  const best = recentBest(performance);
  const date = (instant: string) => performedOnLabel(localDateOf(instant), today);
  return {
    name: performance.exerciseName,
    latest: { value: formatTopSet(latest), date: date(latest.completedAt) },
    recentBest: best
      ? {
          value: formatPerformedSet(best.set, best.session.logging, best.session.weightUnit),
          date: date(best.session.completedAt),
          note: copy.detail.recentBestNote(best.sessionsConsidered),
        }
      : null,
    sessions: performance.sessions.slice(0, PERFORMANCE_SESSION_LIMIT).map((session) => {
      const day = localDateOf(session.completedAt);
      return {
        key: `${session.workoutId}`,
        dateLabel: dayLabel(day, today),
        sets: session.sets.map((set) => ({
          key: set.setNumber,
          label: WORKOUT_COPY.active.set(set.setNumber),
          value: formatPerformedSet(set, session.logging, session.weightUnit),
        })),
      };
    }),
  };
}

