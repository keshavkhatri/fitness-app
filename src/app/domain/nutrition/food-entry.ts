import { IsoCalendarDate, isOneOf, parseIsoCalendarDate, roundTo } from '../fitness-profile';
import {
  FOOD_ENTRY_LIMITS,
  FoodEntry,
  FoodEntryErrors,
  FoodEntryField,
  FoodEntryInput,
  FoodEntryProblem,
  MEAL_CATEGORIES,
  NutritionResult,
  NutritionValues,
  QUANTITY_UNITS,
} from './nutrition.model';

/**
 * Food entry rules: validation, creation, editing and a strict parser for
 * stored entries. Pure; ids and timestamps are passed in.
 */

export const isQuantityUnit = isOneOf(QUANTITY_UNITS);
export const isMealCategory = isOneOf(MEAL_CATEGORIES);

const isInstant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

function checkAmount(value: number | null, max: number, positive: boolean): FoodEntryProblem | null {
  if (value === null) {
    return 'required';
  }
  if (!Number.isFinite(value)) {
    return 'not-a-number';
  }
  if (positive ? value <= 0 : value < 0) {
    return positive ? 'not-positive' : 'negative';
  }
  return value > max ? 'too-large' : null;
}

/** Field-level validation; an empty object means the input is valid. */
export function validateFoodEntryInput(input: FoodEntryInput): FoodEntryErrors {
  const L = FOOD_ENTRY_LIMITS;
  const errors: Partial<Record<FoodEntryField, FoodEntryProblem>> = {};
  const name = input.name.trim();
  if (name === '') {
    errors.name = 'required';
  } else if (name.length > L.nameMaxLength) {
    errors.name = 'too-long';
  }
  const checks: [FoodEntryField, number | null, number, boolean][] = [
    ['quantity', input.quantity, L.quantityMax, true],
    ['calories', input.calories, L.caloriesMax, false],
    ['proteinGrams', input.proteinGrams, L.gramsMax, false],
    ['carbohydrateGrams', input.carbohydrateGrams, L.gramsMax, false],
    ['fatGrams', input.fatGrams, L.gramsMax, false],
  ];
  for (const [field, value, max, positive] of checks) {
    const problem = checkAmount(value, max, positive);
    if (problem) {
      errors[field] = problem;
    }
  }
  if (!isQuantityUnit(input.unit)) {
    errors.unit = 'invalid-option';
  }
  if (!isMealCategory(input.meal)) {
    errors.meal = 'invalid-option';
  }
  return errors;
}

const valuesOf = (input: FoodEntryInput): NutritionValues => ({
  calories: roundTo(input.calories ?? 0, 1),
  proteinGrams: roundTo(input.proteinGrams ?? 0, 1),
  carbohydrateGrams: roundTo(input.carbohydrateGrams ?? 0, 1),
  fatGrams: roundTo(input.fatGrams ?? 0, 1),
});

export interface NewEntryContext {
  readonly id: string;
  /** Local calendar date the food was eaten on. */
  readonly date: IsoCalendarDate;
  /** ISO-8601 instant. */
  readonly now: string;
}

/** A new entry from valid input, or the field errors. */
export function createFoodEntry(input: FoodEntryInput, context: NewEntryContext): NutritionResult<FoodEntry, FoodEntryErrors> {
  const errors = validateFoodEntryInput(input);
  if (Object.keys(errors).length > 0) {
    return { ok: false, error: errors };
  }
  return {
    ok: true,
    value: {
      id: context.id,
      date: context.date,
      meal: input.meal,
      name: input.name.trim(),
      quantity: roundTo(input.quantity as number, 2),
      unit: input.unit,
      nutrition: valuesOf(input),
      createdAt: context.now,
      updatedAt: context.now,
    },
  };
}

/** Edits an entry: same id, date and creation time; new values and update time. */
export function updateFoodEntry(entry: FoodEntry, input: FoodEntryInput, now: string): NutritionResult<FoodEntry, FoodEntryErrors> {
  const result = createFoodEntry(input, { id: entry.id, date: entry.date, now });
  return result.ok ? { ok: true, value: { ...result.value, createdAt: entry.createdAt } } : result;
}

/** The input that reproduces an entry (for the edit form). */
export const inputOf = (entry: FoodEntry): FoodEntryInput => ({
  name: entry.name,
  quantity: entry.quantity,
  unit: entry.unit,
  meal: entry.meal,
  calories: entry.nutrition.calories,
  proteinGrams: entry.nutrition.proteinGrams,
  carbohydrateGrams: entry.nutrition.carbohydrateGrams,
  fatGrams: entry.nutrition.fatGrams,
});

/** Strict parser for a stored entry; null when anything is missing, unknown or out of range. */
export function parseFoodEntry(value: unknown): FoodEntry | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const v = value as Record<string, unknown>;
  const n = (v['nutrition'] ?? {}) as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === 'number' ? x : null);
  if (
    typeof v['id'] !== 'string' ||
    v['id'] === '' ||
    typeof v['name'] !== 'string' ||
    !parseIsoCalendarDate(v['date']) ||
    !isInstant(v['createdAt']) ||
    !isInstant(v['updatedAt'])
  ) {
    return null;
  }
  const input: FoodEntryInput = {
    name: v['name'],
    quantity: num(v['quantity']),
    unit: v['unit'] as FoodEntryInput['unit'],
    meal: v['meal'] as FoodEntryInput['meal'],
    calories: num(n['calories']),
    proteinGrams: num(n['proteinGrams']),
    carbohydrateGrams: num(n['carbohydrateGrams']),
    fatGrams: num(n['fatGrams']),
  };
  if (Object.keys(validateFoodEntryInput(input)).length > 0) {
    return null;
  }
  return {
    id: v['id'],
    date: v['date'] as string,
    meal: input.meal,
    name: input.name.trim(),
    quantity: input.quantity as number,
    unit: input.unit,
    nutrition: valuesOf(input),
    createdAt: v['createdAt'] as string,
    updatedAt: v['updatedAt'] as string,
  };
}
