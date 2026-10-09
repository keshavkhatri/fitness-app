import { NutritionState, TargetState } from '../../core/nutrition/nutrition.service';
import { IsoCalendarDate, parseIsoCalendarDate, roundTo } from '../../domain/fitness-profile';
import { FoodEntry, MealCategory, MealGroup, NutritionDay, NutritionValues, balance } from '../../domain/nutrition';
import { dayLabel } from '../workout/history/history-view-model';
import { MEAL_LABELS, NUTRITION_COPY, UNIT_LABELS } from './nutrition-content';

/**
 * Presentation models for the Nutrition dashboard. Consumed amounts come from
 * the day's logged entries; targets only from the calculation engine (via
 * NutritionService). When a target is withheld, only what was eaten is shown;
 * no substitute target is ever made up here.
 */

const copy = NUTRITION_COPY;
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** "1,420" (calories are shown as whole numbers). */
export const formatKcal = (kcal: number) => whole.format(Math.round(kcal));
/** "17.3" / "140" (grams to one decimal). */
export const formatGrams = (grams: number) => oneDecimal.format(roundTo(grams, 1));

/** "150 g", "1.5 servings", "1 piece". */
export function formatQuantity(quantity: number, unit: FoodEntry['unit']): string {
  const label = UNIT_LABELS[unit];
  return `${twoDecimals.format(quantity)} ${quantity === 1 ? label.one : label.many}`;
}

// --- Date --------------------------------------------------------------------------------

export interface DateHeaderView {
  readonly label: string;
  readonly isToday: boolean;
  /** Days after today aren't loggable. */
  readonly canGoNext: boolean;
}

export function toDateHeader(date: IsoCalendarDate, today: IsoCalendarDate): DateHeaderView {
  const day = parseIsoCalendarDate(date);
  const now = parseIsoCalendarDate(today);
  return {
    label: day && now ? dayLabel(day, now) : date,
    isToday: date === today,
    canGoNext: date < today,
  };
}

// --- Summaries ---------------------------------------------------------------------------

export interface ProgressView {
  readonly value: number;
  readonly max: number;
  readonly valueText: string;
}

export interface CalorieSummaryView {
  /** "1,420 / 2,000 kcal", or "1,420 kcal eaten" without a target. */
  readonly headline: string;
  readonly eaten: string;
  readonly target: string | null;
  /** "580 kcal remaining" | "120 kcal over target" | null without a target. */
  readonly status: string | null;
  /** The remaining or over amount alone ("580"), when there's a target. */
  readonly balance: string | null;
  readonly over: boolean;
  readonly progress: ProgressView | null;
}

export interface MacroRowView {
  readonly key: 'protein' | 'carbs' | 'fat';
  readonly label: string;
  /** "62 g" */
  readonly eaten: string;
  /** "140 g" when a target exists. */
  readonly target: string | null;
  /** "78 g remaining" | "5 g over" */
  readonly status: string | null;
  readonly progress: ProgressView | null;
}

function calorieSummary(eatenKcal: number, targetKcal: number | null): CalorieSummaryView {
  const eaten = formatKcal(eatenKcal);
  if (targetKcal === null) {
    return { headline: copy.calories.eatenOnly(eaten), eaten, target: null, status: null, balance: null, over: false, progress: null };
  }
  // Balance of the displayed (rounded) numbers, so "eaten + remaining = target" on screen.
  const b = balance(Math.round(targetKcal), Math.round(eatenKcal));
  const target = formatKcal(targetKcal);
  const status = b.over > 0 ? `${formatKcal(b.over)} kcal over target` : `${formatKcal(b.remaining)} kcal remaining`;
  return {
    headline: `${eaten} / ${target} kcal`,
    eaten,
    target,
    status,
    balance: formatKcal(b.over > 0 ? b.over : b.remaining),
    over: b.over > 0,
    progress: { value: Math.min(b.consumed, b.target), max: Math.max(b.target, 1), valueText: `${eaten} of ${target} kcal, ${status}` },
  };
}

function macroRow(key: MacroRowView['key'], label: string, eatenGrams: number, targetGrams: number | null): MacroRowView {
  const eaten = `${formatGrams(eatenGrams)} g`;
  if (targetGrams === null) {
    return { key, label, eaten, target: null, status: null, progress: null };
  }
  const b = balance(roundTo(targetGrams, 1), roundTo(eatenGrams, 1));
  const target = `${formatGrams(targetGrams)} g`;
  const status = b.over > 0 ? `${formatGrams(b.over)} g over` : `${formatGrams(b.remaining)} g remaining`;
  return {
    key,
    label,
    eaten,
    target,
    status,
    progress: { value: Math.min(b.consumed, b.target), max: Math.max(b.target, 1), valueText: `${label}: ${eaten} of ${target}, ${status}` },
  };
}

// --- Notices -----------------------------------------------------------------------------

export type NoticeAction = 'set-up-profile' | 'review-profile';

export interface TargetNoticeView {
  readonly id: 'no-profile' | 'unavailable' | 'calorie-review' | 'calorie-adjusted' | 'macros-constrained' | 'macros-infeasible';
  readonly title: string;
  readonly message: string;
  readonly tone: 'info' | 'warning';
  readonly action: { readonly kind: NoticeAction; readonly label: string } | null;
}

