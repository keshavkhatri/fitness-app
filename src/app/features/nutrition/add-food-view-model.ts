import { FoodEntry, MealCategory } from '../../domain/nutrition';
import { MEAL_LABELS, NUTRITION_COPY } from './nutrition-content';
import { formatKcal, formatQuantity } from './nutrition-view-model';

/**
 * Add food's recent-food search. Foods only ever come from the user's own
 * log (the last 30 days); there's no food database behind this search.
 */

const copy = NUTRITION_COPY.add;

/** Lower case, without accents or extra spaces ("Crème  Brûlée" → "creme brulee"). */
export const normalizeSearch = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Foods whose name contains every word of the query, in their original order; all of them for an empty query. */
export function searchFoods(foods: readonly FoodEntry[], query: string): FoodEntry[] {
  const words = normalizeSearch(query).split(' ').filter(Boolean);
  return words.length ? foods.filter((f) => words.every((w) => normalizeSearch(f.name).includes(w))) : [...foods];
}

export interface RecentFoodRowView {
  readonly id: string;
  readonly name: string;
  /** "100 g · 389 kcal" */
  readonly detail: string;
  /** Accessible names: the one-tap add (to the chosen meal) and the row (change first). */
  readonly addLabel: string;
  readonly reviewLabel: string;
  readonly entry: FoodEntry;
}

export function toRecentFoodRow(entry: FoodEntry, meal: MealCategory): RecentFoodRowView {
  const detail = `${formatQuantity(entry.quantity, entry.unit)} · ${formatKcal(entry.nutrition.calories)} kcal`;
  return {
    id: entry.id,
    name: entry.name,
    detail,
    addLabel: copy.addLabel(entry.name, detail, MEAL_LABELS[meal]),
    reviewLabel: copy.reviewLabel(entry.name, detail),
    entry,
  };
}
