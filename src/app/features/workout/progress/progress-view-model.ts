import { BodyCompositionHistoryState } from '../../../core/body-composition/body-composition-history.service';
import { WeightHistoryState } from '../../../core/body-measurements/weight-history.service';
import { WorkoutHistoryResult } from '../../../core/workout/workout-history.service';
import { BodyCompositionMetric, latestReportedValues, metricChange } from '../../../domain/body-composition';
import { weightHistory } from '../../../domain/body-measurements';
import { CalendarDate, IsoCalendarDate, calendarDateOf, compareCalendarDates, parseIsoCalendarDate } from '../../../domain/fitness-profile';
import {
  LoggingMode,
  PerformedSet,
  WeightUnit,
  addDays,
  firstTrainingDate,
  performedExercises,
  startOfWeek,
  totalVolumeByUnit,
  trainingOverview,
  weeklyWorkoutCounts,
} from '../../../domain/workout-session';
import { formatReportedValue } from '../../body-composition/body-composition-history-view-model';
import { formatChange, formatDisplayWeight } from '../../body-weight/weight-history-view-model';
import { formatDuration } from '../summary/workout-summary-view-model';
import { WORKOUT_COPY } from '../workout-content';

/**
 * Presentation models for the Progress overview. Everything shown is
 * something the user recorded (weigh-ins, body-composition reports, finished
 * workouts); nothing is estimated. Calculations live in the domain; dates are
 * formatted here in local time.
 */

