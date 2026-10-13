import { WorkoutHistoryResult } from '../../../core/workout/workout-history.service';
import { CalendarDate, calendarDateOf, compareCalendarDates } from '../../../domain/fitness-profile';
import { SESSION_TYPES, SessionType } from '../../../domain/workout-programming';
import {
  ExerciseLog,
  PerformedSet,
  SetLog,
  WorkoutLog,
  addDays,
  completionStatus,
  isBetterSet,
  summarizeWorkoutLog,
} from '../../../domain/workout-session';
import { formatSetValues } from '../active/active-workout-view-model';
import { formatDuration } from '../summary/workout-summary-view-model';
import { SESSION_TITLES, WORKOUT_COPY } from '../workout-content';
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
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
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

/** "Thu, 8 Oct" (the month group carries the year). */
export const compactDate = (date: CalendarDate) =>
  `${WEEKDAYS_SHORT[toLocalDate(date).getDay()]}, ${date.day} ${MONTHS[date.month - 1].slice(0, 3)}`;

/** "Thu, 8 Oct 2026" */
export const compactDateWithYear = (date: CalendarDate) => `${compactDate(date)} ${date.year}`;

export interface HistoryItemView {
  readonly id: string;
  readonly title: string;
  readonly sessionType: SessionType;
  /** "Thu, 8 Oct · 50 min" (recorded start to finish). */
  readonly meta: string;
  /** "7 exercises", or with the sets done when some weren't: "7 exercises · 16 of 22 sets". */
  readonly detail: string;
  readonly status: 'complete' | 'partial';
  /** One sentence for the card's button. */
  readonly accessibleLabel: string;
}

export interface HistoryMonthView {
  /** "2026-10" */
  readonly key: string;
  /** "October 2026" */
  readonly label: string;
  /** "4 workouts" */
  readonly countLabel: string;
  readonly items: readonly HistoryItemView[];
}

export type HistoryFilter = SessionType | 'all';

export interface HistoryFilterView {
  readonly value: HistoryFilter;
  readonly label: string;
}

export type HistoryScreen =
  | {
      readonly kind: 'ready';
      /** "All" plus each session type in the history; empty when there is only one type (nothing to filter). */
      readonly filters: readonly HistoryFilterView[];
      readonly months: readonly HistoryMonthView[];
    }
  | { readonly kind: 'empty' }
  | { readonly kind: 'error' };

export function toHistoryItem(log: WorkoutLog): HistoryItemView {
  const s = summarizeWorkoutLog(log);
  const status = completionStatus(log);
  const day = localDateOf(log.completedAt ?? log.startedAt);
  const duration = formatDuration(s.durationSeconds);
  const exercises = copy.exerciseCount(s.totalExercises);
  const detail = status === 'complete' ? exercises : `${exercises} · ${copy.setsOf(s.setsCompleted, s.totalSets)}`;
  const title = titleFor(log.sessionType, log.variant);
  return {
    id: log.id,
    title,
    sessionType: log.sessionType,
    meta: `${compactDate(day)} · ${duration}`,
    detail,
    status,
    accessibleLabel: `${title}, ${weekdayMonthDayYear.format(toLocalDate(day))}. ${duration}, ${detail}.`,
  };
}

/** Finished workouts (newest first, as the history service returns them) grouped by local month. */
export function toHistoryScreen(result: WorkoutHistoryResult): HistoryScreen {
  if (!result.ok) {
    return { kind: 'error' };
  }
  if (result.workouts.length === 0) {
    return { kind: 'empty' };
  }
  const types = SESSION_TYPES.filter((type) => result.workouts.some((log) => log.sessionType === type));
  return {
    kind: 'ready',
    filters: types.length > 1 ? [{ value: 'all', label: copy.all }, ...types.map((type) => ({ value: type, label: SESSION_TITLES[type] }))] : [],
    months: groupByMonth(result.workouts.map((log) => ({ log, item: toHistoryItem(log) }))),
  };
}

/** The months with only the workouts of one session type (months left empty are dropped). */
export function filterHistory(months: readonly HistoryMonthView[], filter: HistoryFilter): readonly HistoryMonthView[] {
  if (filter === 'all') {
    return months;
  }
  return months.flatMap((month) => {
    const items = month.items.filter((item) => item.sessionType === filter);
    return items.length > 0 ? [{ ...month, countLabel: copy.workouts(items.length), items }] : [];
  });
}

function groupByMonth(entries: readonly { log: WorkoutLog; item: HistoryItemView }[]): HistoryMonthView[] {
  const months: { key: string; date: CalendarDate; items: HistoryItemView[] }[] = [];
  for (const { log, item } of entries) {
    const date = localDateOf(log.completedAt ?? log.startedAt);
    const key = `${date.year}-${String(date.month).padStart(2, '0')}`;
    const month = months.find((m) => m.key === key);
    if (month) {
      month.items.push(item);
    } else {
      months.push({ key, date, items: [item] });
    }
  }
  return months.map(({ key, date, items }) => ({
    key,
    label: `${MONTHS[date.month - 1]} ${date.year}`,
    countLabel: copy.workouts(items.length),
    items,
  }));
}

// --- Historical workout detail ----------------------------------------------------------

export interface HistorySetView {
  readonly key: number;
  readonly setNumber: number;
  /** "Set 1" */
  readonly label: string;
  /** "60 kg × 8", "Skipped" or "Not done" */
  readonly value: string;
  readonly status: SetLog['status'];
}

