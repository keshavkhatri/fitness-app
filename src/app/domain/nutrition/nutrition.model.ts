import { IsoCalendarDate } from '../fitness-profile';

/**
 * Logged food. Every entry is a snapshot of what the user recorded: its
 * nutrition values never change if a food catalog (a later phase) changes.
 * Calculated targets are a separate concept (see nutrition-targets.ts) and are
 * never stored here.
 */

export const QUANTITY_UNITS = ['g', 'ml', 'serving', 'piece'] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];

/** Initial meal set, in day order (configurable by passing a different list). */
export const MEAL_CATEGORIES = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;
export type MealCategory = (typeof MEAL_CATEGORIES)[number];

/** Energy and macronutrients, stored with one decimal place. */
export interface NutritionValues {
  readonly calories: number;
  readonly proteinGrams: number;
  readonly carbohydrateGrams: number;
  readonly fatGrams: number;
}

export interface FoodEntry {
  /** Stable, unique per entry. */
  readonly id: string;
  /** The user's local calendar date the food was eaten on ("YYYY-MM-DD"), chosen by the app layer. */
  readonly date: IsoCalendarDate;
  readonly meal: MealCategory;
  readonly name: string;
  /** Up to two decimals, e.g. 150 g, 0.5 serving. */
  readonly quantity: number;
  readonly unit: QuantityUnit;
  /** What the user recorded for this quantity (not per 100 g). */
  readonly nutrition: NutritionValues;
  /** ISO-8601 instants. */
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** What the user enters (already parsed to numbers by the UI; null = left empty). */
export interface FoodEntryInput {
  readonly name: string;
  readonly quantity: number | null;
  readonly unit: QuantityUnit;
  readonly meal: MealCategory;
  readonly calories: number | null;
  readonly proteinGrams: number | null;
  readonly carbohydrateGrams: number | null;
  readonly fatGrams: number | null;
}

export type FoodEntryField = 'name' | 'quantity' | 'unit' | 'meal' | 'calories' | 'proteinGrams' | 'carbohydrateGrams' | 'fatGrams';

export type FoodEntryProblem = 'required' | 'too-long' | 'not-positive' | 'negative' | 'not-a-number' | 'too-large' | 'invalid-option';

/** Field-level problems; empty when the input is valid. */
export type FoodEntryErrors = Readonly<Partial<Record<FoodEntryField, FoodEntryProblem>>>;

export type NutritionResult<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

/**
 * Upper bounds that catch typing mistakes (e.g. an extra zero), not dietary
 * limits. A single logged item above these is almost certainly an error.
 */
export const FOOD_ENTRY_LIMITS = {
  nameMaxLength: 80,
  quantityMax: 10_000,
  caloriesMax: 10_000,
  gramsMax: 1_000,
} as const;
