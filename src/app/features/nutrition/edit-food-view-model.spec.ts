import { FoodEntry, createFoodEntry } from '../../domain/nutrition';
import { spokenNutrients, toPortionView } from './edit-food-view-model';

// Synthetic food: 100 g recorded as 165 kcal, 31 g protein, 0 g carbs, 3.6 g fat.
const created = createFoodEntry(
  { name: 'Grilled chicken', quantity: 100, unit: 'g', meal: 'lunch', calories: 165, proteinGrams: 31, carbohydrateGrams: 0, fatGrams: 3.6 },
  { id: 'c', date: '2026-10-08', now: '2026-10-08T12:00:00.000Z' },
);
if (!created.ok) {
  throw new Error('fixture');
}
const CHICKEN: FoodEntry = created.value;

describe('edit food view model', () => {
  it('per serving and total values from the domain, formatted', () => {
    const v = toPortionView(CHICKEN, '100', 1.5);
    expect(v.servingError).toBeNull();
    expect(v.servings).toBe('1.5');
    expect(v.perServing?.map((n) => `${n.value} ${n.label}`)).toEqual(['165 kcal', '31 g Protein', '0 g Carbs', '3.6 g Fat']);
    expect(v.total?.map((n) => n.value)).toEqual(['248', '46.5 g', '0 g', '5.4 g']);
    expect(spokenNutrients('Total', v.portion!.total)).toBe('Total: 248 kcal, 46.5 g protein, 0 g carbs, 5.4 g fat');
  });

  it('accepts a decimal comma; reports empty, invalid and ambiguous sizes instead of zero', () => {
    expect(toPortionView(CHICKEN, '50,5', 1).portion?.quantity).toBe(50.5);
    expect(toPortionView(CHICKEN, '', 1)).toMatchObject({ portion: null, total: null, servingError: 'Enter a serving size.' });
    expect(toPortionView(CHICKEN, 'abc', 1).servingError).toBe('Enter a number, like 100 or 1.5.');
    expect(toPortionView(CHICKEN, '0', 1).servingError).toBe('Enter a serving size above 0.');
    expect(toPortionView(CHICKEN, '1,000', 1).servingError).toBe("Check number format. Use one decimal separator. Thousands separators aren't supported.");
  });
});
