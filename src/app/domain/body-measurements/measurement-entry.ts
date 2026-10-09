import {
  CM_PER_INCH,
  IsoCalendarDate,
  NumericRange,
  UnitSystem,
  isOneOf,
  isWithin,
  parseIsoCalendarDate,
  roundTo,
} from '../fitness-profile';

/**
 * Recorded body measurements (tape-measure circumferences). Kept apart from
 * body-weight history and from the profile: recording one never changes
 * either, and nothing is derived from them.
 *
 * One entry is one measuring occasion: any subset of the supported sites,
 * at least one. Same date/ordering conventions as weight entries.
 */

/** Supported sites, in display order. One arm / one thigh: the user picks a side and keeps to it. */
export const MEASUREMENT_SITES = ['waist', 'chest', 'hips', 'arm', 'thigh'] as const;
export type MeasurementSite = (typeof MEASUREMENT_SITES)[number];
export const isMeasurementSite = isOneOf(MEASUREMENT_SITES);

/** A circumference, canonically in centimeters. */
export interface BodyCircumference {
  readonly centimeters: number;
}

export type MeasurementValues = Readonly<Partial<Record<MeasurementSite, BodyCircumference>>>;

/**
 * - `values` holds only the sites measured on this occasion (never empty),
 *   canonical centimeters at 2 decimals; the unit system only affects display.
 * - `date` is the user's local calendar date of the measurement.
 * - `createdAt` / `updatedAt` are record times (ISO instants), used only to
 *   order same-day entries.
 */
export interface MeasurementEntry {
  readonly id: string;
  readonly date: IsoCalendarDate;
  readonly values: MeasurementValues;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Already-parsed user input: numbers in the unit system's length unit; blank or missing sites are null/absent. */
export interface MeasurementEntryInput {
  readonly values: Readonly<Partial<Record<MeasurementSite, number | null>>>;
  readonly unitSystem: UnitSystem;
  readonly date: string;
}

export type MeasurementProblem = 'not-a-number' | 'out-of-range' | 'required' | 'invalid-date' | 'future-date';
/** `values: 'required'` means no site was filled in. */
export type MeasurementEntryErrors = Readonly<Partial<Record<MeasurementSite | 'values' | 'date', MeasurementProblem>>>;
export type MeasurementResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: MeasurementEntryErrors };

/**
 * Plausibility bounds for any site, in centimeters. Deliberately wide, like
 * the profile's ranges: they reject typos and impossible values, not
 * unusual-but-real bodies.
 */
export const MEASUREMENT_CM: NumericRange = { min: 10, max: 300 };

// Enough that inch input round-trips exactly at display precision (0.1).
const STORED_CM_DECIMALS = 2;

export function circumferenceFromUnit(value: number, unitSystem: UnitSystem): BodyCircumference {
  return { centimeters: roundTo(unitSystem === 'metric' ? value : value * CM_PER_INCH, STORED_CM_DECIMALS) };
}

/** In the given unit system (cm or in), rounded to 0.1 for display/editing. */
export function circumferenceInUnit(value: BodyCircumference, unitSystem: UnitSystem): number {
  return roundTo(unitSystem === 'metric' ? value.centimeters : value.centimeters / CM_PER_INCH, 1);
}

export function lengthUnitLabel(unitSystem: UnitSystem): 'cm' | 'in' {
  return unitSystem === 'metric' ? 'cm' : 'in';
}

const isInstant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

/** Field-level validation; `today` is the user's local date (no future measurements). */
export function validateMeasurementEntryInput(input: MeasurementEntryInput, today: IsoCalendarDate): MeasurementEntryErrors {
  const errors: Partial<Record<MeasurementSite | 'values' | 'date', MeasurementProblem>> = {};
  let filled = 0;
  for (const site of MEASUREMENT_SITES) {
    const value = input.values[site];
    if (value === null || value === undefined) {
      continue;
    }
    filled++;
    if (!Number.isFinite(value)) {
      errors[site] = 'not-a-number';
    } else if (value <= 0 || !isWithin(circumferenceFromUnit(value, input.unitSystem).centimeters, MEASUREMENT_CM)) {
      errors[site] = 'out-of-range';
    }
  }
  if (filled === 0) {
    errors.values = 'required';
  }
  if (input.date.trim() === '') {
    errors.date = 'required';
  } else if (!parseIsoCalendarDate(input.date)) {
    errors.date = 'invalid-date';
  } else if (input.date > today) {
    errors.date = 'future-date';
  }
  return errors;
}

export interface MeasurementEntryContext {
  readonly id: string;
  /** ISO instant of this change. */
  readonly now: string;
  readonly today: IsoCalendarDate;
}

export function createMeasurementEntry(
  input: MeasurementEntryInput,
  { id, now, today }: MeasurementEntryContext,
): MeasurementResult<MeasurementEntry> {
  const errors = validateMeasurementEntryInput(input, today);
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  const values: Partial<Record<MeasurementSite, BodyCircumference>> = {};
  for (const site of MEASUREMENT_SITES) {
    const value = input.values[site];
    if (value !== null && value !== undefined) {
      values[site] = circumferenceFromUnit(value, input.unitSystem);
    }
  }
  return { ok: true, value: { id, date: input.date, values, createdAt: now, updatedAt: now } };
}

/** A new version of an entry: same id and creation time; values, date and update time replaced. */
export function updateMeasurementEntry(
  entry: MeasurementEntry,
  input: MeasurementEntryInput,
  { now, today }: Omit<MeasurementEntryContext, 'id'>,
): MeasurementResult<MeasurementEntry> {
  const created = createMeasurementEntry(input, { id: entry.id, now, today });
  return created.ok ? { ok: true, value: { ...created.value, createdAt: entry.createdAt } } : created;
}

function parseValues(value: unknown): MeasurementValues | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const values: Partial<Record<MeasurementSite, BodyCircumference>> = {};
  for (const [site, raw] of Object.entries(value)) {
    // An unknown site (e.g. from a newer app version) makes the whole entry unreadable rather than silently dropped on edit.
    if (!isMeasurementSite(site) || typeof raw !== 'object' || raw === null) {
      return null;
    }
    const centimeters = (raw as Record<string, unknown>)['centimeters'];
    if (typeof centimeters !== 'number' || !Number.isFinite(centimeters) || !isWithin(centimeters, MEASUREMENT_CM)) {
      return null;
    }
    values[site] = { centimeters };
  }
  return Object.keys(values).length > 0 ? values : null;
}

/** Strict parser for a stored entry; null when anything is missing, unknown or out of range. */
export function parseMeasurementEntry(value: unknown): MeasurementEntry | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const v = value as Record<string, unknown>;
  const values = parseValues(v['values']);
  if (
    typeof v['id'] !== 'string' ||
    v['id'] === '' ||
    !parseIsoCalendarDate(v['date']) ||
    !values ||
    !isInstant(v['createdAt']) ||
    !isInstant(v['updatedAt'])
  ) {
    return null;
  }
  return { id: v['id'], date: v['date'] as IsoCalendarDate, values, createdAt: v['createdAt'], updatedAt: v['updatedAt'] };
}

/** Oldest first: measurement date, then record creation time, then id (stable across edits). */
export function compareMeasurementEntries(a: MeasurementEntry, b: MeasurementEntry): number {
  if (a.date !== b.date) {
    return a.date < b.date ? -1 : 1;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export const sortMeasurementEntries = (entries: readonly MeasurementEntry[]): MeasurementEntry[] =>
  [...entries].sort(compareMeasurementEntries);
