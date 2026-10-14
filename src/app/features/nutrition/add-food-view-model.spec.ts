import { FoodEntry, FoodEntryInput, createFoodEntry } from '../../domain/nutrition';
import { normalizeSearch, searchFoods, toRecentFoodRow } from './add-food-view-model';

// Synthetic foods only.
const INPUT: FoodEntryInput = { name: 'Oats', quantity: 100, unit: 'g', meal: 'breakfast', calories: 389, proteinGrams: 17, carbohydrateGrams: 66, fatGrams: 7 };
const food = (id: string, overrides: Partial<FoodEntryInput> = {}): FoodEntry => {
  const r = createFoodEntry({ ...INPUT, ...overrides }, { id, date: '2026-10-07', now: '2026-10-07T08:00:00.000Z' });
  if (!r.ok) {
    throw new Error('fixture');
  }
  return r.value;
};
const FOODS = [food('1'), food('2', { name: 'Greek yogurt' }), food('3', { name: 'Crème brûlée' }), food('4', { name: 'Brown rice' })];

describe('add food view model', () => {
  it('normalizes case, accents and spaces', () => {
    expect(normalizeSearch('  Crème   Brûlée ')).toBe('creme brulee');
  });

  it('matches every word of the query anywhere in the name, keeping the order', () => {
    expect(searchFoods(FOODS, '').map((f) => f.id)).toEqual(['1', '2', '3', '4']);
    expect(searchFoods(FOODS, '   ').map((f) => f.id)).toEqual(['1', '2', '3', '4']);
    expect(searchFoods(FOODS, 'creme').map((f) => f.id)).toEqual(['3']);
    expect(searchFoods(FOODS, 'RICE brown').map((f) => f.id)).toEqual(['4']);
    expect(searchFoods(FOODS, 'r').map((f) => f.id)).toEqual(['2', '3', '4']);
    expect(searchFoods(FOODS, 'pizza')).toEqual([]);
  });

  it('rows name the food, its amount and calories, and the meal it is added to', () => {
    const row = toRecentFoodRow(food('5', { name: 'Banana', quantity: 1, unit: 'piece', calories: 105 }), 'snacks');
    expect(row).toMatchObject({
      name: 'Banana',
      detail: '1 piece · 105 kcal',
      addLabel: 'Add Banana, 1 piece · 105 kcal, to Snacks',
      reviewLabel: 'Change Banana, 1 piece · 105 kcal, before adding',
    });
  });
});
