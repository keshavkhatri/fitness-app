import { CalendarDate, calendarDateOf, compareCalendarDates } from '../../../domain/fitness-profile';
import { ExercisePerformance, ExercisePerformanceSession, LoggingMode, isBetterSet, sessionVolume, topSet } from '../../../domain/workout-session';
import { PointChartPoint, pointDateLines } from '../../../shared/ui';
import { WORKOUT_COPY } from '../workout-content';
import { comparableSessions, formatTrendChange } from './exercise-list-view-model';
import { formatPerformedSet } from './progress-view-model';

/**
 * One exercise over time: a time range, a chart of one recorded metric per
 * session, the best set in the range, and the sessions themselves (each
 * linked to its workout). Charted values are recorded values only: there is
 * no estimated one-rep max in this app, so none is shown.
 *
 * Only sessions comparable with the latest one (same logging mode and weight
 * unit) are charted, so kg and lb are never on one axis; the session list
 * shows every session in the range.
 */

const copy = WORKOUT_COPY.progress.detail;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const localDateOf = (instant: string) => calendarDateOf(new Date(instant));

// --- Ranges -------------------------------------------------------------------------------------

/** All offered on every exercise, so the control keeps its shape; an empty range says so. */
export const PERFORMANCE_RANGES = ['1m', '3m', '6m', '1y', 'all'] as const;
export type PerformanceRange = (typeof PERFORMANCE_RANGES)[number];
const RANGE_MONTHS: Readonly<Record<Exclude<PerformanceRange, 'all'>, number>> = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 };

/**
 * First local date inside the range (inclusive): the same day of the month N
 * months before today (clamped to the month's last day). Null for all time.
 */
