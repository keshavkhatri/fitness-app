import { NutritionWeekSnapshot, TargetState } from '../../core/nutrition/nutrition.service';
import { IsoCalendarDate, parseIsoCalendarDate } from '../../domain/fitness-profile';
import { WeekDay, shiftWeek, weekStartOf } from '../../domain/nutrition';
import { NUTRITION_COPY } from './nutrition-content';
import { CalorieSummaryView, MacroRowView, ProgressView, formatGrams, formatKcal, toIntakeSummary } from './nutrition-view-model';

/**
 * Presentation of one Monday–Sunday week. Totals and averages come from the
 * domain (nutritionWeek); target comparisons from the dashboard's own
 * toIntakeSummary, so rounding and withheld-target rules match. Days without
 * entries are shown as such, never as zero.
 */

const copy = NUTRITION_COPY.week;
const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' });
const utc = (iso: IsoCalendarDate) => {
  const d = parseIsoCalendarDate(iso);
  return d ? new Date(Date.UTC(d.year, d.month - 1, d.day)) : null;
};

export interface WeekHeaderView {
  /** "This week", "Last week", or the date range. */
  readonly title: string;
  /** "Oct 5 – 11, 2026" (always shown). */
  readonly range: string;
  readonly isCurrent: boolean;
  /** Weeks after the current one can't be opened. */
  readonly canGoNext: boolean;
}

/** "Oct 5 – 11, 2026", "Sep 28 – Oct 4, 2026", "Dec 28, 2026 – Jan 3, 2027". */
export function weekRangeLabel(start: IsoCalendarDate, end: IsoCalendarDate): string {
  const a = utc(start);
  const b = utc(end);
  if (!a || !b) {
    return `${start} – ${end}`;
  }
  if (a.getUTCFullYear() !== b.getUTCFullYear()) {
    return `${monthDay.format(a)}, ${a.getUTCFullYear()} – ${monthDay.format(b)}, ${b.getUTCFullYear()}`;
  }
  const endText = a.getUTCMonth() === b.getUTCMonth() ? String(b.getUTCDate()) : monthDay.format(b);
  return `${monthDay.format(a)} – ${endText}, ${b.getUTCFullYear()}`;
}

export function toWeekHeader(start: IsoCalendarDate, end: IsoCalendarDate, today: IsoCalendarDate): WeekHeaderView {
  const thisWeek = weekStartOf(today);
  const isCurrent = start === thisWeek;
  const isLast = thisWeek !== null && start === shiftWeek(thisWeek, -1);
  const range = weekRangeLabel(start, end);
  return { title: isCurrent ? copy.thisWeek : isLast ? copy.lastWeek : range, range, isCurrent, canGoNext: thisWeek !== null && start < thisWeek };
}

export interface WeekDayRowView {
  readonly date: IsoCalendarDate;
  /** "Monday" or "Today". */
  readonly weekday: string;
  /** "Oct 5" */
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

export interface WeekAverageView {
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
  const header = toWeekHeader(week.start, week.end, today);
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
      calories: summary.calories,
      comparison: comparisonOf(summary.calories),
      macros: summary.macros,
      caption: copy.averageCaption(week.loggedDays),
      targetNote: summary.targetNote,
    },
  };
}
