import { IsoCalendarDate, parseIsoCalendarDate, roundTo, toIsoCalendarDate } from '../fitness-profile';
import { addDays, startOfWeek } from '../workout-session';
import { entriesBetween, entriesOn, sumNutrition } from './nutrition-day';
import { FoodEntry, NutritionValues } from './nutrition.model';

/**
 * One calendar week (Monday–Sunday, the app's week convention) summarised
 * from logged food.
 *
 * Missing data is never zero: a day with nothing logged has no totals, and a
 * day after today is `upcoming`. Neither counts towards the average, whose
 * denominator is the number of days with at least one entry (`loggedDays`).
 * A logged entry of 0 kcal still makes its day logged.
 */

export const WEEK_LENGTH = 7;

export interface WeekDay {
  readonly date: IsoCalendarDate;
  readonly entryCount: number;
  /** Exact sum of the day's entries; null when nothing was logged (never a made-up zero). */
  readonly totals: NutritionValues | null;
  /** After today: can't have been logged yet. */
  readonly upcoming: boolean;
}

export interface NutritionWeek {
  /** Monday and Sunday of the week. */
  readonly start: IsoCalendarDate;
  readonly end: IsoCalendarDate;
  /** Monday first, always seven. */
  readonly days: readonly WeekDay[];
  /** Days with at least one entry: the average's denominator. */
  readonly loggedDays: number;
  /** Days up to and including today (the week so far). */
  readonly elapsedDays: number;
  /** Exact sum over the logged days; null when none were logged. */
  readonly total: NutritionValues | null;
  /** total ÷ loggedDays, one decimal; null when none were logged. */
  readonly average: NutritionValues | null;
}

/** Monday of the week containing `date`; null for an invalid date. */
export function weekStartOf(date: IsoCalendarDate): IsoCalendarDate | null {
  const parsed = parseIsoCalendarDate(date);
  return parsed ? toIsoCalendarDate(startOfWeek(parsed)) : null;
}

/** The seven dates of the week starting `monday`. */
export function weekDates(monday: IsoCalendarDate): IsoCalendarDate[] {
  const start = parseIsoCalendarDate(monday);
  if (!start) {
    return [];
  }
  return Array.from({ length: WEEK_LENGTH }, (_, i) => toIsoCalendarDate(addDays(start, i)) as IsoCalendarDate);
}

/** The Monday a week before or after `monday`. */
export function shiftWeek(monday: IsoCalendarDate, weeks: number): IsoCalendarDate | null {
  const start = parseIsoCalendarDate(monday);
  return start ? toIsoCalendarDate(addDays(start, weeks * WEEK_LENGTH)) : null;
}

/**
 * The week containing `date`, from `entries` (any range: only the week's
 * dates are used). `today` is the user's local date. Null for an invalid date.
 */
export function nutritionWeek(entries: readonly FoodEntry[], date: IsoCalendarDate, today: IsoCalendarDate): NutritionWeek | null {
  const start = weekStartOf(date);
  if (!start) {
    return null;
  }
  const dates = weekDates(start);
  const inWeek = entriesBetween(entries, dates[0], dates[WEEK_LENGTH - 1]);
  const days = dates.map((day): WeekDay => {
    const upcoming = day > today;
    const logged = upcoming ? [] : entriesOn(inWeek, day);
    return { date: day, entryCount: logged.length, totals: logged.length ? sumNutrition(logged) : null, upcoming };
  });
  const loggedDays = days.filter((d) => d.totals !== null).length;
  const elapsedDays = days.filter((d) => !d.upcoming).length;
  if (loggedDays === 0) {
    return { start, end: dates[WEEK_LENGTH - 1], days, loggedDays, elapsedDays, total: null, average: null };
  }
  // Summing the entries (not the rounded day totals) keeps the exact tenths arithmetic of sumNutrition.
  const total = sumNutrition(days.filter((d) => !d.upcoming).flatMap((d) => entriesOn(inWeek, d.date)));
  const mean = (value: number) => roundTo(value / loggedDays, 1);
  return {
    start,
    end: dates[WEEK_LENGTH - 1],
    days,
    loggedDays,
    elapsedDays,
    total,
    average: {
      calories: mean(total.calories),
      proteinGrams: mean(total.proteinGrams),
      carbohydrateGrams: mean(total.carbohydrateGrams),
      fatGrams: mean(total.fatGrams),
    },
  };
}
