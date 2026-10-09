import { WorkoutHistoryResult } from '../../../core/workout/workout-history.service';
import { CalendarDate, calendarDateOf, compareCalendarDates, toIsoCalendarDate } from '../../../domain/fitness-profile';
import {
  ExerciseLog,
  SetLog,
  TrainingOverview,
  WorkoutLog,
  addDays,
  completionStatus,
  groupByCompletionDay,
  summarizeWorkoutLog,
} from '../../../domain/workout-session';
import { formatSetValues } from '../active/active-workout-view-model';
import { formatDuration } from '../summary/workout-summary-view-model';
import { WORKOUT_COPY } from '../workout-content';
import { formatPrescription, prescriptionParts, titleFor } from '../workout-formatting';

/**
 * Presentation models for workout history. Built from finished workout logs
 * only: names, prescriptions and results all come from each log's own
 * snapshot, never from today's plan or catalog. Dates are formatted here, in
 * the user's local time zone (the domain stays time-zone free).
 */

const copy = WORKOUT_COPY.history;

// --- Dates ------------------------------------------------------------------------------

const localDateOf = (instant: string) => calendarDateOf(new Date(instant));
const toLocalDate = ({ year, month, day }: CalendarDate) => new Date(year, month - 1, day);
const weekdayMonthDay = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
const weekdayMonthDayYear = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
const shortWeekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const shortMonthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const timeOfDay = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

/** "Today", "Yesterday", "Monday, Oct 5", or with the year when it isn't this year. */
export function dayLabel(date: CalendarDate, today: CalendarDate): string {
  if (compareCalendarDates(date, today) === 0) {
    return copy.today;
  }
  if (compareCalendarDates(date, addDays(today, -1)) === 0) {
    return copy.yesterday;
  }
  return (date.year === today.year ? weekdayMonthDay : weekdayMonthDayYear).format(toLocalDate(date));
}

/** Compact form for small lists: "Today", "Yesterday", "Mon" (this week), else "Oct 5". */
export function shortDayLabel(date: CalendarDate, today: CalendarDate): string {
  if (compareCalendarDates(date, today) === 0) {
    return copy.today;
  }
  if (compareCalendarDates(date, addDays(today, -1)) === 0) {
    return copy.yesterday;
  }
  return compareCalendarDates(date, addDays(today, -6)) >= 0
    ? shortWeekday.format(toLocalDate(date))
    : shortMonthDay.format(toLocalDate(date));
}

export const formatTime = (instant: string) => timeOfDay.format(new Date(instant));

// --- History list -----------------------------------------------------------------------

export interface HistoryItemView {
  readonly id: string;
  readonly title: string;
  /** "6:45 PM" (the day is the group heading). */
  readonly time: string;
  /** "45 min · 7 of 7 exercises · 22 sets" */
  readonly meta: string;
  /** The same as parts that must not break across lines (time first). */
  readonly metaParts: readonly string[];
  readonly status: 'complete' | 'partial';
  /** Always in words: "Completed" or "Finished · 16/22 sets". */
  readonly statusLabel: string;
  /** "3 skipped" when sets were skipped. */
  readonly skippedLabel: string | null;
}

export interface HistoryGroupView {
  readonly key: string;
  readonly label: string;
  readonly items: readonly HistoryItemView[];
}

export interface ConsistencyView {
  readonly thisWeek: string;
  readonly thisMonth: string;
}

export type HistoryScreen =
  | { readonly kind: 'ready'; readonly consistency: ConsistencyView; readonly groups: readonly HistoryGroupView[] }
  | { readonly kind: 'empty' }
  | { readonly kind: 'error' };

export function toHistoryItem(log: WorkoutLog): HistoryItemView {
  const s = summarizeWorkoutLog(log);
  const status = completionStatus(log);
  const parts = [formatDuration(s.durationSeconds), copy.exercises(s.exercisesCompleted, s.totalExercises), copy.sets(s.setsCompleted)];
  const time = formatTime(log.completedAt ?? log.startedAt);
  return {
    id: log.id,
    title: titleFor(log.sessionType, log.variant),
    time,
    meta: parts.join(' · '),
    metaParts: [time, ...parts],
    status,
    statusLabel: status === 'complete' ? copy.completed : copy.partial(s.setsCompleted, s.totalSets),
    skippedLabel: s.setsSkipped > 0 ? copy.skippedCount(s.setsSkipped) : null,
  };
}

export function toConsistency(overview: TrainingOverview): ConsistencyView {
  return { thisWeek: copy.workouts(overview.workoutsThisWeek), thisMonth: copy.workouts(overview.workoutsThisMonth) };
}

