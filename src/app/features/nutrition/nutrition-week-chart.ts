import { TargetState } from '../../core/nutrition/nutrition.service';
import { IsoCalendarDate, parseIsoCalendarDate, roundTo } from '../../domain/fitness-profile';
import { NutritionValues, NutritionWeek } from '../../domain/nutrition';
import { formatGrams, formatKcal } from './nutrition-view-model';

/**
 * The weekly charts: one bar per day for a value (calories or a macro), with
 * the current daily target drawn behind each bar when there is one. A day
 * without entries has no bar (never a zero bar); upcoming days are marked.
 * Framework-free; the template only places what's computed here.
 */

export type WeekMetric = 'calories' | 'protein' | 'carbs' | 'fat';

const FIELD: Readonly<Record<WeekMetric, keyof NutritionValues>> = {
  calories: 'calories',
  protein: 'proteinGrams',
  carbs: 'carbohydrateGrams',
  fat: 'fatGrams',
};
const NAME: Readonly<Record<WeekMetric, string>> = { calories: 'Calories', protein: 'Protein', carbs: 'Carbs', fat: 'Fat' };
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
/** Axis scale with nothing to show yet (an empty week without targets). */
const EMPTY_SCALE: Readonly<Record<WeekMetric, number>> = { calories: 2000, protein: 200, carbs: 200, fat: 100 };
const TICKS = 4;

export const formatMetric = (metric: WeekMetric, value: number) => (metric === 'calories' ? `${formatKcal(value)} kcal` : `${formatGrams(value)} g`);

/** The daily target for a metric, or null when there's none (no profile, withheld, unavailable). */
export function targetFor(targets: TargetState, metric: WeekMetric): number | null {
  if (targets.kind !== 'available') {
    return null;
  }
  const { calories, macros } = targets.targets;
  if (metric === 'calories') {
    return calories.kind === 'target' ? calories.kcal : null;
  }
  return macros.kind === 'target' ? macros[FIELD[metric] as 'proteinGrams' | 'carbohydrateGrams' | 'fatGrams'] : null;
}

/** The smallest "nice" axis top (four steps of 1, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 × 10ⁿ) at or above `value`. */
export function niceMax(value: number): number {
  if (!(value > 0)) {
    return 0;
  }
  const raw = value / TICKS;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * magnitude).find((s) => s >= raw - 1e-9)!;
  return roundTo(step * TICKS, 6);
}

/** "2k", "1.5k", "500" (calories); "150" (grams). */
const tickLabel = (metric: WeekMetric, value: number) =>
  metric === 'calories' && value >= 1000 ? `${roundTo(value / 1000, 1)}k` : String(roundTo(value, 1));

export interface WeekBarView {
  readonly date: IsoCalendarDate;
  /** "M" */
  readonly letter: string;
  readonly status: 'logged' | 'not-logged' | 'upcoming';
  readonly isToday: boolean;
  /** Bar height, % of the axis; null without entries. */
  readonly height: number | null;
  /** "Monday 5 Oct: 1,420 kcal" / "…: nothing logged" / "…: upcoming". */
  readonly spoken: string;
}

export interface WeekChartView {
  readonly metric: WeekMetric;
  /** "Calories" */
  readonly name: string;
  /** Top to bottom. */
  readonly ticks: readonly { readonly label: string; readonly position: number }[];
  /** The daily target's height, % of the axis; null without a target. */
  readonly targetHeight: number | null;
  /** "Daily target 2,000 kcal" */
  readonly targetText: string | null;
  readonly bars: readonly WeekBarView[];
}

export function toWeekChart(week: NutritionWeek, targets: TargetState, metric: WeekMetric, today: IsoCalendarDate): WeekChartView {
  const field = FIELD[metric];
  const target = targetFor(targets, metric);
  const values = week.days.map((d) => (d.totals ? d.totals[field] : null));
  const top = niceMax(Math.max(target ?? 0, ...values.map((v) => v ?? 0))) || EMPTY_SCALE[metric];
  const pct = (value: number) => roundTo(Math.min(100, (value / top) * 100), 2);
  return {
    metric,
    name: NAME[metric],
    ticks: Array.from({ length: TICKS + 1 }, (_, i) => {
      const value = (top / TICKS) * (TICKS - i);
      return { label: tickLabel(metric, value), position: pct(value) };
    }),
    targetHeight: target === null ? null : pct(target),
    targetText: target === null ? null : `Daily target ${formatMetric(metric, target)}`,
    bars: week.days.map((d, i) => {
      const date = parseIsoCalendarDate(d.date);
      const name = `${WEEKDAYS[i]} ${date ? `${date.day} ${MONTHS[date.month - 1]}` : d.date}`;
      const value = values[i];
      const status = d.upcoming ? 'upcoming' : value === null ? 'not-logged' : 'logged';
      const spoken = `${name}: ${status === 'logged' ? formatMetric(metric, value!) : status === 'upcoming' ? 'upcoming' : 'nothing logged'}`;
      return { date: d.date, letter: WEEKDAYS[i][0], status, isToday: d.date === today, height: value === null ? null : pct(value), spoken };
    }),
  };
}
