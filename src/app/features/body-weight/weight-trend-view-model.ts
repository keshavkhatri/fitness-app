import { WeightRange, WeightRangeSummary } from '../../domain/body-measurements';
import { IsoCalendarDate, UnitSystem, parseIsoCalendarDate } from '../../domain/fitness-profile';
import { PointChartPoint, pointDateLines } from '../../shared/ui';
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
  /** "From 82.2 kg, Thursday, Oct 1": what the change is measured from (null with one measurement). */
  readonly changeFrom: string | null;
  /** The lowest and highest recorded weights in the range (the latest of equal ones); null with one measurement. */
  readonly lowest: TrendMeasurementView | null;
  readonly highest: TrendMeasurementView | null;
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
  // Recorded values only: the latest point among equal extremes.
  const extreme = (better: (a: number, b: number) => boolean) =>
    summary.points.reduce((best, p, i) => (better(p.value, summary.points[best].value) || p.value === summary.points[best].value ? i : best), 0);
  return {
    first,
    latest,
    change,
    changeCaption: single ? copy.singleCaption : copy.changeCaption,
    changeFrom: single ? null : copy.changeFrom(first.weight, first.dateLabel),
    lowest: single ? null : measurements[extreme((a, b) => a < b)],
    highest: single ? null : measurements[extreme((a, b) => a > b)],
    measurements,
    description,
  };
}

// --- Chart -----------------------------------------------------------------------------

/**
 * Smallest vertical span shown, so small differences aren't exaggerated into
 * steep slopes (about 4 kg either way).
 */
const MIN_SPAN: Readonly<Record<UnitSystem, number>> = { metric: 4, imperial: 10 };

/** A labelled point chart, ready to draw: its readings, the unit and the smallest value span shown. */
export interface PointChartView {
  readonly points: readonly PointChartPoint[];
  /** "kg"; empty for a unitless value. */
  readonly unit: string;
  readonly minSpan: number;
  /** Above the chart: "Weight (kg)". */
  readonly caption: string;
}

/** The weigh-ins of a range as a labelled chart: each with its value above and its date below. */
export function toWeightPointChart(summary: WeightRangeSummary, unitSystem: UnitSystem, today: IsoCalendarDate): PointChartView {
  const lines = pointDateLines(
    summary.points.map((p) => p.entry.date),
    today,
  );
  const unit = unitSystem === 'metric' ? 'kg' : 'lb';
  return {
    points: summary.points.map((p) => ({ key: p.entry.id, value: p.value, valueText: p.value.toFixed(1), ...lines(p.entry.date) })),
    unit,
    minSpan: MIN_SPAN[unitSystem],
    caption: `Weight (${unit})`,
  };
}

/** Indirection so a chart failure can be simulated in tests; the page falls back to text. */
export const weightChart = { build: toWeightPointChart };