export function toHistoryScreen(result: WorkoutHistoryResult, overview: TrainingOverview | null, now: Date): HistoryScreen {
  if (!result.ok || !overview) {
    return { kind: 'error' };
  }
  if (result.workouts.length === 0) {
    return { kind: 'empty' };
  }
  const today = calendarDateOf(now);
  return {
    kind: 'ready',
    consistency: toConsistency(overview),
    groups: groupByCompletionDay(result.workouts, localDateOf).map((day) => ({
      key: toIsoCalendarDate(day.date) ?? `${day.date.year}-${day.date.month}-${day.date.day}`,
      label: dayLabel(day.date, today),
      items: day.workouts.map(toHistoryItem),
    })),
  };
}

// --- Recent workouts (Workout tab) --------------------------------------------------------

export interface RecentWorkoutView {
  readonly id: string;
  readonly title: string;
  /** "Today · 45 min" */
  readonly meta: string;
  readonly status: 'complete' | 'partial';
  readonly statusLabel: string;
}

export function toRecentWorkouts(workouts: readonly WorkoutLog[], now: Date, limit = 3): RecentWorkoutView[] {
  const today = calendarDateOf(now);
  return workouts.slice(0, limit).map((log) => {
    const item = toHistoryItem(log);
    const day = shortDayLabel(localDateOf(log.completedAt ?? log.startedAt), today);
    return {
      id: log.id,
      title: item.title,
      meta: `${day} · ${formatDuration(summarizeWorkoutLog(log).durationSeconds)}`,
      status: item.status,
      statusLabel: item.statusLabel,
    };
  });
}

// --- Historical workout detail ----------------------------------------------------------

export interface HistorySetView {
  readonly key: number;
  /** "Set 1" */
  readonly label: string;
  /** "60 kg × 8", "Skipped" or "Not done" */
  readonly value: string;
  readonly status: SetLog['status'];
}

export interface HistoryExerciseView {
  readonly key: string;
  /** "1. Bench Press" (the name recorded in the log) */
  readonly heading: string;
  readonly name: string;
  /** What the plan prescribed at the time: "4 sets · 6–10 reps · 120 sec rest" */
  readonly planned: string;
  /** The same as parts that must not break across lines. */
  readonly plannedParts: readonly string[];
  /** "All sets done" / "2 of 4 sets done" */
  readonly progress: string;
  readonly sets: readonly HistorySetView[];
}

export interface HistoryDetailView {
  readonly title: string;
  /** "Thursday, Oct 8 · 6:45 PM" */
  readonly completedLabel: string;
  readonly status: 'complete' | 'partial';
  readonly statusLabel: string;
  readonly facts: readonly { readonly key: string; readonly label: string; readonly value: string }[];
  readonly exercises: readonly HistoryExerciseView[];
}

function toHistorySet(set: SetLog, exercise: ExerciseLog, unit: WorkoutLog['weightUnit']): HistorySetView {
  const d = copy.detail;
  return {
    key: set.setNumber,
    label: WORKOUT_COPY.active.set(set.setNumber),
    value: set.status === 'completed' ? (formatSetValues(set, exercise.logging, unit) ?? '') : set.status === 'skipped' ? d.skipped : d.notDone,
    status: set.status,
  };
}

export function toHistoryDetail(log: WorkoutLog, now: Date): HistoryDetailView {
  const s = summarizeWorkoutLog(log);
  const status = completionStatus(log);
  const finishedAt = log.completedAt ?? log.startedAt;
  const summary = WORKOUT_COPY.summary;
  const facts: { key: string; label: string; value: string }[] = [
    { key: 'duration', label: summary.duration, value: formatDuration(s.durationSeconds) },
    { key: 'exercises', label: summary.exercises, value: summary.exercisesValue(s.exercisesCompleted, s.totalExercises) },
    { key: 'completed', label: summary.setsCompleted, value: `${s.setsCompleted}` },
    { key: 'skipped', label: summary.setsSkipped, value: `${s.setsSkipped}` },
  ];
  if (s.setsIncomplete > 0) {
    facts.push({ key: 'incomplete', label: summary.setsIncomplete, value: `${s.setsIncomplete}` });
  }
  return {
    title: titleFor(log.sessionType, log.variant),
    completedLabel: `${dayLabel(localDateOf(finishedAt), calendarDateOf(now))} · ${formatTime(finishedAt)}`,
    status,
    statusLabel: status === 'complete' ? copy.completed : copy.partial(s.setsCompleted, s.totalSets),
    facts,
    exercises: log.exercises.map((exercise, i) => {
      const done = exercise.sets.filter((set) => set.status === 'completed').length;
      return {
        key: `${i}-${exercise.exerciseId}`,
        heading: `${exercise.order}. ${exercise.name}`,
        name: exercise.name,
        planned: formatPrescription(exercise.planned),
        plannedParts: prescriptionParts(exercise.planned),
        progress: done === exercise.sets.length ? copy.detail.allSetsDone : copy.detail.setsDone(done, exercise.sets.length),
        sets: exercise.sets.map((set) => toHistorySet(set, exercise, log.weightUnit)),
      };
    }),
  };
}
