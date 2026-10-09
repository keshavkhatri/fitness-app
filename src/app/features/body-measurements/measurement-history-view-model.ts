import { MeasurementHistoryState } from '../../core/body-measurements/measurement-history.service';
import {
  BodyCircumference,
  MEASUREMENT_SITES,
  circumferenceInUnit,
  latestMeasurements,
  lengthUnitLabel,
  measurementHistory,
  siteChange,
} from '../../domain/body-measurements';
import { IsoCalendarDate, UnitSystem, parseIsoCalendarDate } from '../../domain/fitness-profile';
import { dayLabel } from '../workout/history/history-view-model';
import { MEASUREMENT_COPY } from './measurement-content';

/**
 * Presentation for the measurement history. Ordering, the latest value per
 * site and the change between readings come from the domain; this only
 * formats them in the user's unit.
 */

const copy = MEASUREMENT_COPY;
const oneDecimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "80.5 cm" / "31.7 in" (always one decimal). Stored centimeters are not changed. */
export const formatCircumference = (value: BodyCircumference, unitSystem: UnitSystem) =>
  `${oneDecimal.format(circumferenceInUnit(value, unitSystem))} ${lengthUnitLabel(unitSystem)}`;

/** "+0.4 cm" / "−1.2 cm" (a true minus sign); zero is worded separately. */
const formatCircumferenceChange = (change: number, unitSystem: UnitSystem) =>
  `${change > 0 ? '+' : '−'}${oneDecimal.format(Math.abs(change))} ${lengthUnitLabel(unitSystem)}`;

const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const monthDayYear = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** "Sep 12", or "Sep 12, 2025" outside the current year. */
function shortDateOf(date: IsoCalendarDate, today: IsoCalendarDate): string {
  const d = parseIsoCalendarDate(date);
  const t = parseIsoCalendarDate(today);
  return d && t ? (d.year === t.year ? monthDay : monthDayYear).format(new Date(Date.UTC(d.year, d.month - 1, d.day))) : date;
}

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
  /** "−1.2 cm since Sep 12" / "No change since Sep 12"; null without an earlier reading of this site. */
  readonly change: string | null;
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
    latest: latestMeasurements(state.entries).map(({ site, value, entry }) => {
      const difference = siteChange(state.entries, site, unitSystem);
      return {
        site: copy.sites[site],
        value: value ? formatCircumference(value, unitSystem) : null,
        dateLabel: entry ? dateLabelOf(entry.date, today) : null,
        change: difference
          ? copy.history.latest.change(
              difference.change === 0 ? null : formatCircumferenceChange(difference.change, unitSystem),
              shortDateOf(difference.previous.date, today),
            )
          : null,
      };
    }),
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