function noticesFor(targets: TargetState): TargetNoticeView[] {
  const n = copy.notices;
  switch (targets.kind) {
    case 'no-profile':
      return [{ id: 'no-profile', ...n.noProfile, tone: 'info', action: { kind: 'set-up-profile', label: n.noProfile.action } }];
    case 'unavailable':
      return [{ id: 'unavailable', ...n.unavailable, tone: 'warning', action: { kind: 'review-profile', label: n.unavailable.action } }];
  }
  const { calories, macros } = targets.targets;
  if (calories.kind === 'review-required') {
    // One notice: macro targets are withheld for the same reason.
    return [{ id: 'calorie-review', ...n.calorieReview, tone: 'warning', action: { kind: 'review-profile', label: n.calorieReview.action } }];
  }
  const notices: TargetNoticeView[] = [];
  if (calories.adjusted) {
    notices.push({ id: 'calorie-adjusted', ...n.calorieAdjusted, tone: 'info', action: null });
  }
  if (macros.kind === 'withheld') {
    notices.push({ id: 'macros-infeasible', ...n.macrosInfeasible, tone: 'warning', action: { kind: 'review-profile', label: n.macrosInfeasible.action } });
  } else if (macros.constrained) {
    notices.push({ id: 'macros-constrained', ...n.macrosConstrained, tone: 'info', action: null });
  }
  return notices;
}

// --- Meals -------------------------------------------------------------------------------

export interface FoodRowView {
  readonly id: string;
  readonly name: string;
  /** "170 g · 17.3 g protein" */
  readonly detail: string;
  readonly calories: string;
  /** Accessible name of the row's edit button. */
  readonly ariaLabel: string;
}

export interface MealView {
  readonly meal: MealCategory;
  readonly title: string;
  /** "330 kcal" */
  readonly subtotal: string;
  readonly entries: readonly FoodRowView[];
  readonly addLabel: string;
}

export function toFoodRow(entry: FoodEntry): FoodRowView {
  const quantity = formatQuantity(entry.quantity, entry.unit);
  const protein = `${formatGrams(entry.nutrition.proteinGrams)} g protein`;
  const calories = `${formatKcal(entry.nutrition.calories)} kcal`;
  return {
    id: entry.id,
    name: entry.name,
    detail: `${quantity} · ${protein}`,
    calories,
    ariaLabel: `Edit ${entry.name}, ${quantity}, ${calories}, ${protein}`,
  };
}

const toMeal = (group: MealGroup): MealView => ({
  meal: group.meal,
  title: MEAL_LABELS[group.meal],
  subtotal: `${formatKcal(group.totals.calories)} kcal`,
  entries: group.entries.map(toFoodRow),
  addLabel: copy.meals.addTo(MEAL_LABELS[group.meal]),
});

// --- Screen ------------------------------------------------------------------------------

export type NutritionScreen =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | {
      readonly kind: 'ready';
      readonly calories: CalorieSummaryView;
      readonly macros: readonly MacroRowView[];
      readonly notices: readonly TargetNoticeView[];
      readonly meals: readonly MealView[];
      readonly isEmpty: boolean;
    };

/** A day's intake against its targets: shared by the Nutrition dashboard and Home. */
export interface DaySummaryView {
  readonly calories: CalorieSummaryView;
  readonly macros: readonly MacroRowView[];
  /** Short explanation when a target is withheld or unavailable (for compact cards). */
  readonly targetNote: string | null;
}

export function toDaySummary(day: NutritionDay, targetState: TargetState): DaySummaryView {
  const totals: NutritionValues = day.totals;
  const targets = targetState.kind === 'available' ? targetState.targets : null;
  const kcal = targets?.calories.kind === 'target' ? targets.calories.kcal : null;
  const macros = targets?.macros.kind === 'target' ? targets.macros : null;
  const withheld = noticesFor(targetState).find((n) => n.id in copy.brief);
  return {
    calories: calorieSummary(totals.calories, kcal),
    macros: [
      macroRow('protein', copy.macros.protein, totals.proteinGrams, macros?.proteinGrams ?? null),
      macroRow('carbs', copy.macros.carbs, totals.carbohydrateGrams, macros?.carbohydrateGrams ?? null),
      macroRow('fat', copy.macros.fat, totals.fatGrams, macros?.fatGrams ?? null),
    ],
    targetNote: withheld ? copy.brief[withheld.id as keyof typeof copy.brief] : null,
  };
}

export function toNutritionScreen(state: NutritionState): NutritionScreen {
  if (state.status !== 'ready') {
    return { kind: state.status };
  }
  const { calories, macros } = toDaySummary(state.day, state.targets);
  return {
    kind: 'ready',
    calories,
    macros,
    notices: noticesFor(state.targets),
    meals: state.day.meals.map(toMeal),
    isEmpty: state.day.entries.length === 0,
  };
}

/** Meal preselected for "Log Food" on an empty day, from the local time of day. */
export function suggestedMeal(now: Date): MealCategory {
  const hour = now.getHours();
  return hour < 11 ? 'breakfast' : hour < 16 ? 'lunch' : hour < 21 ? 'dinner' : 'snacks';
}