const copy = WORKOUT_COPY.progress;
const localDateOf = (instant: string) => calendarDateOf(new Date(instant));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "8 Oct", or "30 Dec 2025" outside the current year (the mockup's day-month form). */
export function dayMonth(date: CalendarDate, today: CalendarDate): string {
  return `${date.day} ${MONTHS[date.month - 1]}${date.year === today.year ? '' : ` ${date.year}`}`;
}

/** The same from an ISO calendar date ("2026-10-01" → "1 Oct"). */
const isoDayMonth = (iso: IsoCalendarDate, today: IsoCalendarDate): string => {
  const d = parseIsoCalendarDate(iso);
  const t = parseIsoCalendarDate(today);
  return d && t ? dayMonth(d, t) : iso;
};

/** "Today", "Yesterday", "8 Oct" (with the year when it isn't this year). */
export function performedOnLabel(date: CalendarDate, today: CalendarDate): string {
  if (compareCalendarDates(date, today) === 0) {
    return WORKOUT_COPY.history.today;
  }
  if (compareCalendarDates(date, addDays(today, -1)) === 0) {
    return WORKOUT_COPY.history.yesterday;
  }
  return dayMonth(date, today);
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

// --- Body metrics -----------------------------------------------------------------------------

export interface BodyMetricView {
  readonly key: 'weight' | 'body-fat' | 'muscle';
  readonly label: string;
  /** "72.4" and "kg" (the unit as recorded), or null when nothing was recorded. */
  readonly value: string | null;
  readonly unit: string;
  /** Difference from the previous recording; null with a single recording (or different units). */
  readonly change: { readonly text: string; readonly spoken: string; readonly direction: 'up' | 'down' | 'same' } | null;
  /** "vs Oct 1" (the previous recording's date), "Oct 8" (only one), or "Not recorded". */
  readonly caption: string;
}

const splitValue = (text: string): { value: string; unit: string } => {
  const match = /^(.*?)\s*(kg|lb|%)$/.exec(text);
  return match ? { value: match[1], unit: match[2] } : { value: text, unit: '' };
};

const direction = (n: number): 'up' | 'down' | 'same' => (n > 0 ? 'up' : n < 0 ? 'down' : 'same');

function weightMetric(state: WeightHistoryState, today: IsoCalendarDate): BodyMetricView {
  const base = { key: 'weight' as const, label: copy.body.weight };
  if (state.status !== 'ready' || state.entries.length === 0) {
    return { ...base, value: null, unit: '', change: null, caption: copy.body.notRecorded };
  }
  const [latest, previous] = weightHistory(state.entries, state.unitSystem);
  const shown = splitValue(formatDisplayWeight(latest.displayWeight, state.unitSystem));
  if (!previous || latest.changeSincePrevious === null) {
    return { ...base, ...shown, change: null, caption: isoDayMonth(latest.entry.date, today) };
  }
  const change = latest.changeSincePrevious + 0;
  const text = change === 0 ? copy.body.noChange : formatChange(change, state.unitSystem);
  return {
    ...base,
    ...shown,
    change: { text, spoken: text, direction: direction(change) },
    caption: copy.body.vs(isoDayMonth(previous.entry.date, today)),
  };
}

function compositionMetric(
  state: BodyCompositionHistoryState,
  metric: BodyCompositionMetric,
  key: 'body-fat' | 'muscle',
  label: string,
  today: IsoCalendarDate,
): BodyMetricView {
  const base = { key, label };
  const latest = state.status === 'ready' ? latestReportedValues(state.assessments).find((l) => l.metric === metric) : undefined;
  if (state.status !== 'ready' || !latest?.value || !latest.assessment) {
    return { ...base, value: null, unit: '', change: null, caption: copy.body.notRecorded };
  }
  const shown = splitValue(formatReportedValue(latest.value));
  const difference = metricChange(state.assessments, metric);
  if (!difference || difference.kind !== 'change') {
    return { ...base, ...shown, change: null, caption: isoDayMonth(latest.assessment.date, today) };
  }
  const points = difference.unit === '%';
  const magnitude = `${Math.abs(difference.change)}`;
  const sign = difference.change > 0 ? '+' : '−';
  const text = difference.change === 0 ? copy.body.noChange : `${sign}${magnitude}${points ? ' pts' : ` ${difference.unit}`}`;
  const spoken = difference.change === 0 ? copy.body.noChange : `${sign}${magnitude} ${points ? 'percentage points' : difference.unit}`;
  return {
    ...base,
    ...shown,
    change: { text, spoken, direction: direction(difference.change) },
    caption: copy.body.vs(isoDayMonth(difference.previous.date, today)),
  };
}

export function toBodyMetrics(weights: WeightHistoryState, composition: BodyCompositionHistoryState, today: IsoCalendarDate): readonly BodyMetricView[] {
  return [
    weightMetric(weights, today),
    compositionMetric(composition, 'body-fat-percentage', 'body-fat', copy.body.bodyFat, today),
    compositionMetric(composition, 'skeletal-muscle-mass', 'muscle', copy.body.muscle, today),
  ];
}

// --- Workout consistency -------------------------------------------------------------------------

/** Weeks the consistency chart looks back over (this week included). */
export const CONSISTENCY_WEEKS = 12;

export interface ConsistencyWeekView {
  readonly key: string;
  readonly workouts: number;
  /** Bar height 0..1, against the larger of the plan's weekly sessions and the busiest week. */
  readonly height: number;
  readonly isCurrent: boolean;
  /** "Week of Sep 28: 2 workouts" */
  readonly spoken: string;
}

export interface ConsistencyView {
  /** Weeks with at least one workout, and the weeks counted (never before the first workout). */
  readonly activeWeeks: number;
  readonly weeksCounted: number;
  /** Rounded share of counted weeks with a workout, 0–100. */
  readonly percent: number;
  /** "8 of 12 weeks" */
  readonly summary: string;
  readonly weeks: readonly ConsistencyWeekView[];
  /** The current plan's resistance sessions per week, as a reference line (0..1 height); null without a plan. */
  readonly planned: { readonly perWeek: number; readonly height: number; readonly label: string } | null;
  /** First and last week labels for the axis. */
  readonly axis: { readonly start: string; readonly end: string };
}

const weekLabel = (date: CalendarDate) => `${date.day} ${MONTHS[date.month - 1]}`;

/**
 * Finished training workouts per Monday–Sunday week over the last
 * CONSISTENCY_WEEKS weeks, starting no earlier than the week of the first
 * workout (weeks before it are unknown, not inactive). Null without workouts.
 */
export function toConsistency(result: WorkoutHistoryResult & { ok: true }, plannedPerWeek: number | null, now: Date): ConsistencyView | null {
  const today = calendarDateOf(now);
  const localDate = (instant: string) => calendarDateOf(new Date(instant));
  const first = firstTrainingDate(result.workouts, localDate);
  if (!first) {
    return null;
  }
  const sinceFirst = Math.floor((daysBetween(startOfWeek(first), startOfWeek(today))) / 7) + 1;
  const weeksCounted = Math.min(CONSISTENCY_WEEKS, sinceFirst);
  const counts = weeklyWorkoutCounts(result.workouts, today, weeksCounted, localDate);
  const scale = Math.max(plannedPerWeek ?? 0, ...counts.map((c) => c.workouts), 1);
  const activeWeeks = counts.filter((c) => c.workouts > 0).length;
  const current = startOfWeek(today);
  return {
    activeWeeks,
    weeksCounted,
    percent: Math.round((activeWeeks / weeksCounted) * 100),
    summary: copy.consistency.summary(activeWeeks, weeksCounted),
    weeks: counts.map((c) => ({
      key: `${c.weekStart.year}-${c.weekStart.month}-${c.weekStart.day}`,
      workouts: c.workouts,
      height: c.workouts / scale,
      isCurrent: compareCalendarDates(c.weekStart, current) === 0,
      spoken: copy.consistency.spokenWeek(weekLabel(c.weekStart), c.workouts, compareCalendarDates(c.weekStart, current) === 0),
    })),
    planned: plannedPerWeek ? { perWeek: plannedPerWeek, height: plannedPerWeek / scale, label: copy.consistency.planned(plannedPerWeek) } : null,
    axis: { start: weekLabel(counts[0].weekStart), end: copy.consistency.thisWeek },
  };
}

const daysBetween = (a: CalendarDate, b: CalendarDate) =>
  Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);

// --- Key workout metrics -------------------------------------------------------------------------

export interface KeyMetricView {
  readonly key: 'workouts' | 'volume' | 'duration';
  readonly label: string;
  readonly value: string;
  /** What the number covers: "All time", "kg sets, all time". */
  readonly caption: string;
}

/** Whole units: a total of thousands loses nothing by dropping half a kilo. */
const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/**
 * - Workouts: finished workouts with at least one completed set, all time.
 * - Volume: weight × reps of completed weighted sets, all time, in the unit of
 *   the latest workout (kg and lb are never added together; the caption says
 *   which). Omitted without weighted sets.
 * - Average duration: start-to-finish time of those workouts, averaged.
 */
export function toKeyMetrics(result: WorkoutHistoryResult & { ok: true }, now: Date): readonly KeyMetricView[] {
  const overview = trainingOverview(result.workouts, calendarDateOf(now), (i) => calendarDateOf(new Date(i)));
  if (overview.workoutsCompleted === 0) {
    return [];
  }
  const metrics: KeyMetricView[] = [{ key: 'workouts', label: copy.metrics.workouts, value: `${overview.workoutsCompleted}`, caption: copy.metrics.allTime }];
  const volumes = totalVolumeByUnit(result.workouts);
  const unit: WeightUnit = overview.lastWorkout?.weightUnit ?? 'kg';
  const volume = volumes[unit];
  if (volume) {
    const otherUnit = (Object.keys(volumes) as WeightUnit[]).some((u) => u !== unit);
    metrics.push({
      key: 'volume',
      label: copy.metrics.volume,
      value: `${grouped.format(volume)} ${unit}`,
      caption: otherUnit ? copy.metrics.unitOnly(unit) : copy.metrics.allTime,
    });
  }
  metrics.push({
    key: 'duration',
    label: copy.metrics.duration,
    value: formatDuration(overview.totalDurationSeconds / overview.workoutsCompleted),
    caption: copy.metrics.perWorkout,
  });
  return metrics;
}

// --- The overview ------------------------------------------------------------------------------

export type ProgressWorkoutsView =
  | {
      readonly kind: 'ready';
      readonly consistency: ConsistencyView;
      readonly metrics: readonly KeyMetricView[];
      /** Some exercise has completed sets (the rows themselves come from the exercise list model). */
      readonly hasExercises: boolean;
    }
  | { readonly kind: 'empty' }
  | { readonly kind: 'error' };

export function toProgressWorkouts(result: WorkoutHistoryResult, plannedPerWeek: number | null, now: Date): ProgressWorkoutsView {
  if (!result.ok) {
    return { kind: 'error' };
  }
  const consistency = toConsistency(result, plannedPerWeek, now);
  if (!consistency) {
    return { kind: 'empty' };
  }
  return { kind: 'ready', consistency, metrics: toKeyMetrics(result, now), hasExercises: performedExercises(result.workouts).length > 0 };
}
