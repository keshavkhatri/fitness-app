import { UnitSystem, roundTo } from '../fitness-profile';
import {
  BodyCircumference,
  MEASUREMENT_SITES,
  MeasurementEntry,
  MeasurementSite,
  circumferenceInUnit,
  sortMeasurementEntries,
} from './measurement-entry';

/**
 * Reading recorded body measurements back: the history newest first, the
 * latest recorded value of each site, and the difference between a site's
 * two most recent readings. Only what was recorded: no trends or progress
 * claims.
 */

/** Newest first: the reverse of the deterministic oldest-first order (date, creation time, id). */
export const measurementHistory = (entries: readonly MeasurementEntry[]): MeasurementEntry[] => sortMeasurementEntries(entries).reverse();

export interface LatestSiteMeasurement {
  readonly site: MeasurementSite;
  /** The value from the newest entry that recorded this site; null when it was never measured. */
  readonly value: BodyCircumference | null;
  readonly entry: MeasurementEntry | null;
}

/** Every supported site, in display order, with its latest recorded value. */
export function latestMeasurements(entries: readonly MeasurementEntry[]): LatestSiteMeasurement[] {
  const newestFirst = measurementHistory(entries);
  return MEASUREMENT_SITES.map((site) => {
    const entry = newestFirst.find((e) => e.values[site] !== undefined) ?? null;
    return { site, value: entry?.values[site] ?? null, entry };
  });
}

export interface SiteChange {
  readonly site: MeasurementSite;
  readonly latest: MeasurementEntry;
  readonly previous: MeasurementEntry;
  /**
   * latest − previous for this site only, from the displayed values (0.1 in
   * the unit system, so the difference agrees with what is shown). A
   * difference between two recordings, not progress.
   */
  readonly change: number;
}

/**
 * The difference between the two newest entries that recorded `site`, in
 * history order; null when the site has fewer than two readings.
 */
export function siteChange(entries: readonly MeasurementEntry[], site: MeasurementSite, unitSystem: UnitSystem): SiteChange | null {
  const [latest, previous] = measurementHistory(entries).filter((e) => e.values[site] !== undefined);
  if (!latest || !previous) {
    return null;
  }
  const inUnit = (e: MeasurementEntry) => circumferenceInUnit(e.values[site]!, unitSystem);
  // `+ 0` turns a -0 into 0.
  return { site, latest, previous, change: roundTo(inUnit(latest) - inUnit(previous), 1) + 0 };
}
