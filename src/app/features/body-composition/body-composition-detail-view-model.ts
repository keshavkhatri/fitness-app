import { BodyCompositionHistoryState } from '../../core/body-composition/body-composition-history.service';
import {
  BodyCompositionAssessment,
  BodyCompositionMetric,
  KEY_BODY_COMPOSITION_METRICS,
  sortBodyCompositionAssessments,
} from '../../domain/body-composition';
import { IsoCalendarDate, roundTo } from '../../domain/fitness-profile';
import { BODY_COMPOSITION_COPY } from './body-composition-content';
import { dateLabelOf, formatDifference, formatReportedValue, shortDateOf } from './body-composition-history-view-model';

/**
 * Presentation for one saved assessment: every reported value, grouped as
 * on an InBody sheet, and its difference from the previous assessment that
 * reported the same metric in the same unit. Values are shown as recorded:
 * no conversion or interpretation. A difference is between two reports, not
 * a trend.
 */

const copy = BODY_COMPOSITION_COPY;

const GROUPS: readonly { readonly title: string; readonly metrics: readonly BodyCompositionMetric[] }[] = [
  { title: copy.detail.key, metrics: KEY_BODY_COMPOSITION_METRICS },
  {
    title: copy.detail.composition,
    metrics: ['lean-body-mass', 'soft-lean-mass', 'protein', 'minerals', 'bone-mineral-content', 'body-cell-mass'],
  },
  { title: copy.detail.water, metrics: ['total-body-water', 'intracellular-water', 'extracellular-water', 'ecw-ratio'] },
  {
    title: copy.detail.other,
    metrics: ['bmi', 'smi', 'visceral-fat-level', 'basal-metabolic-rate', 'phase-angle', 'waist-hip-ratio', 'obesity-degree'],
  },
];

export interface DetailValueView {
  readonly metric: string;
  /** null when this report didn't state it (key results only; other groups list reported values only). */
  readonly value: string | null;
  /** "+0.4 kg"; null without an earlier reading in the same unit. */
  readonly change: string | null;
}

export interface DetailGroupView {
  readonly title: string;
  readonly values: readonly DetailValueView[];
}

export type BodyCompositionDetailScreen =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'not-found' }
  | {
      readonly kind: 'ready';
      readonly dateLabel: string;
      readonly source: string;
      /** What changes are measured against; null for the first assessment. */
      readonly comparison: string | null;
      readonly groups: readonly DetailGroupView[];
      readonly hasWeight: boolean;
    };

const decimals = (value: number): number => (String(value).split('.')[1] ?? '').length;

function changeFrom(metric: BodyCompositionMetric, current: BodyCompositionAssessment, earlier: readonly BodyCompositionAssessment[]): string | null {
  const now = current.reported[metric];
  const before = earlier.find((a) => a.reported[metric])?.reported[metric];
  if (!now || !before || now.unit !== before.unit) {
    return null;
  }
  // `+ 0` turns a -0 into 0.
  const change = roundTo(now.value - before.value, Math.max(decimals(now.value), decimals(before.value))) + 0;
  return change === 0 ? 'No change' : formatDifference(change, now.unit);
}

export function toBodyCompositionDetailScreen(
  state: BodyCompositionHistoryState,
  id: string,
  today: IsoCalendarDate,
): BodyCompositionDetailScreen {
  if (state.status !== 'ready') {
    return { kind: state.status };
  }
  const ordered = sortBodyCompositionAssessments(state.assessments);
  const index = ordered.findIndex((a) => a.id === id);
  if (index < 0) {
    return { kind: 'not-found' };
  }
  const assessment = ordered[index];
  // Newest earlier assessment first.
  const earlier = ordered.slice(0, index).reverse();
  const groups = GROUPS.map(({ title, metrics }, i) => ({
    title,
    values: metrics.flatMap((metric) => {
      const reported = assessment.reported[metric];
      if (!reported && i > 0) {
        return [];
      }
      return [
        {
          metric: copy.metrics[metric],
          value: reported ? formatReportedValue(reported) : null,
          change: changeFrom(metric, assessment, earlier),
        },
      ];
    }),
  })).filter((group) => group.values.length > 0);
  return {
    kind: 'ready',
    dateLabel: dateLabelOf(assessment.date, today),
    source: copy.history.sources[assessment.source.entryMethod],
    comparison: earlier[0] ? copy.detail.comparedWith(shortDateOf(earlier[0].date, today)) : null,
    groups,
    hasWeight: assessment.reported.weight !== undefined,
  };
}
