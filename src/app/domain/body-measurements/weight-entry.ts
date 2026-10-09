import {
  BodyWeight,
  IsoCalendarDate,
  UnitSystem,
  WEIGHT_KG,
  isWithin,
  parseBodyWeight,
  parseIsoCalendarDate,
  weightFromUnit,
} from '../fitness-profile';

/**
 * One recorded body-weight measurement. A historical record only: it never
 * changes the weight saved in the fitness profile.
 *
 * - `weight` is canonical kilograms at the profile's stored precision
 *   (2 decimals, via `weightFromUnit`); the unit system only affects display.
 * - `date` is the user's local calendar date of the measurement.
 * - `createdAt` / `updatedAt` are when the record was made / last edited
 *   (ISO instants). They order same-day entries; they are not measurement times.
 */
export interface WeightEntry {
  readonly id: string;
  readonly date: IsoCalendarDate;
  readonly weight: BodyWeight;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Already-parsed user input: a number in the given unit (null when blank). */
export interface WeightEntryInput {
  readonly weight: number | null;
  readonly unitSystem: UnitSystem;
  readonly date: string;
}

export type WeightEntryProblem = 'required' | 'not-a-number' | 'out-of-range' | 'invalid-date' | 'future-date';
export type WeightEntryErrors = Readonly<Partial<Record<'weight' | 'date', WeightEntryProblem>>>;
export type WeightResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly errors: WeightEntryErrors };

/** Same plausibility range as the profile's body weight. */
export const WEIGHT_ENTRY_RANGE_KG = WEIGHT_KG;

const isInstant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

/** Field-level validation; `today` is the user's local date (no future measurements). */
export function validateWeightEntryInput(input: WeightEntryInput, today: IsoCalendarDate): WeightEntryErrors {
  const errors: { weight?: WeightEntryProblem; date?: WeightEntryProblem } = {};
  if (input.weight === null) {
    errors.weight = 'required';
  } else if (!Number.isFinite(input.weight)) {
    errors.weight = 'not-a-number';
  } else if (input.weight <= 0 || !isWithin(weightFromUnit(input.weight, input.unitSystem).kilograms, WEIGHT_ENTRY_RANGE_KG)) {
    errors.weight = 'out-of-range';
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

export interface WeightEntryContext {
  readonly id: string;
  /** ISO instant of this change. */
  readonly now: string;
  readonly today: IsoCalendarDate;
}

export function createWeightEntry(input: WeightEntryInput, { id, now, today }: WeightEntryContext): WeightResult<WeightEntry> {
  const errors = validateWeightEntryInput(input, today);
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: { id, date: input.date, weight: weightFromUnit(input.weight as number, input.unitSystem), createdAt: now, updatedAt: now },
  };
}

/** A new version of an entry: same id and creation time, new weight/date and update time. */
export function updateWeightEntry(
  entry: WeightEntry,
  input: WeightEntryInput,
  { now, today }: Omit<WeightEntryContext, 'id'>,
): WeightResult<WeightEntry> {
  const created = createWeightEntry(input, { id: entry.id, now, today });
  return created.ok ? { ok: true, value: { ...created.value, createdAt: entry.createdAt } } : created;
}

/** Strict parser for a stored entry; null when anything is missing or out of range. */
export function parseWeightEntry(value: unknown): WeightEntry | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const v = value as Record<string, unknown>;
  const weight = parseBodyWeight(v['weight']);
  if (
    typeof v['id'] !== 'string' ||
    v['id'] === '' ||
    !parseIsoCalendarDate(v['date']) ||
    !weight ||
    !isInstant(v['createdAt']) ||
    !isInstant(v['updatedAt'])
  ) {
    return null;
  }
  return { id: v['id'], date: v['date'] as IsoCalendarDate, weight, createdAt: v['createdAt'], updatedAt: v['updatedAt'] };
}
