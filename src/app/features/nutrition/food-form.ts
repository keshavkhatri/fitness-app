import { parseDecimalInput } from '../../domain/fitness-profile';
import { FoodEntry, FoodEntryErrors, FoodEntryField, FoodEntryInput, MealCategory, QuantityUnit } from '../../domain/nutrition';
import { FIELD_ERRORS, NUMBER_FORMAT_ERROR } from './nutrition-content';

/**
 * The add/edit food form as typed text, and its conversion to domain input.
 * Validation rules live in the domain (validateFoodEntryInput); this only
 * turns text into numbers and domain problems into messages.
 */

export interface FoodFormValues {
  readonly name: string;
  readonly quantity: string;
  readonly unit: QuantityUnit;
  readonly meal: MealCategory;
  readonly calories: string;
  readonly proteinGrams: string;
  readonly carbohydrateGrams: string;
  readonly fatGrams: string;
}

export type FoodFormErrors = Readonly<Partial<Record<FoodEntryField, string>>>;

export const emptyFoodForm = (meal: MealCategory): FoodFormValues => ({
  name: '',
  quantity: '',
  unit: 'g',
  meal,
  calories: '',
  proteinGrams: '',
  carbohydrateGrams: '',
  fatGrams: '',
});

/** Stored numbers back to plain text (no grouping, "." decimal). */
const text = (value: number) => String(value);

export const foodFormOf = (entry: FoodEntry): FoodFormValues => ({
  name: entry.name,
  quantity: text(entry.quantity),
  unit: entry.unit,
  meal: entry.meal,
  calories: text(entry.nutrition.calories),
  proteinGrams: text(entry.nutrition.proteinGrams),
  carbohydrateGrams: text(entry.nutrition.carbohydrateGrams),
  fatGrams: text(entry.nutrition.fatGrams),
});

/** A recently logged food as a new entry for `meal`: same name, amount and nutrition. */
export const foodFormFromRecent = (entry: FoodEntry, meal: MealCategory): FoodFormValues => ({ ...foodFormOf(entry), meal });

type NumberField = 'quantity' | 'calories' | 'proteinGrams' | 'carbohydrateGrams' | 'fatGrams';
const NUMBER_FIELDS: readonly NumberField[] = ['quantity', 'calories', 'proteinGrams', 'carbohydrateGrams', 'fatGrams'];

/**
 * Typed text → a number for domain validation, using the shared strict
 * parser (parseDecimalInput): empty → null (domain: "required"); "-5" → -5
 * (domain: "negative"); unreadable → NaN (domain: "not a number").
 * An ambiguous format ("1,234") is also NaN, so it can never be saved, and
 * is reported separately as a format problem.
 */
export function parseNumberField(value: string): number | null {
  const parsed = parseDecimalInput(value);
  switch (parsed.kind) {
    case 'number':
      return parsed.value;
    case 'empty':
      return null;
    default:
      return Number.NaN;
  }
}

export interface ReadFoodForm {
  readonly input: FoodEntryInput;
  /** Fields whose text was ambiguous (possible thousands separators). */
  readonly formatErrors: FoodFormErrors;
}

export function readFoodForm(values: FoodFormValues): ReadFoodForm {
  const formatErrors: Partial<Record<FoodEntryField, string>> = {};
  for (const field of NUMBER_FIELDS) {
    if (parseDecimalInput(values[field]).kind === 'ambiguous') {
      formatErrors[field] = NUMBER_FORMAT_ERROR;
    }
  }
  return {
    input: {
      name: values.name,
      quantity: parseNumberField(values.quantity),
      unit: values.unit,
      meal: values.meal,
      calories: parseNumberField(values.calories),
      proteinGrams: parseNumberField(values.proteinGrams),
      carbohydrateGrams: parseNumberField(values.carbohydrateGrams),
      fatGrams: parseNumberField(values.fatGrams),
    },
    formatErrors,
  };
}

/** Domain problems as messages; a field's format problem takes precedence. */
export function formErrorsOf(errors: FoodEntryErrors, formatErrors: FoodFormErrors = {}): FoodFormErrors {
  const messages: Partial<Record<FoodEntryField, string>> = {};
  for (const [field, problem] of Object.entries(errors) as [FoodEntryField, NonNullable<FoodEntryErrors[FoodEntryField]>][]) {
    messages[field] = FIELD_ERRORS[field][problem] ?? FIELD_ERRORS[field]['not-a-number'] ?? 'Check this value.';
  }
  return { ...messages, ...formatErrors };
}
