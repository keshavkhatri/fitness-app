import { BodyCompositionAssessment, BodyCompositionMetric, METRIC_QUANTITY, ReportedUnit } from '../../../domain/body-composition';
import { WeightRange, rangeStart } from '../../../domain/body-measurements';
import { IsoCalendarDate } from '../../../domain/fitness-profile';
import { BODY_COMPOSITION_COPY } from '../../body-composition/body-composition-content';
import { formatReportedValue, shortDateOf } from '../../body-composition/body-composition-history-view-model';
import { WEIGHT_HISTORY_COPY } from '../../body-weight/weight-history-content';
import { PointChartView } from '../../body-weight/weight-trend-view-model';
import { pointDateLines } from '../../../shared/ui';

/**
 * A body-composition metric over time, from the recorded assessments (each value as the report printed it). One
 * metric at a time, in its latest unit: readings in another unit (an old report in lb) are left out rather than
 * converted. Pure; the card only draws what this returns.
 */

/** The metrics worth following over time, in the order they are offered (only those with a reading are). */
export const TREND_METRICS: readonly BodyCompositionMetric[] = [
  'body-fat-percentage',
  'skeletal-muscle-mass',
  'body-fat-mass',
  'fat-free-mass',
  'visceral-fat-level',
  'bmi',
  'ecw-ratio',
  'phase-angle',
  'smi',
  'inbody-score',
  'basal-metabolic-rate',
  'total-body-water',
  'protein',
];

export interface TrendOption {
  readonly metric: BodyCompositionMetric;
  /** Short, for the chip ("Body fat %"); the chart caption uses the full name. */
  readonly label: string;
}

const CHIP_LABELS: Readonly<Partial<Record<BodyCompositionMetric, string>>> = {
  'body-fat-percentage': 'Body fat %',
  'skeletal-muscle-mass': 'Muscle',
  'body-fat-mass': 'Fat mass',
  'fat-free-mass': 'Fat-free mass',
  'visceral-fat-level': 'Visceral fat',
  'basal-metabolic-rate': 'BMR',
  'total-body-water': 'Body water',
};

export type CompositionTrendView =
  /** No assessment has any of these metrics yet. */
  | { readonly kind: 'none' }
  | {
      readonly kind: 'ready';
      readonly options: readonly TrendOption[];
      readonly metric: BodyCompositionMetric;
      /** "Body fat percentage", above the axis. */
      readonly caption: string;
      /** Null with no reading in the range: the text says so. */
      readonly chart: PointChartView | null;
      /** One sentence for the chart's accessible name. */
      readonly description: string;
      /** Readings in the range. */
      readonly count: number;
    };

/** The smallest span the axis shows, so small differences don't look like steep changes. */
function minSpanOf(metric: BodyCompositionMetric, unit: ReportedUnit): number {
  switch (METRIC_QUANTITY[metric]) {
    case 'mass':
    case 'mass-change':
      return unit === 'lb' ? 4 : 2;
    case 'percentage':
      return 4;
    case 'ratio':
      return 0.01;
    case 'energy':
      return 100;
    case 'score':
      return 10;
    case 'level':
    case 'volume':
      return 2;
    default:
      return 1;
  }
}

const byDate = (a: BodyCompositionAssessment, b: BodyCompositionAssessment) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);

export function toCompositionTrend(
  assessments: readonly BodyCompositionAssessment[],
  requested: BodyCompositionMetric | null,
  range: WeightRange,
  today: IsoCalendarDate,
): CompositionTrendView {
  const labels = BODY_COMPOSITION_COPY.metrics;
  const options = TREND_METRICS.filter((metric) => assessments.some((a) => a.reported[metric] !== undefined)).map((metric) => ({
    metric,
    label: CHIP_LABELS[metric] ?? labels[metric],
  }));
  if (options.length === 0) {
    return { kind: 'none' };
  }
  const metric = requested && options.some((o) => o.metric === requested) ? requested : options[0].metric;
  const label = labels[metric];
  const readings = [...assessments].sort(byDate).filter((a) => a.reported[metric] !== undefined);
  const unit = readings[readings.length - 1].reported[metric]!.unit;
  const start = rangeStart(range, today);
  const inRange = readings.filter((a) => a.reported[metric]!.unit === unit && (start === null || a.date >= start) && a.date <= today);
  const base = { kind: 'ready' as const, options, metric, caption: label, count: inRange.length };
  const rangeName = WEIGHT_HISTORY_COPY.trend.rangeNames[range];
  if (inRange.length === 0) {
    return { ...base, chart: null, description: `${label}: no readings in ${rangeName}.` };
  }
  const first = inRange[0];
  const latest = inRange[inRange.length - 1];
  const text = (a: BodyCompositionAssessment) => formatReportedValue(a.reported[metric]!);
  const description =
    inRange.length === 1
      ? `${label}, ${rangeName}: one reading, ${text(latest)} on ${shortDateOf(latest.date, today)}.`
      : `${label}, ${rangeName}: ${inRange.length} readings, from ${text(first)} on ${shortDateOf(first.date, today)} to ${text(latest)} on ${shortDateOf(latest.date, today)}.`;
  const lines = pointDateLines(
    inRange.map((a) => a.date),
    today,
  );
  const unitText = unit === 'none' ? '' : unit;
  // One precision for the whole series ("27.0" beside "28.2"), as the reports print them.
  const decimals = Math.max(...inRange.map((a) => (`${a.reported[metric]!.value}`.split('.')[1] ?? '').length));
  const chart: PointChartView = {
    points: inRange.map((a) => ({ key: a.id, value: a.reported[metric]!.value, valueText: a.reported[metric]!.value.toFixed(decimals), ...lines(a.date) })),
    unit: unitText,
    minSpan: minSpanOf(metric, unit),
    caption: unitText ? `${label} (${unitText})` : label,
  };
  return { ...base, chart, description };
}
