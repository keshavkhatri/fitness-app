import { NutritionWeekSnapshot, TargetState } from '../../core/nutrition/nutrition.service';
import { IsoCalendarDate, parseIsoCalendarDate } from '../../domain/fitness-profile';
import { NutritionValues, WeekDay, shiftWeek, weekStartOf } from '../../domain/nutrition';
import { targetFor } from './nutrition-week-chart';
import { NUTRITION_COPY } from './nutrition-content';
import { CalorieSummaryView, MacroRowView, ProgressView, formatGrams, formatKcal, toIntakeSummary } from './nutrition-view-model';

/**
 * Presentation of one Monday–Sunday week. Totals and averages come from the
 * domain (nutritionWeek); target comparisons from the dashboard's own
 * toIntakeSummary, so rounding and withheld-target rules match. Days without
 * entries are shown as such, never as zero.
 */

const copy = NUTRITION_COPY.week;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
/** "5 Oct" (day-month, as elsewhere in the app). */
const monthDay = { format: (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` };
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' });
const utc = (iso: IsoCalendarDate) => {
  const d = parseIsoCalendarDate(iso);
  return d ? new Date(Date.UTC(d.year, d.month - 1, d.day)) : null;
};

export interface WeekHeaderView {
  /** "This week", "Last week", or the date range. */
  readonly title: string;
  /** "5 – 11 Oct 2026" / "Oct 5 – 11, 2026" by style (always shown). */
  readonly range: string;
  readonly isCurrent: boolean;
  /** Weeks after the current one can't be opened. */
  readonly canGoNext: boolean;
}

/** How a week range reads: Nutrition uses day-month ("5 – 11 Oct 2026"); the Fitness Review keeps month-day ("Oct 5 – 11, 2026"). */
export type RangeStyle = 'day-month' | 'month-day';

const usMonthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * day-month: "5 – 11 Oct 2026", "28 Sep – 4 Oct 2026", "28 Dec 2026 – 3 Jan 2027".
 * month-day: "Oct 5 – 11, 2026", "Sep 28 – Oct 4, 2026", "Dec 28, 2026 – Jan 3, 2027".
 */
export function weekRangeLabel(start: IsoCalendarDate, end: IsoCalendarDate, style: RangeStyle = 'month-day'): string {
  const a = utc(start);
  const b = utc(end);
  if (!a || !b) {
    return `${start} – ${end}`;
  }
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  const sameMonth = sameYear && a.getUTCMonth() === b.getUTCMonth();
  if (style === 'day-month') {
    if (!sameYear) {
      return `${monthDay.format(a)} ${a.getUTCFullYear()} – ${monthDay.format(b)} ${b.getUTCFullYear()}`;
    }
    return `${sameMonth ? a.getUTCDate() : monthDay.format(a)} – ${monthDay.format(b)} ${b.getUTCFullYear()}`;
  }
  if (!sameYear) {
    return `${usMonthDay.format(a)}, ${a.getUTCFullYear()} – ${usMonthDay.format(b)}, ${b.getUTCFullYear()}`;
  }
  return `${usMonthDay.format(a)} – ${sameMonth ? b.getUTCDate() : usMonthDay.format(b)}, ${b.getUTCFullYear()}`;
}

export function toWeekHeader(start: IsoCalendarDate, end: IsoCalendarDate, today: IsoCalendarDate, style: RangeStyle = 'month-day'): WeekHeaderView {
  const thisWeek = weekStartOf(today);
  const isCurrent = start === thisWeek;
  const isLast = thisWeek !== null && start === shiftWeek(thisWeek, -1);
  const range = weekRangeLabel(start, end, style);
  return { title: isCurrent ? copy.thisWeek : isLast ? copy.lastWeek : range, range, isCurrent, canGoNext: thisWeek !== null && start < thisWeek };
}

export interface WeekDayRowView {
  readonly date: IsoCalendarDate;
  /** "Monday" or "Today". */
  readonly weekday: string;
  /** "5 Oct" */
  readonly dateLabel: string;
  readonly status: 'logged' | 'not-logged' | 'upcoming';
  /** "1,420 kcal" when logged. */
  readonly calories: string | null;
  /** "P 62 g · C 140 g · F 41 g" when logged. */
  readonly macros: string | null;
  /** "580 kcal below your daily target" when logged and a calorie target exists. */
  readonly comparison: string | null;
  readonly progress: ProgressView | null;
  /** Past days and today open in the day's food log; upcoming days don't. */
  readonly openable: boolean;
  readonly ariaLabel: string;
}

/** "580 kcal below your daily target" (or the short form for day rows), "over", or on target. */
function comparisonOf(c: CalorieSummaryView, short = false): string | null {
  if (c.target === null || c.balance === null) {
    return null;
  }
  if (c.balance === '0') {
    return short ? copy.dayOnTarget : copy.onTarget;
  }
  if (short) {
    return c.over ? copy.dayOver(c.balance) : copy.dayBelow(c.balance);
  }
  return c.over ? copy.overTarget(c.balance) : copy.belowTarget(c.balance);
}

/** No line break inside a value ("F 35 g" stays together on narrow screens). */
const keep = (text: string) => text.replace(/ /g, '\u00a0');

function toDayRow(day: WeekDay, today: IsoCalendarDate, targets: TargetState): WeekDayRowView {
  const date = utc(day.date);
  const name = day.date === today ? copy.today : date ? weekday.format(date) : day.date;
  const dateLabel = date ? monthDay.format(date) : day.date;
  const base = { date: day.date, weekday: name, dateLabel, openable: !day.upcoming };
  if (day.upcoming || day.totals === null) {
    const status = day.upcoming ? 'upcoming' : 'not-logged';
    const text = day.upcoming ? copy.upcoming : copy.notLogged;
    return { ...base, status, calories: null, macros: null, comparison: null, progress: null, ariaLabel: day.upcoming ? `${name}, ${dateLabel}: ${text}` : `${copy.openDay(`${name}, ${dateLabel}`)}. ${text}` };
  }
  const t = day.totals;
  const summary = toIntakeSummary(t, targets);
  const calories = `${formatKcal(t.calories)} kcal`;
  const macros = [`P ${formatGrams(t.proteinGrams)} g`, `C ${formatGrams(t.carbohydrateGrams)} g`, `F ${formatGrams(t.fatGrams)} g`].map(keep).join(' · ');
  const comparison = comparisonOf(summary.calories, true);
  const spokenMacros = `protein ${formatGrams(t.proteinGrams)} g, carbs ${formatGrams(t.carbohydrateGrams)} g, fat ${formatGrams(t.fatGrams)} g`;
  return {
    ...base,
    status: 'logged',
    calories,
    macros,
    comparison,
    progress: summary.calories.progress,
    ariaLabel: `${copy.openDay(`${name}, ${dateLabel}`)}. ${calories}, ${spokenMacros}${comparison ? `. ${comparison}` : ''}`,
  };
}

/** One "Average this week" tile: a daily average and, with a target, how it compares. */
export interface AverageTileView {
  readonly key: 'calories' | 'protein' | 'carbs' | 'fat';
  /** "1,642" / "102 g" */
  readonly value: string;
  /** "kcal" / "Protein" */
  readonly label: string;
  /** Calories: "−12%" vs target; macros: "85%" of target. Null without a target. */
  readonly comparison: string | null;
  readonly direction: 'up' | 'down' | 'same' | null;
  /** Macros against their target. */
  readonly progress: ProgressView | null;
  /** The whole tile in one sentence. */
  readonly spoken: string;
}

const percent = (value: number) => `${Math.round(value)}%`;

function averageTiles(average: NutritionValues, summary: ReturnType<typeof toIntakeSummary>, targets: TargetState): AverageTileView[] {
  const kcalTarget = targetFor(targets, 'calories');
  const kcal = formatKcal(average.calories);
  let calories: AverageTileView;
  if (kcalTarget === null || kcalTarget <= 0) {
    calories = { key: 'calories', value: kcal, label: 'kcal', comparison: null, direction: null, progress: null, spoken: `Calories: ${kcal} kcal a day` };
  } else {
    const diff = Math.round(((Math.round(average.calories) - Math.round(kcalTarget)) / kcalTarget) * 100);
    const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same';
    const comparison = diff > 0 ? `+${diff}%` : diff < 0 ? `\u2212${-diff}%` : '0%';
    const spokenDiff = diff === 0 ? 'on target' : `${Math.abs(diff)}% ${diff > 0 ? 'over' : 'under'} your ${formatKcal(kcalTarget)} kcal target`;
    calories = { key: 'calories', value: kcal, label: 'kcal', comparison, direction, progress: null, spoken: `Calories: ${kcal} kcal a day, ${spokenDiff}` };
  }
  const macros = summary.macros.map((m): AverageTileView => {
    const metric = m.key;
    const target = targetFor(targets, metric);
    const value = m.eaten;
    if (target === null || target <= 0 || !m.progress) {
      return { key: metric, value, label: m.label, comparison: null, direction: null, progress: null, spoken: `${m.label}: ${value} a day` };
    }
    const amount = metric === 'protein' ? average.proteinGrams : metric === 'carbs' ? average.carbohydrateGrams : average.fatGrams;
    const share = percent((amount / target) * 100);
    return {
      key: metric,
      value,
      label: m.label,
      comparison: share,
      direction: null,
      progress: { ...m.progress, valueText: `${value} a day, ${share} of your ${m.target} target` },
      spoken: `${m.label}: ${value} a day, ${share} of your ${m.target} target`,
    };
  });
  return [calories, ...macros];
}

export interface WeekAverageView {
  readonly tiles: readonly AverageTileView[];
  readonly calories: CalorieSummaryView;
  readonly comparison: string | null;
  readonly macros: readonly MacroRowView[];
  readonly caption: string;
  /** Why targets aren't compared (none, withheld or unavailable). */
  readonly targetNote: string | null;
}

export type NutritionWeekScreen =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | {
      readonly kind: 'ready';
      readonly header: WeekHeaderView;
      /** "Food logged on 3 of 4 days so far" */
      readonly loggedLabel: string;
      readonly days: readonly WeekDayRowView[];
      /** null when nothing was logged in the week. */
      readonly total: { readonly calories: string; readonly macros: string } | null;
      readonly average: WeekAverageView | null;
    };

export function toNutritionWeekScreen(snapshot: NutritionWeekSnapshot): NutritionWeekScreen {
  const { week, today, targets } = snapshot;
  const header = toWeekHeader(week.start, week.end, today, 'day-month');
  const days = week.days.map((d) => toDayRow(d, today, targets));
  const loggedLabel = copy.logged(week.loggedDays, week.elapsedDays, header.isCurrent);
  if (!week.total || !week.average) {
    return { kind: 'ready', header, loggedLabel, days, total: null, average: null };
  }
  const t = week.total;
  const summary = toIntakeSummary(week.average, targets);
  return {
    kind: 'ready',
    header,
    loggedLabel,
    days,
    total: {
      calories: `${formatKcal(t.calories)} kcal`,
      macros: [`Protein ${formatGrams(t.proteinGrams)} g`, `Carbs ${formatGrams(t.carbohydrateGrams)} g`, `Fat ${formatGrams(t.fatGrams)} g`].map(keep).join(' · '),
    },
    average: {
      tiles: averageTiles(week.average, summary, targets),
      calories: summary.calories,
      comparison: comparisonOf(summary.calories),
      macros: summary.macros,
      caption: copy.averageCaption(week.loggedDays),
      targetNote: summary.targetNote,
    },
  };
}
