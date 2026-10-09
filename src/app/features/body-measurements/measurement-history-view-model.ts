import { MeasurementHistoryState } from '../../core/body-measurements/measurement-history.service';
import {
  BodyCircumference,
  MEASUREMENT_SITES,
  circumferenceInUnit,
  latestMeasurements,
  lengthUnitLabel,
  measurementHistory,
} from '../../domain/body-measurements';
import { IsoCalendarDate, UnitSystem, parseIsoCalendarDate } from '../../domain/fitness-profile';
import { dayLabel } from '../workout/history/history-view-model';
import { MEASUREMENT_COPY } from './measurement-content';

/**
 * Presentation for the measurement history. Ordering and the latest value
 * per site come from the domain; this only formats them in the user's unit.
 */

const copy = MEASUREMENT_COPY;
const oneDecimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "80.5 cm" / "31.7 in" (always one decimal). Stored centimeters are not changed. */
export const formatCircumference = (value: BodyCircumference, unitSystem: UnitSystem) =>
  `${oneDecimal.format(circumferenceInUnit(value, unitSystem))} ${lengthUnitLabel(unitSystem)}`;

/** "Today", "Yesterday", "Thursday, Oct 1". */
function dateLabelOf(date: IsoCalendarDate, today: IsoCalendarDate): string {
  const parsed = parseIsoCalendarDate(date);
  const todayDate = parseIsoCalendarDate(today);
  return parsed && todayDate ? dayLabel(parsed, todayDate) : date;
}

export interface LatestSiteView {
  readonly site: string;
  /** null when never measured. */
  readonly value: string | null;
  readonly dateLabel: string | null;
}

export interface MeasurementValueView {
  readonly site: string;
  readonly value: string;
}

export interface MeasurementRowView {
  readonly id: string;
  readonly dateLabel: string;
  /** Recorded sites only, in display order. */
  readonly values: readonly MeasurementValueView[];
  readonly ariaLabel: string;
}

export type MeasurementHistoryScreen =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'ready'; readonly latest: readonly LatestSiteView[]; readonly rows: readonly MeasurementRowView[] };

export function toMeasurementHistoryScreen(state: MeasurementHistoryState, today: IsoCalendarDate): MeasurementHistoryScreen {
  if (state.status !== 'ready') {
    return { kind: state.status };
  }
  if (state.entries.length === 0) {
    return { kind: 'empty' };
  }
  const { unitSystem } = state;
  return {
    kind: 'ready',
    latest: latestMeasurements(state.entries).map(({ site, value, entry }) => ({
      site: copy.sites[site],
      value: value ? formatCircumference(value, unitSystem) : null,
      dateLabel: entry ? dateLabelOf(entry.date, today) : null,
    })),
    rows: measurementHistory(state.entries).map((entry) => {
      const dateLabel = dateLabelOf(entry.date, today);
      const values = MEASUREMENT_SITES.flatMap((site) => {
        const value = entry.values[site];
        return value ? [{ site: copy.sites[site], value: formatCircumference(value, unitSystem) }] : [];
      });
      const spoken = values.map((v) => `${v.site} ${v.value}`).join(', ');
      return { id: entry.id, dateLabel, values, ariaLabel: `${copy.history.list.edit} ${dateLabel}: ${spoken}` };
    }),
  };
}
