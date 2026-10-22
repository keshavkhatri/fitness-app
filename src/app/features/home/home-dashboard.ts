import { WeightHistoryState } from '../../core/body-measurements/weight-history.service';
import { TargetState } from '../../core/nutrition/nutrition.service';
import {
  DEFAULT_STEP_GOAL,
  STREAK_MILESTONES,
  formatSteps,
  stepsFraction,
} from '../../domain/daily-check-in';
import { IsoCalendarDate, weightInUnit } from '../../domain/fitness-profile';
import { MealCategory, NutritionDay, NutritionWeek, weekDates, weekStartOf } from '../../domain/nutrition';
import { formatChange, formatDisplayWeight } from '../body-weight/weight-history-view-model';
import { MEAL_LABELS } from '../nutrition/nutrition-content';
import { DaySummaryView, formatKcal } from '../nutrition/nutrition-view-model';
import { HomeWeekView } from './home-training';

/**
 * Home's dashboard cards below the week (the mockup's second half): the next streak milestone, body overview,
 * hydration, macro rings, today's meals, the week's averages and today's focus. Pure: the page reads the data,
 * these only shape it. Nothing is invented: a missing value reads as missing, not as zero.
 */

const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
// "0.25", "1.5", "3.0": a glass (250 ml) is never rounded away.
const litres = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

// --- Next milestone ------------------------------------------------------------------------

export interface MilestoneView {
  /** "2 days", or the streak itself once every milestone is behind. */
  readonly headline: string;
  readonly caption: string;
  /** One dot per day from the last milestone to the next (true = done); null when that's over 7 days. */
  readonly dots: readonly boolean[] | null;
  /** 0–1 towards the next milestone. */
  readonly progress: number;
  readonly accessibleLabel: string;
}

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

export function toMilestone(streak: number | null): MilestoneView {
  const current = Math.max(0, streak ?? 0);
  const next = STREAK_MILESTONES.find((m) => m > current);
  if (next === undefined) {
    return {
      headline: days(current),
      caption: 'Every milestone reached',
      dots: null,
      progress: 1,
      accessibleLabel: `${days(current)} streak. Every milestone reached.`,
    };
  }
  const previous = [...STREAK_MILESTONES].reverse().find((m) => m <= current) ?? 0;
  const span = next - previous;
  const done = current - previous;
  const caption = current === 0 ? `Start a ${next}-day streak` : `Keep your ${next}-day streak`;
  return {
    headline: days(next - current),
    caption,
    dots: span <= 7 ? Array.from({ length: span }, (_, i) => i < done) : null,
    progress: span > 0 ? done / span : 0,
    accessibleLabel: `${days(next - current)} to a ${next}-day streak. Current streak ${days(current)}.`,
  };
}

// --- Body overview -------------------------------------------------------------------------

export type BodyOverviewView =
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'ready';
      /** "94.5 kg" */
      readonly latest: string;
      /** "1.2 kg" (no sign: the arrow says which way), null without an earlier weigh-in this month. */
      readonly change: string | null;
      readonly direction: 'up' | 'down' | 'same' | null;
      /** Sparkline points, 0–1 (higher = heavier), oldest first; at least two or none. */
      readonly points: readonly number[];
      readonly accessibleLabel: string;
    };

/**
 * The latest weigh-in, and the change this calendar month: from the last weigh-in before the month began (or the
 * month's first one) to the latest. The sparkline draws the same stretch.
 */
