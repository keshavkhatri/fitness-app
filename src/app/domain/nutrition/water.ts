import { IsoCalendarDate, parseIsoCalendarDate } from '../fitness-profile';

/**
 * Water drunk, part of nutrition: one total per local calendar day in millilitres (the user adds a glass at a
 * time, or corrects the total). A day without an entry has no total (never a made-up zero).
 */
export type WaterLog = Readonly<Record<IsoCalendarDate, number>>;

/** Plausible range for one day's water, in ml. */
export const WATER_RANGE_ML = { min: 0, max: 10_000 } as const;

/** One tap of "+": a glass. */
export const WATER_GLASS_ML = 250;

/** Daily water goal without a body weight. */
export const DEFAULT_WATER_GOAL_ML = 3_000;

export function isValidWater(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= WATER_RANGE_ML.min && value <= WATER_RANGE_ML.max;
}

/**
 * A daily water goal from body weight: about 33 ml per kg (a common guideline for active adults), to the nearest
 * half litre, kept within 2–4 L. Without a weight, 3 L.
 */
export function waterGoalMl(weightKg: number | null): number {
  if (weightKg === null || !(weightKg > 0)) {
    return DEFAULT_WATER_GOAL_ML;
  }
  return Math.min(4_000, Math.max(2_000, Math.round((weightKg * 33) / 500) * 500));
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
