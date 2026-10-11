/**
 * Plausibility bounds for profile values, in canonical units.
 *
 * Deliberately wide: they reject typos and impossible values (0 kg, 900 cm),
 * not unusual-but-real people. Tighten only with a product/medical reason.
 */
export interface NumericRange {
  readonly min: number;
  readonly max: number;
}

/**
 * Supported age range, derived from date of birth. The minimum is a product
 * decision: the app is currently for adults only.
 */
export const AGE_YEARS: NumericRange = { min: 18, max: 120 };
export const HEIGHT_CM: NumericRange = { min: 50, max: 275 };
export const WEIGHT_KG: NumericRange = { min: 20, max: 500 };
/** An accepted maintenance-calorie calibration (kcal/day). */
export const MAINTENANCE_KCAL: NumericRange = { min: 1000, max: 6000 };

export function isWithin(value: number, range: NumericRange): boolean {
  return value >= range.min && value <= range.max;
}