export function performanceRangeStart(range: PerformanceRange, today: CalendarDate): CalendarDate | null {
  if (range === 'all') {
    return null;
  }
  const target = new Date(today.year, today.month - 1 - RANGE_MONTHS[range], 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return { year: target.getFullYear(), month: target.getMonth() + 1, day: Math.min(today.day, lastDay) };
}

const inRange = (session: ExercisePerformanceSession, start: CalendarDate | null) =>
  start === null || compareCalendarDates(localDateOf(session.completedAt), start) >= 0;

// --- Metrics --------------------------------------------------------------------------------------

export type PerformanceMetric = 'weight' | 'volume' | 'reps' | 'time';

/** What can be charted for a logging mode, the first being the default. */
export function metricsFor(logging: LoggingMode): PerformanceMetric[] {
  switch (logging) {
    case 'duration':
      return ['time'];
    case 'reps':
      return ['reps'];
    default:
      return ['weight', 'volume', 'reps'];
  }
}

/**
 * One value per session:
 * - weight: the top set's weight (heaviest, then most reps);
 * - volume: weight × reps over the session's completed sets;
 * - reps: the most reps in one completed set;
 * - time: the longest completed set.
 */
export function metricValue(session: ExercisePerformanceSession, metric: PerformanceMetric): number | null {
  switch (metric) {
    case 'weight':
      return topSet(session).weight;
    case 'volume':
      return sessionVolume(session);
    case 'reps': {
      const reps = session.sets.map((s) => s.reps).filter((r): r is number => r !== null);
      return reps.length ? Math.max(...reps) : null;
    }
    case 'time': {
      const times = session.sets.map((s) => s.durationSeconds).filter((t): t is number => t !== null);
      return times.length ? Math.max(...times) : null;
    }
  }
}

const metricUnit = (metric: PerformanceMetric, session: ExercisePerformanceSession) =>
  metric === 'reps' ? 'reps' : metric === 'time' ? 'sec' : session.weightUnit;

const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const formatMetric = (value: number, unit: string) => `${grouped.format(value)} ${unit}`;

// --- Chart ------------------------------------------------------------------------------------

/** The sessions as a labelled point chart: each value above its point, its date below. */
export interface PerformanceChartView {
  readonly points: readonly PointChartPoint[];
  /** "kg", "reps", "sec". */
  readonly unit: string;
  /** At least 20% of the largest value (and 1), so small differences aren't blown up into steep slopes. */
  readonly minSpan: number;
}

/** "24 Sep" */
const dateText = (d: CalendarDate) => `${d.day} ${MONTHS[d.month - 1]}`;
const isoOf = (d: CalendarDate) => `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

function toChart(entries: readonly { date: CalendarDate; value: number; key: string }[], today: CalendarDate, unit: string): PerformanceChartView {
  const lines = pointDateLines(
    entries.map((e) => isoOf(e.date)),
    isoOf(today),
  );
  return {
    points: entries.map((e) => ({ key: e.key, value: e.value, valueText: grouped.format(e.value), ...lines(isoOf(e.date)) })),
    unit,
    minSpan: Math.max(Math.max(...entries.map((e) => e.value)) * 0.2, 1),
  };
}

// --- The screen ---------------------------------------------------------------------------------

export interface PerformanceSessionRowView {
  readonly key: string;
  readonly workoutId: string;
  /** "8 Oct 2026" */
  readonly dateLabel: string;
  /** "4 sets · 6–8 reps" (as completed). */
  readonly detail: string;
  /** The session's value for the chosen metric: "100 kg"; null when it has none. */
  readonly value: string | null;
  readonly accessibleLabel: string;
}

export interface ExercisePerformanceView {
  readonly name: string;
  readonly ranges: readonly PerformanceRange[];
  readonly range: PerformanceRange;
  readonly metrics: readonly PerformanceMetric[];
  readonly metric: PerformanceMetric;
  /** The best set in the range (domain rule), with its date; null without sessions in the range. */
  readonly best: { readonly value: string; readonly date: string } | null;
  /** Latest − first charted value in the range; null with fewer than two. */
  readonly change: { readonly text: string; readonly since: string; readonly direction: 'up' | 'down' | 'same' } | null;
  /** Null without a charted value in the range. */
  readonly chart: PerformanceChartView | null;
  /** "Max weight, last 3 months: 4 sessions, from 90 kg on Sep 10 to 100 kg on Oct 8." */
  readonly chartLabel: string;
  /** Every session in the range, newest first. */
  readonly sessions: readonly PerformanceSessionRowView[];
}

/** "8 Oct 2026" (the app's day-month-year form). */
const longDate = (d: CalendarDate) => `${d.day} ${MONTHS[d.month - 1]} ${d.year}`;

function sessionDetail(session: ExercisePerformanceSession): string {
  const count = session.sets.length;
  const sets = `${count} ${count === 1 ? 'set' : 'sets'}`;
  if (session.logging === 'duration') {
    return sets;
  }
  const reps = session.sets.map((s) => s.reps).filter((r): r is number => r !== null);
  if (!reps.length) {
    return sets;
  }
  const lo = Math.min(...reps);
  const hi = Math.max(...reps);
  return `${sets} · ${lo === hi ? lo : `${lo}–${hi}`} reps`;
}

export function toExercisePerformanceView(
  performance: ExercisePerformance,
  requested: { range: PerformanceRange; metric: PerformanceMetric | null },
  now: Date,
): ExercisePerformanceView {
  const today = calendarDateOf(now);
  const range = requested.range;
  const latest = performance.sessions[0];
  const metrics = metricsFor(latest.logging);
  const metric = requested.metric && metrics.includes(requested.metric) ? requested.metric : metrics[0];
  const start = performanceRangeStart(range, today);
  const sessions = performance.sessions.filter((s) => inRange(s, start));

  // Charted: comparable sessions in the range, oldest first, with a value for the metric.
  const comparable = comparableSessions(performance, performance.sessions.length).filter((s) => inRange(s, start));
  const entries = comparable
    .map((s) => ({ key: s.workoutId, date: localDateOf(s.completedAt), value: metricValue(s, metric) }))
    .filter((e): e is { key: string; date: CalendarDate; value: number } => e.value !== null);
  const unit = metricUnit(metric, latest);

  let best: ExercisePerformanceView['best'] = null;
  if (comparable.length) {
    let top = { set: topSet(comparable[0]), session: comparable[0] };
    for (const s of comparable) {
      const candidate = topSet(s);
      if (isBetterSet(s.logging, candidate, top.set)) {
        top = { set: candidate, session: s };
      }
    }
    best = { value: formatPerformedSet(top.set, top.session.logging, top.session.weightUnit), date: longDate(localDateOf(top.session.completedAt)) };
  }

  const first = entries[0];
  const last = entries[entries.length - 1];
  const difference = entries.length > 1 ? Math.round((last.value - first.value) * 100) / 100 + 0 : null;
  const metricName = copy.metrics[metric];
  const rangeName = copy.rangeNames[range];

  return {
    name: performance.exerciseName,
    ranges: PERFORMANCE_RANGES,
    range,
    metrics,
    metric,
    best,
    change:
      difference === null
        ? null
        : {
            text: formatTrendChange(difference, unit),
            since: copy.since(dateText(first.date)),
            direction: difference > 0 ? 'up' : difference < 0 ? 'down' : 'same',
          },
    chart: entries.length ? toChart(entries, today, unit) : null,
    chartLabel: entries.length
      ? `${metricName}, ${rangeName}: ${entries.length === 1 ? `1 session, ${formatMetric(first.value, unit)} on ${dateText(first.date)}` : `${entries.length} sessions, from ${formatMetric(first.value, unit)} on ${dateText(first.date)} to ${formatMetric(last.value, unit)} on ${dateText(last.date)}`}.`
      : copy.emptyRange,
    sessions: sessions.map((s) => {
      const day = localDateOf(s.completedAt);
      const value = metricValue(s, metric);
      const valueText = value === null ? null : formatMetric(value, metricUnit(metric, s));
      const dateLabel = longDate(day);
      const detail = sessionDetail(s);
      return {
        key: s.workoutId,
        workoutId: s.workoutId,
        dateLabel,
        detail,
        value: valueText,
        accessibleLabel: `${dateLabel}. ${detail}${valueText ? `. ${metricName} ${valueText}` : ''}. ${copy.openWorkout(dateLabel)}`,
      };
    }),
  };
}
