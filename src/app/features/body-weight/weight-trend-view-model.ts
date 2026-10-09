import { WeightRange, WeightRangeSummary } from '../../domain/body-measurements';
import { IsoCalendarDate, UnitSystem, parseIsoCalendarDate } from '../../domain/fitness-profile';
import { dayLabel } from '../workout/history/history-view-model';
import { WEIGHT_HISTORY_COPY } from './weight-history-content';
import { formatChange, formatDisplayWeight } from './weight-history-view-model';

/**
 * Presentation of a weight range: the summary (from the domain's
 * weightRangeSummary) and the chart geometry. Pure; the chart component only
 * draws what this returns.
 */

const copy = WEIGHT_HISTORY_COPY.trend;

/** "Today", "Yesterday", "Monday, Oct 5" (the app's day labels). */
export function trendDateLabel(date: IsoCalendarDate, today: IsoCalendarDate): string {
  const d = parseIsoCalendarDate(date);
  const t = parseIsoCalendarDate(today);
  return d && t ? dayLabel(d, t) : date;
}

const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const monthDayYear = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** Short axis label: "Today", "Sep 10", or "Sep 10, 2025" outside the current year. */
export function axisDateLabel(date: IsoCalendarDate, today: IsoCalendarDate): string {
  const d = parseIsoCalendarDate(date);
  const t = parseIsoCalendarDate(today);
  if (!d || !t) {
    return date;
  }
  if (date === today) {
    return WEIGHT_HISTORY_COPY.trend.today;
  }
  const utc = new Date(Date.UTC(d.year, d.month - 1, d.day));
  return (d.year === t.year ? monthDay : monthDayYear).format(utc);
}

export interface TrendMeasurementView {
  readonly key: string;
  readonly weight: string;
  readonly dateLabel: string;
}

export interface TrendSummaryView {
  readonly first: TrendMeasurementView;
  readonly latest: TrendMeasurementView;
  /** "−1.3 kg", or null with a single measurement (no difference to show). */
  readonly change: string | null;
  readonly changeCaption: string;
  /** Every measurement in the range, oldest first (for screen readers and the chart). */
  readonly measurements: readonly TrendMeasurementView[];
  /** One sentence describing the range, for the chart's accessible name. */
  readonly description: string;
}

export function toTrendSummary(summary: WeightRangeSummary, range: WeightRange, unitSystem: UnitSystem, today: IsoCalendarDate): TrendSummaryView {
  const measurements = summary.points.map((p) => ({
    key: p.entry.id,
    weight: formatDisplayWeight(p.value, unitSystem),
    dateLabel: trendDateLabel(p.entry.date, today),
  }));
  const first = measurements[0];
  const latest = measurements[measurements.length - 1];
  const single = measurements.length === 1;
  const change = single ? null : summary.netChange === 0 ? copy.noChange : formatChange(summary.netChange, unitSystem);
  const rangeName = copy.rangeNames[range];
  const description = single
    ? copy.describeOne(rangeName, first.weight, first.dateLabel)
    : copy.describeMany(rangeName, measurements.length, first.weight, first.dateLabel, latest.weight, latest.dateLabel, change ?? '');
  return {
    first,
    latest,
    change,
    changeCaption: single ? copy.singleCaption : copy.changeCaption,
    measurements,
    description,
  };
}

// --- Chart geometry ----------------------------------------------------------------------

/** SVG viewBox and plot area (user units; the SVG scales to the card width). */
export const CHART = { width: 320, height: 176, left: 40, right: 12, top: 12, bottom: 28 } as const;

/**
 * Smallest vertical span shown, so small differences aren't exaggerated into
 * steep slopes (about 4 kg either way).
 */
const MIN_SPAN: Readonly<Record<UnitSystem, number>> = { metric: 4, imperial: 10 };
const STEPS = [0.5, 1, 2, 5, 10, 20, 50, 100];

export interface ChartPoint {
  readonly key: string;
  readonly x: number;
  readonly y: number;
}

export interface WeightChartView {
  readonly points: readonly ChartPoint[];
  /** SVG polyline `points` attribute (chronological); empty for a single point. */
  readonly path: string;
  readonly yTicks: readonly { readonly y: number; readonly label: string }[];
  readonly xLabels: readonly { readonly x: number; readonly label: string; readonly anchor: 'start' | 'end' }[];
  readonly unit: string;
}

const dayNumber = (iso: IsoCalendarDate): number => {
  const d = parseIsoCalendarDate(iso);
  return d ? Date.UTC(d.year, d.month - 1, d.day) / 86_400_000 : Number.NaN;
};

/** Evenly spaced axis bounds that contain [min, max] and span at least the unit's minimum. */
export function yAxis(values: readonly number[], unitSystem: UnitSystem): { min: number; max: number; step: number } {
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const minSpan = MIN_SPAN[unitSystem];
  if (hi - lo < minSpan) {
    const mid = (lo + hi) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const step = STEPS.find((s) => (hi - lo) / s <= 4) ?? STEPS[STEPS.length - 1];
  return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step };
}

/**
 * Point positions: x by measurement date across the window (start..today,
 * one slot per calendar day), y by displayed weight. Same-day measurements
 * share their day's slot, spread in recorded order, so none is hidden or
 * merged. Throws on unusable input; callers fall back to the text summary.
 */
export function toWeightChart(
  summary: WeightRangeSummary,
  windowStart: IsoCalendarDate | null,
  today: IsoCalendarDate,
  unitSystem: UnitSystem,
  labels: { readonly start: string; readonly end: string },
): WeightChartView {
  const startDay = dayNumber(windowStart ?? summary.first.entry.date);
  const endDay = dayNumber(today) + 1; // today's slot is included
  if (!Number.isFinite(startDay) || !Number.isFinite(endDay) || endDay <= startDay) {
    throw new Error('Invalid chart window');
  }
  const plotW = CHART.width - CHART.left - CHART.right;
  const plotH = CHART.height - CHART.top - CHART.bottom;
  const axis = yAxis(summary.points.map((p) => p.value), unitSystem);
  const xOf = (day: number) => CHART.left + ((day - startDay) / (endDay - startDay)) * plotW;
  const yOf = (value: number) => CHART.top + (1 - (value - axis.min) / (axis.max - axis.min)) * plotH;

  const perDay = new Map<string, number>();
  for (const p of summary.points) {
    perDay.set(p.entry.date, (perDay.get(p.entry.date) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const points = summary.points.map((p) => {
    const i = seen.get(p.entry.date) ?? 0;
    seen.set(p.entry.date, i + 1);
    const slot = (i + 1) / ((perDay.get(p.entry.date) ?? 1) + 1);
    return { key: p.entry.id, x: round(xOf(dayNumber(p.entry.date) + slot)), y: round(yOf(p.value)) };
  });

  const yTicks = [];
  for (let v = axis.min; v <= axis.max + axis.step / 2; v += axis.step) {
    yTicks.push({ y: round(yOf(v)), label: Number(v.toFixed(1)).toString() });
  }
  return {
    points,
    path: points.length > 1 ? points.map((p) => `${p.x},${p.y}`).join(' ') : '',
    yTicks,
    xLabels: [
      { x: CHART.left, label: labels.start, anchor: 'start' },
      { x: CHART.width - CHART.right, label: labels.end, anchor: 'end' },
    ],
    unit: unitSystem === 'metric' ? 'kg' : 'lb',
  };
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Indirection so a chart failure can be simulated in tests; the page falls back to text. */
export const weightChart = { build: toWeightChart };

