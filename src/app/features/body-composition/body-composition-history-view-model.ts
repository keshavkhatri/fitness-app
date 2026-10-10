import { BodyCompositionHistoryState } from '../../core/body-composition/body-composition-history.service';
import { BODY_COMPOSITION_METRICS, ReportedValue, bodyCompositionHistory } from '../../domain/body-composition';
import { IsoCalendarDate, parseIsoCalendarDate } from '../../domain/fitness-profile';
import { dayLabel } from '../workout/history/history-view-model';
import { BODY_COMPOSITION_COPY } from './body-composition-content';

/**
 * Presentation for the body-composition history. Ordering comes from the
 * domain; values are shown exactly as recorded, in the unit the report
 * used: no conversion, rounding, changes or interpretation.
 */

const copy = BODY_COMPOSITION_COPY;

/** "81.37 kg" / "22.4%": the recorded number as is, with its recorded unit. */
export const formatReportedValue = ({ value, unit }: ReportedValue) => (unit === '%' ? `${value}%` : `${value} ${unit}`);

/** "Today", "Yesterday", "Thursday, Oct 1". */
function dateLabelOf(date: IsoCalendarDate, today: IsoCalendarDate): string {
  const parsed = parseIsoCalendarDate(date);
  const todayDate = parseIsoCalendarDate(today);
  return parsed && todayDate ? dayLabel(parsed, todayDate) : date;
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
  /** Reported metrics only, in display order. */
  readonly values: readonly BodyCompositionValueView[];
}

export type BodyCompositionHistoryScreen =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'ready'; readonly rows: readonly BodyCompositionRowView[] };

export function toBodyCompositionHistoryScreen(state: BodyCompositionHistoryState, today: IsoCalendarDate): BodyCompositionHistoryScreen {
  if (state.status !== 'ready') {
    return { kind: state.status };
  }
  if (state.assessments.length === 0) {
    return { kind: 'empty' };
  }
  return {
    kind: 'ready',
    rows: bodyCompositionHistory(state.assessments).map((assessment) => ({
      id: assessment.id,
      dateLabel: dateLabelOf(assessment.date, today),
      source: copy.history.sources[assessment.source.entryMethod],
      values: BODY_COMPOSITION_METRICS.flatMap((metric) => {
        const reported = assessment.reported[metric];
        return reported ? [{ metric: copy.metrics[metric], value: formatReportedValue(reported) }] : [];
      }),
    })),
  };
}
