import { roundTo } from '../fitness-profile';
import { FOOD_ENTRY_LIMITS, FoodEntry, FoodEntryInput, MealCategory, NutritionValues } from './nutrition.model';

/**
 * Portions of a logged food. A food entry stores the nutrition of the amount
 * eaten (not per 100 g), so a different portion of the same food is the
 * recorded nutrition scaled in proportion to the amount:
 *
 *   per serving = recorded × (serving size ÷ recorded quantity)
 *   total       = recorded × (serving size × servings ÷ recorded quantity)
 *
 * The unit never changes here (grams can't be scaled into pieces). Totals are
 * computed from the recorded values in one step, so rounding doesn't compound.
 * Missing or unreadable amounts are reported, never treated as zero.
 */

export const SERVINGS_STEP = 0.5;
export const SERVINGS_MIN = 0.5;
export const SERVINGS_MAX = 20;

export type PortionProblem = 'serving-required' | 'serving-not-a-number' | 'serving-not-positive' | 'servings-out-of-range' | 'too-large';

export interface FoodPortion {
  /** Amount eaten: serving size × servings (two decimals, as stored). */
  readonly quantity: number;
  /** Nutrition of one serving of the given size (one decimal). */
  readonly perServing: NutritionValues;
  /** Nutrition of the amount eaten (one decimal, as stored). */
  readonly total: NutritionValues;
}

export type PortionResult = { readonly ok: true; readonly value: FoodPortion } | { readonly ok: false; readonly error: PortionProblem };

/** Each value × factor, to one decimal (the stored precision). */
export function scaleNutrition(values: NutritionValues, factor: number): NutritionValues {
  return {
    calories: roundTo(values.calories * factor, 1),
    proteinGrams: roundTo(values.proteinGrams * factor, 1),
    carbohydrateGrams: roundTo(values.carbohydrateGrams * factor, 1),
    fatGrams: roundTo(values.fatGrams * factor, 1),
  };
}

const exceedsLimits = (quantity: number, total: NutritionValues) =>
  quantity > FOOD_ENTRY_LIMITS.quantityMax ||
  total.calories > FOOD_ENTRY_LIMITS.caloriesMax ||
  Math.max(total.proteinGrams, total.carbohydrateGrams, total.fatGrams) > FOOD_ENTRY_LIMITS.gramsMax;

/**
 * A portion of a recorded food: `servingSize` in the food's own unit (null
 * when not entered), eaten `servings` times.
 */
export function foodPortion(recorded: Pick<FoodEntry, 'quantity' | 'nutrition'>, servingSize: number | null, servings: number): PortionResult {
  if (servingSize === null) {
    return { ok: false, error: 'serving-required' };
  }
  if (!Number.isFinite(servingSize)) {
    return { ok: false, error: 'serving-not-a-number' };
  }
  if (servingSize <= 0) {
    return { ok: false, error: 'serving-not-positive' };
  }
  if (!Number.isFinite(servings) || servings < SERVINGS_MIN || servings > SERVINGS_MAX) {
    return { ok: false, error: 'servings-out-of-range' };
  }
  const quantity = roundTo(servingSize * servings, 2);
  if (quantity <= 0 || recorded.quantity <= 0) {
    return { ok: false, error: 'serving-not-positive' };
  }
  const total = scaleNutrition(recorded.nutrition, quantity / recorded.quantity);
  if (exceedsLimits(quantity, total)) {
    return { ok: false, error: 'too-large' };
  }
  return { ok: true, value: { quantity, perServing: scaleNutrition(recorded.nutrition, servingSize / recorded.quantity), total } };
}

/** The next number of servings up or down the 0.5 grid, within the limits. */
export function stepServings(servings: number, direction: 1 | -1): number {
  const steps = servings / SERVINGS_STEP;
  // A value off the grid (e.g. 1.2) moves to the neighbouring grid value, not by a full step.
  const next = (direction > 0 ? Math.floor(steps + 1e-9) + 1 : Math.ceil(steps - 1e-9) - 1) * SERVINGS_STEP;
  return Math.min(SERVINGS_MAX, Math.max(SERVINGS_MIN, roundTo(next, 2)));
}

/** The edited entry's input: same name and unit, the portion's amount and totals. */
export function portionInput(entry: Pick<FoodEntry, 'name' | 'unit'>, portion: FoodPortion, meal: MealCategory): FoodEntryInput {
  return {
    name: entry.name,
    quantity: portion.quantity,
    unit: entry.unit,
    meal,
    calories: portion.total.calories,
    proteinGrams: portion.total.proteinGrams,
    carbohydrateGrams: portion.total.carbohydrateGrams,
    fatGrams: portion.total.fatGrams,
  };
}