export function toBodyOverview(state: WeightHistoryState, today: IsoCalendarDate): BodyOverviewView | null {
  if (state.status !== 'ready') {
    return state.status === 'loading' ? null : { kind: 'empty' };
  }
  if (state.entries.length === 0) {
    return { kind: 'empty' };
  }
  const unit = state.unitSystem;
  const sorted = [...state.entries].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const latestEntry = sorted[sorted.length - 1];
  const monthStart = `${today.slice(0, 7)}-01`;
  const beforeMonth = sorted.filter((e) => e.date < monthStart);
  const firstIndex = beforeMonth.length ? beforeMonth.length - 1 : sorted.findIndex((e) => e.date >= monthStart);
  const stretch = sorted.slice(Math.max(0, firstIndex)).slice(-12);
  const values = stretch.map((e) => weightInUnit(e.weight, unit));
  const latest = weightInUnit(latestEntry.weight, unit);
  const baseline = stretch.length > 1 ? values[0] : null;
  const delta = baseline === null ? null : Math.round((latest - baseline) * 10) / 10;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values.length > 1 ? values.map((v) => (max === min ? 0.5 : (v - min) / (max - min))) : [];
  const latestText = formatDisplayWeight(latest, unit);
  const change = delta === null ? null : delta === 0 ? 'No change' : formatChange(delta, unit).replace(/^[+−]/, '');
  const direction = delta === null ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
  return {
    kind: 'ready',
    latest: latestText,
    change,
    direction,
    points,
    accessibleLabel:
      `Current weight ${latestText}.` +
      (delta === null ? '' : delta === 0 ? ' No change this month.' : ` ${direction === 'down' ? 'Down' : 'Up'} ${change} this month.`),
  };
}

// --- Hydration -----------------------------------------------------------------------------

export const HYDRATION_GLASSES = 4;

export interface HydrationView {
  /** "1.2" (litres) */
  readonly amount: string;
  /** "/ 3.0 L" */
  readonly goal: string;
  /** How full each of the four glasses is, 0–1 (each is a quarter of the goal). */
  readonly glasses: readonly number[];
  readonly reached: boolean;
  readonly accessibleLabel: string;
}

export function toHydration(ml: number, goalMl: number): HydrationView {
  const quarter = goalMl / HYDRATION_GLASSES;
  const amount = litres.format(ml / 1000);
  const goal = litres.format(goalMl / 1000);
  return {
    amount,
    goal: `/ ${goal} L`,
    glasses: Array.from({ length: HYDRATION_GLASSES }, (_, i) => Math.min(1, Math.max(0, (ml - i * quarter) / quarter))),
    reached: ml >= goalMl,
    accessibleLabel: `Water today: ${amount} of ${goal} litres.`,
  };
}

// --- Macronutrient target ------------------------------------------------------------------

export interface MacroRingView {
  readonly key: 'protein' | 'calories' | 'carbs' | 'fat';
  readonly label: string;
  /** "0g", "1,420" */
  readonly eaten: string;
  /** "/ 170g", "/ 2,626"; null without a target (no ring then). */
  readonly target: string | null;
  readonly value: number;
  readonly max: number;
  readonly valueText: string;
}

const grams = (text: string) => text.replace(/\s+g$/, 'g');

export function toMacroRings(summary: DaySummaryView): readonly MacroRingView[] {
  const [protein, carbs, fat] = summary.macros;
  const macro = (row: DaySummaryView['macros'][number], label: string): MacroRingView => ({
    key: row.key,
    label,
    eaten: grams(row.eaten),
    target: row.target ? `/ ${grams(row.target)}` : null,
    value: row.progress?.value ?? 0,
    max: row.progress?.max ?? 1,
    valueText: row.progress?.valueText ?? `${label}: ${row.eaten}`,
  });
  const c = summary.calories;
  return [
    macro(protein, 'Protein'),
    {
      key: 'calories',
      label: 'Calories',
      eaten: c.eaten,
      target: c.target ? `/ ${c.target}` : null,
      value: c.progress?.value ?? 0,
      max: c.progress?.max ?? 1,
      valueText: c.progress?.valueText ?? `Calories: ${c.eaten} kcal`,
    },
    macro(carbs, 'Carbs'),
    macro(fat, 'Fats'),
  ];
}

// --- Today's meals -------------------------------------------------------------------------

/** The mockup's order: the day as it is eaten. */
export const HOME_MEAL_ORDER: readonly MealCategory[] = ['breakfast', 'lunch', 'snacks', 'dinner'];

export interface MealTileView {
  readonly meal: MealCategory;
  readonly label: string;
  /** "320 kcal" once something is logged. */
  readonly calories: string | null;
  readonly addLabel: string;
}

export function toMealTiles(day: NutritionDay): readonly MealTileView[] {
  return HOME_MEAL_ORDER.map((meal) => {
    const group = day.meals.find((m) => m.meal === meal);
    const logged = !!group && group.entries.length > 0;
    const label = MEAL_LABELS[meal];
    return {
      meal,
      label,
      calories: logged ? `${formatKcal(group.totals.calories)} kcal` : null,
      addLabel: logged ? `Add to ${label}, ${formatKcal(group.totals.calories)} kcal logged` : `Add to ${label}`,
    };
  });
}

