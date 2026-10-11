import { BodyCompositionHistoryState } from '../../core/body-composition/body-composition-history.service';
import {
  BODY_COMPOSITION_METRICS,
  KEY_BODY_COMPOSITION_METRICS,
  MetricChange,
  ReportedUnit,
  ReportedValue,
  bodyCompositionHistory,
  latestReportedValues,
  metricChange,
} from '../../domain/body-composition';
import { IsoCalendarDate, parseIsoCalendarDate } from '../../domain/fitness-profile';
import { dayLabel } from '../workout/history/history-view-model';
import { BODY_COMPOSITION_COPY } from './body-composition-content';

/**
 * Presentation for the body-composition history. Ordering, the latest value
 * per metric and the difference between a metric's two newest readings come
 * from the domain; values are shown exactly as recorded, in the unit the
 * report used: no conversion, rounding or interpretation.
 */

const copy = BODY_COMPOSITION_COPY;

/** "81.37 kg" / "22.4%": the recorded number as is, with its recorded unit. */
export const formatReportedValue = ({ value, unit }: ReportedValue) =>
  unit === 'none' ? `${value}` : unit === '%' || unit === '°' ? `${value}${unit}` : `${value} ${unit}`;

/**
 * "+0.35 kg" / "−1.2 percentage points" (a true minus sign); zero is worded
 * separately. A percentage difference is in points, not a relative change.
 */
export const formatDifference = (change: number, unit: ReportedUnit) =>
  `${change > 0 ? '+' : '−'}${Math.abs(change)}${unit === 'none' ? '' : ` ${unit === '%' ? 'percentage points' : unit}`}`;

const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const monthDayYear = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** "Sep 12", or "Sep 12, 2025" outside the current year. */
export function shortDateOf(date: IsoCalendarDate, today: IsoCalendarDate): string {
  const d = parseIsoCalendarDate(date);
  const t = parseIsoCalendarDate(today);
  return d && t ? (d.year === t.year ? monthDay : monthDayYear).format(new Date(Date.UTC(d.year, d.month - 1, d.day))) : date;
}

function changeText(difference: MetricChange, today: IsoCalendarDate): string {
  const previousDate = shortDateOf(difference.previous.date, today);
  if (difference.kind === 'different-units') {
    return copy.history.latest.differentUnits(previousDate);
  }
  return copy.history.latest.change(difference.change === 0 ? null : formatDifference(difference.change, difference.unit), previousDate);
}

/** "Today", "Yesterday", "Thursday, Oct 1". */
export function dateLabelOf(date: IsoCalendarDate, today: IsoCalendarDate): string {
  const parsed = parseIsoCalendarDate(date);
  const todayDate = parseIsoCalendarDate(today);
  return parsed && todayDate ? dayLabel(parsed, todayDate) : date;
}

export interface LatestMetricView {
  readonly metric: string;
  /** null when no assessment reported this metric. */
  readonly value: string | null;
  readonly dateLabel: string | null;
  /** The difference from this metric's previous reading; null without one. */
  readonly change: string | null;
}

export interface BodyCompositionValueView {
  readonly metric: string;
  readonly value: string;
}

export interface BodyCompositionRowView {
  readonly id: string;
  readonly dateLabel: string;
  /** How the values were recorded (by hand or imported). */
  readonly source: string;
  /** Reported key metrics only, in display order. */
  readonly values: readonly BodyCompositionValueView[];
  /** How many further values the assessment holds (shown on its detail page). */
  readonly moreCount: number;
}

export type BodyCompositionHistoryScreen =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'ready';
      readonly latest: readonly LatestMetricView[];
      readonly rows: readonly BodyCompositionRowView[];
      /** Only one assessment: no changes to show yet. */
      readonly single: boolean;
    };

const isKeyMetric = (metric: string): boolean => (KEY_BODY_COMPOSITION_METRICS as readonly string[]).includes(metric);

export function toBodyCompositionHistoryScreen(state: BodyCompositionHistoryState, today: IsoCalendarDate): BodyCompositionHistoryScreen {
  if (state.status !== 'ready') {
    return { kind: state.status };
  }
  if (state.assessments.length === 0) {
    return { kind: 'empty' };
  }
  return {
    kind: 'ready',
    single: state.assessments.length === 1,
    // Key metrics always (unrecorded ones say so); any other metric once some report stated it.
    latest: latestReportedValues(state.assessments)
      .filter(({ metric, value }) => isKeyMetric(metric) || value !== null)
      .map(({ metric, value, assessment }) => {
      const difference = metricChange(state.assessments, metric);
      return {
        metric: copy.metrics[metric],
        value: value ? formatReportedValue(value) : null,
        dateLabel: assessment ? dateLabelOf(assessment.date, today) : null,
        change: difference ? changeText(difference, today) : null,
      };
    }),
    rows: bodyCompositionHistory(state.assessments).map((assessment) => ({
      id: assessment.id,
      dateLabel: dateLabelOf(assessment.date, today),
      source: copy.history.sources[assessment.source.entryMethod],
      values: KEY_BODY_COMPOSITION_METRICS.flatMap((metric) => {
        const reported = assessment.reported[metric];
        return reported ? [{ metric: copy.metrics[metric], value: formatReportedValue(reported) }] : [];
      }),
      moreCount: BODY_COMPOSITION_METRICS.filter((metric) => !isKeyMetric(metric) && assessment.reported[metric]).length,
    })),
  };
}
