import { BodyCircumference, MEASUREMENT_SITES, MeasurementEntry, MeasurementSite, sortMeasurementEntries } from './measurement-entry';

/**
 * Reading recorded body measurements back: the history newest first, and the
 * latest recorded value of each site. Only what was recorded: no
 * differences, trends or progress claims.
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
