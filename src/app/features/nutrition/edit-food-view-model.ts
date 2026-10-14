import { parseDecimalInput } from '../../domain/fitness-profile';
import { FoodPortion, NutritionValues, PortionResult, foodPortion } from '../../domain/nutrition';
import { parseNumberField } from './food-form';
import { NUMBER_FORMAT_ERROR, NUTRITION_COPY } from './nutrition-content';
import { formatGrams, formatKcal } from './nutrition-view-model';

/**
 * Edit Food's portion: a serving size (in the entry's own unit) eaten a
 * number of times, with every value derived by the domain (foodPortion).
 * The calculation never sees a missing amount as zero.
 */

const copy = NUTRITION_COPY.form;
const twoDecimals = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export interface NutrientView {
  readonly key: 'calories' | 'protein' | 'carbs' | 'fat';
  /** "165" / "46.5 g" */
  readonly value: string;
  /** "kcal" / "Protein" */
  readonly label: string;
}

export function toNutrients(values: NutritionValues): NutrientView[] {
  return [
    { key: 'calories', value: formatKcal(values.calories), label: 'kcal' },
    { key: 'protein', value: `${formatGrams(values.proteinGrams)} g`, label: 'Protein' },
    { key: 'carbs', value: `${formatGrams(values.carbohydrateGrams)} g`, label: 'Carbs' },
    { key: 'fat', value: `${formatGrams(values.fatGrams)} g`, label: 'Fat' },
  ];
}

/** "Total: 248 kcal, 46.5 g protein, 0 g carbs, 5.4 g fat" (one sentence for screen readers). */
export const spokenNutrients = (title: string, values: NutritionValues) =>
  `${title}: ${formatKcal(values.calories)} kcal, ${formatGrams(values.proteinGrams)} g protein, ${formatGrams(values.carbohydrateGrams)} g carbs, ${formatGrams(values.fatGrams)} g fat`;

export interface PortionView {
  readonly portion: FoodPortion | null;
  /** The serving size field's error (null when valid). */
  readonly servingError: string | null;
  readonly perServing: readonly NutrientView[] | null;
  readonly total: readonly NutrientView[] | null;
  /** "1.5" */
  readonly servings: string;
}

export function toPortionView(recorded: Parameters<typeof foodPortion>[0], servingText: string, servings: number): PortionView {
  const ambiguous = parseDecimalInput(servingText).kind === 'ambiguous';
  const result: PortionResult = foodPortion(recorded, parseNumberField(servingText), servings);
  const servingsText = twoDecimals.format(servings);
  if (!result.ok) {
    const servingError = ambiguous ? NUMBER_FORMAT_ERROR : copy.portionErrors[result.error];
    return { portion: null, servingError, perServing: null, total: null, servings: servingsText };
  }
  return {
    portion: result.value,
    servingError: null,
    perServing: toNutrients(result.value.perServing),
    total: toNutrients(result.value.total),
    servings: servingsText,
  };
}
