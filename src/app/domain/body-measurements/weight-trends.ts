import { IsoCalendarDate, UnitSystem, parseIsoCalendarDate, roundTo, toIsoCalendarDate, weightInUnit } from '../fitness-profile';
import { addDays } from '../workout-session';
import { WeightEntry } from './weight-entry';
import { sortWeightEntries } from './weight-history';

/**
 * Time ranges over recorded weights. Only actual measurements are used:
 * nothing is interpolated, averaged, smoothed or projected.
 *
 * Windows are rolling calendar-day windows ending on (and including) the
 * user's local "today", by measurement date: "30 days" is today and the 29
 * days before it.
 */

export const WEIGHT_RANGES = ['30d', '90d', '180d', '365d', 'all'] as const;
export type WeightRange = (typeof WEIGHT_RANGES)[number];

const RANGE_DAYS: Readonly<Record<Exclude<WeightRange, 'all'>, number>> = { '30d': 30, '90d': 90, '180d': 180, '365d': 365 };

/** First date inside the window (inclusive); null for all time or an invalid `today`. */
export function rangeStart(range: WeightRange, today: IsoCalendarDate): IsoCalendarDate | null {
  const end = parseIsoCalendarDate(today);
  if (range === 'all' || !end) {
    return null;
  }
  return toIsoCalendarDate(addDays(end, -(RANGE_DAYS[range] - 1)));
}

/**
 * Entries measured inside the range, in history order (date, then record
 * time, then id). Entries with an invalid date or a date after today are
 * excluded defensively (validation already prevents them).
 */
export function entriesInRange(entries: readonly WeightEntry[], range: WeightRange, today: IsoCalendarDate): WeightEntry[] {
  const start = rangeStart(range, today);
  return sortWeightEntries(
    entries.filter((e) => parseIsoCalendarDate(e.date) !== null && e.date <= today && (start === null || e.date >= start)),
  );
}

export interface WeightPoint {
  readonly entry: WeightEntry;
  /** The weight as displayed in the unit system (1 decimal, via weightInUnit). */
  readonly value: number;
}

export interface WeightRangeSummary {
  /** Every measurement in the range, oldest first (same-day measurements kept, never averaged). */
  readonly points: readonly WeightPoint[];
  readonly first: WeightPoint;
  readonly latest: WeightPoint;
  /**
   * latest − first, from the displayed values (so the summary and the chart
   * agree with what is shown). 0 when the range has a single measurement.
   * A difference between two recordings, not progress.
   */
  readonly netChange: number;
}

/** null when the range has no measurements (nothing is invented). */
export function weightRangeSummary(
  entries: readonly WeightEntry[],
  range: WeightRange,
  today: IsoCalendarDate,
  unitSystem: UnitSystem,
): WeightRangeSummary | null {
  const points = entriesInRange(entries, range, today).map((entry) => ({ entry, value: weightInUnit(entry.weight, unitSystem) }));
  if (points.length === 0) {
    return null;
  }
  const first = points[0];
  const latest = points[points.length - 1];
  // `+ 0` turns a -0 into 0.
  return { points, first, latest, netChange: roundTo(latest.value - first.value, 1) + 0 };
}
