import { IsoCalendarDate, UnitSystem, parseIsoCalendarDate } from '../fitness-profile';

/**
 * Water drunk, part of nutrition: one total per local calendar day in millilitres (the user adds a glass at a
 * time, or corrects the total). A day without an entry has no total (never a made-up zero). Stored in millilitres
 * whatever the person's units: imperial users see US fluid ounces.
 */
export type WaterLog = Readonly<Record<IsoCalendarDate, number>>;

/** Plausible range for one day's water, in ml. */
export const WATER_RANGE_ML = { min: 0, max: 10_000 } as const;

/** One tap of "+" in metric: a glass. */
export const WATER_GLASS_ML = 250;

/** One US fluid ounce in ml. */
export const FL_OZ_ML = 29.5735;

/** One tap of "+" in imperial: a glass of 8 fl oz (237 ml). */
export const WATER_GLASS_FL_OZ_ML = 237;

/** The size of one glass for a person's units (also the step of the water goal and of the sheet's buttons). */
export const waterGlassMl = (unit: UnitSystem): number => (unit === 'imperial' ? WATER_GLASS_FL_OZ_ML : WATER_GLASS_ML);

/** Millilitres as US fluid ounces. */
export const toFlOz = (ml: number): number => ml / FL_OZ_ML;

/** Daily water goal without a body weight. */
export const DEFAULT_WATER_GOAL_ML = 3_000;

export function isValidWater(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= WATER_RANGE_ML.min && value <= WATER_RANGE_ML.max;
}

/**
 * A daily water goal from body weight: about 33 ml per kg (a common guideline for active adults), kept within
 * 2–4 L. Metric rounds to the nearest half litre; imperial to whole 8 fl oz glasses. Without a weight, 3 L.
 */
export function waterGoalMl(weightKg: number | null, unit: UnitSystem = 'metric'): number {
  const base =
    weightKg === null || !(weightKg > 0)
      ? DEFAULT_WATER_GOAL_ML
      : Math.min(4_000, Math.max(2_000, Math.round((weightKg * 33) / 500) * 500));
  return unit === 'imperial' ? Math.round(base / WATER_GLASS_FL_OZ_ML) * WATER_GLASS_FL_OZ_ML : base;
}

/** Stored days, read strictly: invalid dates or amounts are dropped, never coerced. */
export function parseWaterLog(value: unknown): WaterLog {
  const out: Record<IsoCalendarDate, number> = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [date, ml] of Object.entries(value)) {
      if (parseIsoCalendarDate(date) && isValidWater(ml)) {
        out[date] = ml;
      }
    }
  }
  return out;
}
