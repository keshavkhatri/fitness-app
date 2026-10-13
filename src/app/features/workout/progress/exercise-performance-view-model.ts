import { CalendarDate, calendarDateOf, compareCalendarDates } from '../../../domain/fitness-profile';
import { ExercisePerformance, ExercisePerformanceSession, LoggingMode, isBetterSet, sessionVolume, topSet } from '../../../domain/workout-session';
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
const localDateOf = (instant: string) => calendarDateOf(new Date(instant));

// --- Ranges -------------------------------------------------------------------------------------

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

/**
 * The ranges worth offering: each shorter range that holds at least one
 * session and fewer than the next shorter one doesn't (no two ranges showing
 * the same sessions), and never one equal to all time; then All.
 */
export function availableRanges(performance: ExercisePerformance, today: CalendarDate): PerformanceRange[] {
  const total = performance.sessions.length;
  const ranges: PerformanceRange[] = [];
  let previous = 0;
  for (const range of PERFORMANCE_RANGES.slice(0, -1) as PerformanceRange[]) {
    const count = performance.sessions.filter((s) => inRange(s, performanceRangeStart(range, today))).length;
    if (count > 0 && count > previous && count < total) {
      ranges.push(range);
      previous = count;
    }
  }
  return [...ranges, 'all'];
}

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

// --- Chart geometry ---------------------------------------------------------------------------

export const PERFORMANCE_CHART = { width: 320, height: 180, left: 36, right: 14, top: 16, bottom: 26 } as const;

export interface PerformanceChartView {
  readonly points: readonly { readonly key: string; readonly x: number; readonly y: number }[];
  /** Polyline points, chronological; empty with one point. */
  readonly path: string;
  readonly yTicks: readonly { readonly y: number; readonly label: string }[];
  readonly xLabels: readonly { readonly x: number; readonly label: string; readonly anchor: 'start' | 'middle' | 'end' }[];
  /** The latest point's value, shown next to it. */
  readonly latest: { readonly x: number; readonly y: number; readonly value: string; readonly date: string };
  readonly unit: string;
}

const STEPS = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
const dayNumber = (d: CalendarDate) => Date.UTC(d.year, d.month - 1, d.day) / 86_400_000;
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const dateText = (d: CalendarDate) => shortDate.format(new Date(d.year, d.month - 1, d.day));
const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Axis bounds containing the values with at least 20% of the largest value
 * as span (small differences aren't blown up into steep slopes), on a round
 * step; never below zero.
 */
export function performanceAxis(values: readonly number[]): { min: number; max: number; step: number } {
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const minSpan = Math.max(hi * 0.2, 1);
  if (hi - lo < minSpan) {
    const mid = (lo + hi) / 2;
    lo = Math.max(0, mid - minSpan / 2);
    hi = lo + minSpan;
  }
  const step = STEPS.find((s) => (hi - lo) / s <= 4) ?? STEPS[STEPS.length - 1];
  return { min: Math.max(0, Math.floor(lo / step) * step), max: Math.ceil(hi / step) * step, step };
}

function toChart(entries: readonly { date: CalendarDate; value: number; key: string }[], start: CalendarDate, today: CalendarDate, unit: string): PerformanceChartView {
  const c = PERFORMANCE_CHART;
  const plotW = c.width - c.left - c.right;
  const plotH = c.height - c.top - c.bottom;
  const startDay = dayNumber(start);
  const endDay = Math.max(dayNumber(today), startDay + 1);
  const axis = performanceAxis(entries.map((e) => e.value));
  const xOf = (d: CalendarDate) => c.left + ((dayNumber(d) - startDay) / (endDay - startDay)) * plotW;
  const yOf = (v: number) => c.top + (1 - (v - axis.min) / (axis.max - axis.min)) * plotH;
  const points = entries.map((e) => ({ key: e.key, x: round(xOf(e.date)), y: round(yOf(e.value)) }));
  const yTicks = [];
  for (let v = axis.min; v <= axis.max + axis.step / 2; v += axis.step) {
    yTicks.push({ y: round(yOf(v)), label: grouped.format(v) });
  }
  const last = entries[entries.length - 1];
  const lastPoint = points[points.length - 1];
  return {
    points,
    path: points.length > 1 ? points.map((p) => `${p.x},${p.y}`).join(' ') : '',
    yTicks,
    xLabels: [
      { x: c.left, label: dateText(start), anchor: 'start' },
      { x: c.width - c.right, label: WORKOUT_COPY.history.today, anchor: 'end' },
    ],
    latest: { x: lastPoint.x, y: lastPoint.y, value: formatMetric(last.value, unit), date: dateText(last.date) },
    unit,
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
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
  const ranges = availableRanges(performance, today);
  const range = ranges.includes(requested.range) ? requested.range : 'all';
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
    ranges,
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
    chart: entries.length ? toChart(entries, start ?? entries[0].date, today, unit) : null,
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