export interface HistoryExerciseView {
  readonly key: string;
  readonly exerciseId: string;
  /** The name recorded in the log. */
  readonly name: string;
  /** "4 sets" (as logged; each one is listed with its result). */
  readonly setsLabel: string;
  /** The heaviest set (weight, then reps), most reps or longest time; null without a completed set. */
  readonly best: string | null;
  /** What the plan prescribed at the time: "4 sets · 6–10 reps · 120 sec rest" */
  readonly planned: string;
  /** The same as parts that must not break across lines. */
  readonly plannedParts: readonly string[];
  /** "All sets done" / "2 of 4 sets done" */
  readonly progress: string;
  readonly sets: readonly HistorySetView[];
}

export interface HistoryMetricView {
  readonly key: 'exercises' | 'sets' | 'volume';
  readonly value: string;
  readonly label: string;
}

export interface HistoryDetailView {
  readonly title: string;
  /** "Thu, 8 Oct 2026" */
  readonly dateLabel: string;
  /** "Thursday, Oct 8 · 6:45 PM" (spoken and on the summary). */
  readonly completedLabel: string;
  /** Recorded start to finish: "50 min". */
  readonly duration: string;
  readonly status: 'complete' | 'partial';
  readonly statusLabel: string;
  /** Exercises and sets done, and the training volume when weighted sets were done. */
  readonly metrics: readonly HistoryMetricView[];
  readonly facts: readonly { readonly key: string; readonly label: string; readonly value: string }[];
  readonly exercises: readonly HistoryExerciseView[];
}

function toHistorySet(set: SetLog, exercise: ExerciseLog, unit: WorkoutLog['weightUnit']): HistorySetView {
  const d = copy.detail;
  return {
    key: set.setNumber,
    setNumber: set.setNumber,
    label: WORKOUT_COPY.active.set(set.setNumber),
    value: set.status === 'completed' ? (formatSetValues(set, exercise.logging, unit) ?? '') : set.status === 'skipped' ? d.skipped : d.notDone,
    status: set.status,
  };
}

/** The exercise's best completed set by the domain's rule (ties go to the earlier set). */
function bestSet(exercise: ExerciseLog, unit: WorkoutLog['weightUnit']): string | null {
  const done = exercise.sets
    .filter((set) => set.status === 'completed')
    .map((set): PerformedSet & { log: SetLog } => ({ ...set, completedAt: set.completedAt ?? '', log: set }));
  if (done.length === 0) {
    return null;
  }
  const best = done.reduce((top, set) => (isBetterSet(exercise.logging, set, top) ? set : top));
  return formatSetValues(best.log, exercise.logging, unit);
}

/**
 * Weight × reps over the completed weighted sets, in the log's unit. Null when
 * there were none (bodyweight and timed work have no load to add up).
 */
export function trainingVolume(log: WorkoutLog): number | null {
  const sets = log.exercises
    .filter((e) => e.logging === 'weight-reps')
    .flatMap((e) => e.sets)
    .filter((s) => s.status === 'completed' && s.weight !== null && s.reps !== null);
  return sets.length > 0 ? sets.reduce((sum, s) => sum + (s.weight as number) * (s.reps as number), 0) : null;
}

const volumeFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export function toHistoryDetail(log: WorkoutLog, now: Date): HistoryDetailView {
  const s = summarizeWorkoutLog(log);
  const status = completionStatus(log);
  const finishedAt = log.completedAt ?? log.startedAt;
  const day = localDateOf(finishedAt);
  const summary = WORKOUT_COPY.summary;
  const d = copy.detail;
  const volume = trainingVolume(log);
  const metrics: HistoryMetricView[] = [
    {
      key: 'exercises',
      value: s.exercisesCompleted === s.totalExercises ? `${s.totalExercises}` : `${s.exercisesCompleted}/${s.totalExercises}`,
      label: d.exercisesMetric,
    },
    { key: 'sets', value: `${s.setsCompleted}`, label: d.setsMetric },
  ];
  if (volume !== null && volume > 0) {
    metrics.push({ key: 'volume', value: volumeFormat.format(volume), label: d.volumeMetric(log.weightUnit) });
  }
  const facts: { key: string; label: string; value: string }[] = [
    { key: 'duration', label: summary.duration, value: formatDuration(s.durationSeconds) },
    { key: 'exercises', label: summary.exercises, value: summary.exercisesValue(s.exercisesCompleted, s.totalExercises) },
    { key: 'completed', label: summary.setsCompleted, value: `${s.setsCompleted}` },
    { key: 'skipped', label: summary.setsSkipped, value: `${s.setsSkipped}` },
  ];
  if (s.setsIncomplete > 0) {
    facts.push({ key: 'incomplete', label: summary.setsIncomplete, value: `${s.setsIncomplete}` });
  }
  if (volume !== null && volume > 0) {
    facts.push({ key: 'volume', label: d.volumeMetric(log.weightUnit), value: volumeFormat.format(volume) });
  }
  return {
    title: titleFor(log.sessionType, log.variant),
    dateLabel: compactDateWithYear(day),
    completedLabel: `${dayLabel(day, calendarDateOf(now))} · ${formatTime(finishedAt)}`,
    duration: formatDuration(s.durationSeconds),
    status,
    statusLabel: status === 'complete' ? copy.completed : copy.partial(s.setsCompleted, s.totalSets),
    metrics,
    facts,
    exercises: log.exercises.map((exercise, i) => {
      const done = exercise.sets.filter((set) => set.status === 'completed').length;
      return {
        key: `${i}-${exercise.exerciseId}`,
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        setsLabel: copy.sets(exercise.sets.length),
        best: bestSet(exercise, log.weightUnit),
        planned: formatPrescription(exercise.planned),
        plannedParts: prescriptionParts(exercise.planned),
        progress: done === exercise.sets.length ? d.allSetsDone : d.setsDone(done, exercise.sets.length),
        sets: exercise.sets.map((set) => toHistorySet(set, exercise, log.weightUnit)),
      };
    }),
  };
}