// --- Weekly progress -----------------------------------------------------------------------

export interface WeeklyStatView {
  readonly label: string;
  /** "1/3", "6,240", "2,100 kcal"; "–" when nothing was recorded. */
  readonly value: string;
  /** 0–1 against the goal; null when there is no goal or no data. */
  readonly progress: number | null;
}

export interface WeeklyProgressView {
  readonly stats: readonly [WeeklyStatView, WeeklyStatView, WeeklyStatView];
  readonly accessibleLabel: string;
}

const NONE = '–';

/**
 * This week so far: workouts done of planned, the average of the days with steps logged, and the average of the
 * days with food logged (the Nutrition week's own average).
 */
export function toWeeklyProgress(input: {
  readonly week: HomeWeekView | null;
  readonly steps: Readonly<Record<IsoCalendarDate, number>>;
  readonly nutrition: NutritionWeek | null;
  readonly targets: TargetState | null;
  readonly today: IsoCalendarDate;
}): WeeklyProgressView {
  const monday = weekStartOf(input.today);
  const elapsed = monday ? weekDates(monday).filter((d) => d <= input.today) : [];
  const stepDays = elapsed.map((d) => input.steps[d]).filter((s): s is number => typeof s === 'number');
  const avgSteps = stepDays.length ? Math.round(stepDays.reduce((a, b) => a + b, 0) / stepDays.length) : null;
  const avgKcal = input.nutrition?.average?.calories ?? null;
  const t = input.targets?.kind === 'available' ? input.targets.targets.calories : null;
  const kcalTarget = t?.kind === 'target' ? t.kcal : null;
  const w = input.week;

  const workouts: WeeklyStatView = {
    label: 'Workouts',
    value: w ? `${w.done}/${w.planned}` : NONE,
    progress: w && w.planned > 0 ? Math.min(1, w.done / w.planned) : null,
  };
  const steps: WeeklyStatView = {
    label: 'Avg. Steps',
    value: avgSteps === null ? NONE : whole.format(avgSteps),
    progress: avgSteps === null ? null : stepsFraction(avgSteps, DEFAULT_STEP_GOAL),
  };
  const calories: WeeklyStatView = {
    label: 'Avg. Calories',
    value: avgKcal === null ? NONE : `${formatKcal(avgKcal)} kcal`,
    progress: avgKcal === null || !kcalTarget ? null : Math.min(1, avgKcal / kcalTarget),
  };
  const said = (s: WeeklyStatView, none: string) => (s.value === NONE ? none : s.value);
  return {
    stats: [workouts, steps, calories],
    accessibleLabel:
      `This week: ${w ? `${w.done} of ${w.planned} workouts` : 'no workouts planned'}, ` +
      `average steps ${said(steps, 'not logged')}, average calories ${said(calories, 'not logged')}.`,
  };
}

// --- Today's focus -------------------------------------------------------------------------

export interface FocusItemView {
  readonly key: 'steps' | 'protein' | 'sleep';
  /** "10k+" */
  readonly value: string;
  readonly label: string;
  readonly ariaLabel: string;
}

/** Today's three aims: the step goal, the protein target (when there is one) and a night's sleep. */
export function toFocus(summary: DaySummaryView | null): readonly FocusItemView[] {
  const items: FocusItemView[] = [
    { key: 'steps', value: `${formatSteps(DEFAULT_STEP_GOAL)}+`, label: 'Steps', ariaLabel: `Walk ${whole.format(DEFAULT_STEP_GOAL)} steps or more. Log steps` },
  ];
  const protein = summary?.macros.find((m) => m.key === 'protein');
  if (protein?.target) {
    const g = grams(protein.target);
    items.push({ key: 'protein', value: `${g}+`, label: 'Protein', ariaLabel: `Eat ${g.replace('g', ' grams')} of protein or more. Open Nutrition` });
  }
  items.push({ key: 'sleep', value: '7h+', label: 'Sleep', ariaLabel: 'Sleep 7 hours or more tonight' });
  return items;
}
