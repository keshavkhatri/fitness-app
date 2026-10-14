import { createFoodEntry, validateFoodEntryInput } from './food-entry';
import { SERVINGS_MAX, SERVINGS_MIN, foodPortion, portionInput, scaleNutrition, stepServings } from './food-portion';
import { FoodEntry } from './nutrition.model';

// Synthetic food: 100 g of chicken recorded as 165 kcal, 31 g protein, 0 g carbs, 3.6 g fat.
const created = createFoodEntry(
  { name: 'Grilled chicken', quantity: 100, unit: 'g', meal: 'lunch', calories: 165, proteinGrams: 31, carbohydrateGrams: 0, fatGrams: 3.6 },
  { id: 'e1', date: '2026-10-08', now: '2026-10-08T12:00:00.000Z' },
);
if (!created.ok) {
  throw new Error('fixture');
}
const CHICKEN: FoodEntry = created.value;

const portion = (servingSize: number | null, servings: number) => {
  const r = foodPortion(CHICKEN, servingSize, servings);
  if (!r.ok) {
    throw new Error(r.error);
  }
  return r.value;
};

describe('foodPortion', () => {
  it('is the recorded entry at its own size and one serving', () => {
    expect(portion(100, 1)).toEqual({ quantity: 100, perServing: CHICKEN.nutrition, total: CHICKEN.nutrition });
  });

  it('scales the totals with the number of servings (the mockup case: 1.5 × 100 g)', () => {
    const p = portion(100, 1.5);
    expect(p.quantity).toBe(150);
    expect(p.perServing.calories).toBe(165);
    expect(p.total).toEqual({ calories: 247.5, proteinGrams: 46.5, carbohydrateGrams: 0, fatGrams: 5.4 });
  });

  it('scales per serving and in total with the serving size', () => {
    const p = portion(150, 2);
    expect(p.quantity).toBe(300);
    expect(p.perServing).toEqual({ calories: 247.5, proteinGrams: 46.5, carbohydrateGrams: 0, fatGrams: 5.4 });
    expect(p.total).toEqual({ calories: 495, proteinGrams: 93, carbohydrateGrams: 0, fatGrams: 10.8 });
  });

  it('handles decimal sizes without compounding rounding (totals come from the recorded values)', () => {
    const p = portion(33.3, 3);
    expect(p.quantity).toBe(99.9);
    expect(p.total.calories).toBe(164.8); // 165 × 0.999, not 3 × round(54.945)
    expect(p.perServing.calories).toBe(54.9);
  });

  it('reports a missing or invalid serving size instead of treating it as zero', () => {
    expect(foodPortion(CHICKEN, null, 1)).toEqual({ ok: false, error: 'serving-required' });
    expect(foodPortion(CHICKEN, Number.NaN, 1)).toEqual({ ok: false, error: 'serving-not-a-number' });
    expect(foodPortion(CHICKEN, 0, 1)).toEqual({ ok: false, error: 'serving-not-positive' });
    expect(foodPortion(CHICKEN, -10, 1)).toEqual({ ok: false, error: 'serving-not-positive' });
    expect(foodPortion(CHICKEN, 0.001, 1)).toEqual({ ok: false, error: 'serving-not-positive' });
  });

  it('keeps servings within range and totals within the entry limits', () => {
    expect(foodPortion(CHICKEN, 100, 0)).toEqual({ ok: false, error: 'servings-out-of-range' });
    expect(foodPortion(CHICKEN, 100, SERVINGS_MAX + 1)).toEqual({ ok: false, error: 'servings-out-of-range' });
    expect(foodPortion(CHICKEN, 9_000, 2)).toEqual({ ok: false, error: 'too-large' });
    // 31 g protein per 100 g: 3,300 g would be 1,023 g protein (over the 1,000 g limit).
    expect(foodPortion(CHICKEN, 3_300, 1)).toEqual({ ok: false, error: 'too-large' });
  });

  it('produces input that passes the entry rules and keeps the name and unit', () => {
    const input = portionInput(CHICKEN, portion(100, 1.5), 'dinner');
    expect(input).toEqual({
      name: 'Grilled chicken',
      quantity: 150,
      unit: 'g',
      meal: 'dinner',
      calories: 247.5,
      proteinGrams: 46.5,
      carbohydrateGrams: 0,
      fatGrams: 5.4,
    });
    expect(validateFoodEntryInput(input)).toEqual({});
  });
});

describe('scaleNutrition', () => {
  it('rounds each value to one decimal', () => {
    expect(scaleNutrition({ calories: 100, proteinGrams: 10, carbohydrateGrams: 3.3, fatGrams: 1 }, 1 / 3)).toEqual({
      calories: 33.3,
      proteinGrams: 3.3,
      carbohydrateGrams: 1.1,
      fatGrams: 0.3,
    });
  });
});

describe('stepServings', () => {
  it('moves by half servings within the limits', () => {
    expect(stepServings(1, 1)).toBe(1.5);
    expect(stepServings(1.5, -1)).toBe(1);
    expect(stepServings(SERVINGS_MIN, -1)).toBe(SERVINGS_MIN);
    expect(stepServings(SERVINGS_MAX, 1)).toBe(SERVINGS_MAX);
  });

  it('moves an off-grid value to its neighbouring grid value', () => {
    expect(stepServings(1.2, 1)).toBe(1.5);
    expect(stepServings(1.2, -1)).toBe(1);
  });
});
