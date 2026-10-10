import { roundTo } from '../fitness-profile';
import {
  BODY_COMPOSITION_METRICS,
  BodyCompositionAssessment,
  BodyCompositionMetric,
  ReportedUnit,
  ReportedValue,
  sortBodyCompositionAssessments,
} from './body-composition-assessment';

/**
 * Reading body-composition assessments back: the history newest first, the
 * latest reported value of each metric, and the difference between a
 * metric's two most recent readings. Only what reports stated: no unit
 * conversion, trends, reference ranges or interpretation.
 */

/** Newest first: the reverse of the deterministic oldest-first order (date, creation time, id). */
export const bodyCompositionHistory = (assessments: readonly BodyCompositionAssessment[]): BodyCompositionAssessment[] =>
  sortBodyCompositionAssessments(assessments).reverse();

export interface LatestReportedValue {
  readonly metric: BodyCompositionMetric;
  /** The value from the newest assessment that reported this metric; null when none did. */
  readonly value: ReportedValue | null;
  readonly assessment: BodyCompositionAssessment | null;
}

/** Every supported metric, in display order, with its latest reported value. */
export function latestReportedValues(assessments: readonly BodyCompositionAssessment[]): LatestReportedValue[] {
  const newestFirst = bodyCompositionHistory(assessments);
  return BODY_COMPOSITION_METRICS.map((metric) => {
    const assessment = newestFirst.find((a) => a.reported[metric] !== undefined) ?? null;
    return { metric, value: assessment?.reported[metric] ?? null, assessment };
  });
}

/**
 * The two newest readings of a metric:
 * - change: both in the same unit; `change` is latest − previous in that
 *   unit, at the precision of the more precise reading. A difference between
 *   two reports, not progress.
 * - different-units: the readings use different units (e.g. kg and lb); no
 *   difference is given rather than converting a reported value.
 */
export type MetricChange =
  | {
      readonly kind: 'change';
      readonly metric: BodyCompositionMetric;
      readonly latest: BodyCompositionAssessment;
      readonly previous: BodyCompositionAssessment;
      readonly change: number;
      readonly unit: ReportedUnit;
    }
  | {
      readonly kind: 'different-units';
      readonly metric: BodyCompositionMetric;
      readonly latest: BodyCompositionAssessment;
      readonly previous: BodyCompositionAssessment;
    };

const decimals = (value: number): number => (String(value).split('.')[1] ?? '').length;

/** Null when the metric has fewer than two readings. */
export function metricChange(assessments: readonly BodyCompositionAssessment[], metric: BodyCompositionMetric): MetricChange | null {
  const [latest, previous] = bodyCompositionHistory(assessments).filter((a) => a.reported[metric] !== undefined);
  if (!latest || !previous) {
    return null;
  }
  const a = latest.reported[metric]!;
  const b = previous.reported[metric]!;
  if (a.unit !== b.unit) {
    return { kind: 'different-units', metric, latest, previous };
  }
  // `+ 0` turns a -0 into 0.
  const change = roundTo(a.value - b.value, Math.max(decimals(a.value), decimals(b.value))) + 0;
  return { kind: 'change', metric, latest, previous, change, unit: a.unit };
}
