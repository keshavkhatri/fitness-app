import { IsoCalendarDate } from '../fitness-profile';
import { FoodEntry, MEAL_CATEGORIES, MealCategory, NutritionValues } from './nutrition.model';

/**
 * Daily aggregation. Totals are always derived from the entries (never
 * stored) and summed in exact tenths, so 0.1 + 0.2 is 0.3. Dates are already
 * local calendar dates supplied by the app layer; nothing here uses time zones.
 */

const ZERO: NutritionValues = { calories: 0, proteinGrams: 0, carbohydrateGrams: 0, fatGrams: 0 };
const tenths = (value: number) => Math.round(value * 10);

export function sumNutrition(entries: readonly FoodEntry[]): NutritionValues {
  const t = entries.reduce(
    (acc, e) => ({
      calories: acc.calories + tenths(e.nutrition.calories),
      proteinGrams: acc.proteinGrams + tenths(e.nutrition.proteinGrams),
      carbohydrateGrams: acc.carbohydrateGrams + tenths(e.nutrition.carbohydrateGrams),
      fatGrams: acc.fatGrams + tenths(e.nutrition.fatGrams),
    }),
    ZERO,
  );
  return { calories: t.calories / 10, proteinGrams: t.proteinGrams / 10, carbohydrateGrams: t.carbohydrateGrams / 10, fatGrams: t.fatGrams / 10 };
}

/** Entries eaten on one local calendar date, in logging order (then id, for determinism). */
export function entriesOn(entries: readonly FoodEntry[], date: IsoCalendarDate): FoodEntry[] {
  return entries
    .filter((e) => e.date === date)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Entries with `from <= date <= to` (inclusive, ISO dates compare as strings). */
export const entriesBetween = (entries: readonly FoodEntry[], from: IsoCalendarDate, to: IsoCalendarDate) =>
  entries.filter((e) => e.date >= from && e.date <= to);

export interface MealGroup {
  readonly meal: MealCategory;
  readonly entries: readonly FoodEntry[];
  readonly totals: NutritionValues;
}

/** One group per meal category, in the given order, including empty meals. */
export function groupByMeal(entries: readonly FoodEntry[], meals: readonly MealCategory[] = MEAL_CATEGORIES): MealGroup[] {
  return meals.map((meal) => {
    const inMeal = entries.filter((e) => e.meal === meal);
    return { meal, entries: inMeal, totals: sumNutrition(inMeal) };
  });
}

export interface NutritionDay {
  readonly date: IsoCalendarDate;
  readonly entries: readonly FoodEntry[];
  readonly totals: NutritionValues;
  readonly meals: readonly MealGroup[];
}

export function nutritionDay(entries: readonly FoodEntry[], date: IsoCalendarDate, meals: readonly MealCategory[] = MEAL_CATEGORIES): NutritionDay {
  const day = entriesOn(entries, date);
  return { date, entries: day, totals: sumNutrition(day), meals: groupByMeal(day, meals) };
}

/** Consumed against a target: what is left, or how far over (never both). */
export interface Balance {
  readonly target: number;
  readonly consumed: number;
  readonly remaining: number;
  readonly over: number;
}

export function balance(target: number, consumed: number): Balance {
  const diff = (tenths(target) - tenths(consumed)) / 10;
  return { target, consumed, remaining: Math.max(0, diff), over: Math.max(0, -diff) };
}
