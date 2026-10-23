import { IsoCalendarDate, UnitSystem, parseIsoCalendarDate, roundTo } from '../../domain/fitness-profile';
import { WaterLog, toFlOz, waterGlassMl, weekDates } from '../../domain/nutrition';
import { WeekChartView } from './nutrition-week-chart';

/**
 * Presentation of water (part of nutrition): the day's hydration card, and the week's water by day with its
 * daily average. Amounts are stored in millilitres; metric users see litres, imperial users US fluid ounces.
 * A day without water logged has no bar and doesn't count towards the average.
 */

// "0.25", "1.5", "3.0": a glass (250 ml) is never rounded away.
const litres = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** The number alone: "1.25" (litres) or "42" (fluid ounces). */
export const waterNumber = (ml: number, unit: UnitSystem = 'metric'): string =>
  unit === 'imperial' ? wholeNumber.format(Math.round(toFlOz(ml))) : litres.format(ml / 1000);

/** The unit's short label: "L" or "fl oz". */
export const waterUnitLabel = (unit: UnitSystem = 'metric'): string => (unit === 'imperial' ? 'fl oz' : 'L');

/** "1.25 L" or "42 fl oz". */
export const formatWater = (ml: number, unit: UnitSystem = 'metric'): string => `${waterNumber(ml, unit)} ${waterUnitLabel(unit)}`;

/** The unit spelled out for assistive technology: "litres" or "fluid ounces". */
const spokenUnit = (unit: UnitSystem) => (unit === 'imperial' ? 'fluid ounces' : 'litres');

export const HYDRATION_GLASSES = 4;

export interface HydrationView {
  /** "1.2" (litres) or "42" (fl oz) */
  readonly amount: string;
  /** "/ 3.0 L" or "/ 101 fl oz" */
  readonly goal: string;
  /** How full each of the four glasses is, 0–1 (each is a quarter of the goal). */
  readonly glasses: readonly number[];
  readonly reached: boolean;
  readonly accessibleLabel: string;
}

export function toHydration(ml: number, goalMl: number, unit: UnitSystem = 'metric', dayLabel = 'today'): HydrationView {
  const quarter = goalMl / HYDRATION_GLASSES;
  const amount = waterNumber(ml, unit);
  const goal = waterNumber(goalMl, unit);
  return {
    amount,
    goal: `/ ${goal} ${waterUnitLabel(unit)}`,
    glasses: Array.from({ length: HYDRATION_GLASSES }, (_, i) => Math.min(1, Math.max(0, (ml - i * quarter) / quarter))),
    reached: ml >= goalMl,
    accessibleLabel: `Water ${dayLabel}: ${amount} of ${goal} ${spokenUnit(unit)}.`,
  };
}

/** The sheet's buttons name a glass in the unit people pour in: "250 ml" / "500 ml", or "8 fl oz" / "16 fl oz". */
export function glassLabel(multiple: number, unit: UnitSystem = 'metric'): string {
  const ml = waterGlassMl(unit) * multiple;
  return unit === 'imperial' ? `${Math.round(toFlOz(ml))} fl oz` : `${ml} ml`;
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const TICKS = 4;

export interface WaterWeekView {
  readonly chart: WeekChartView;
  /** "1.8 L" or "61 fl oz" a day, over the days with water logged; null without any. */
  readonly average: string | null;
  /** "Average on 4 days · goal 3.0 L" */
  readonly caption: string;
  /** Days that reached the goal. */
  readonly goalDays: number;
}

/** The Monday–Sunday week starting `monday`: water by day against the daily goal. */
export function toWaterWeek(monday: IsoCalendarDate, log: WaterLog, goalMl: number, today: IsoCalendarDate, unit: UnitSystem = 'metric'): WaterWeekView {
  const dates = weekDates(monday);
  const values = dates.map((d) => (d > today ? null : (log[d] ?? null)));
  const logged = values.filter((v): v is number => v !== null && v > 0);
  // The axis tops out at a round number of the person's unit: whole 2 L steps, or 64 fl oz steps.
  const stepMl = unit === 'imperial' ? 64 * 29.5735 : 2000;
  const top = Math.max(stepMl / 2, Math.ceil(Math.max(goalMl, ...logged) / stepMl) * stepMl);
  const pct = (ml: number) => roundTo(Math.min(100, (ml / top) * 100), 2);
  const average = logged.length ? Math.round(logged.reduce((a, b) => a + b, 0) / logged.length) : null;
  return {
    chart: {
      metric: 'water',
      name: 'Water',
      ticks: Array.from({ length: TICKS + 1 }, (_, i) => {
        const ml = (top / TICKS) * (TICKS - i);
        return { label: unit === 'imperial' ? String(Math.round(toFlOz(ml))) : `${roundTo(ml / 1000, 1)}`, position: pct(ml) };
      }),
      targetHeight: pct(goalMl),
      targetText: `Daily goal ${formatWater(goalMl, unit)}`,
      bars: dates.map((date, i) => {
        const d = parseIsoCalendarDate(date);
        const name = `${WEEKDAYS[i]} ${d ? `${d.day} ${MONTHS[d.month - 1]}` : date}`;
        const value = values[i];
        const status = date > today ? 'upcoming' : value === null || value === 0 ? 'not-logged' : 'logged';
        const spoken = `${name}: ${status === 'logged' ? formatWater(value!, unit) : status === 'upcoming' ? 'upcoming' : 'nothing logged'}`;
        return { date, letter: WEEKDAYS[i][0], status, isToday: date === today, height: status === 'logged' ? pct(value!) : null, spoken };
      }),
    },
    average: average === null ? null : formatWater(average, unit),
    caption: logged.length
      ? `Average on ${logged.length} ${logged.length === 1 ? 'day' : 'days'} · goal ${formatWater(goalMl, unit)}`
      : `Nothing logged this week · goal ${formatWater(goalMl, unit)}`,
    goalDays: logged.filter((v) => v >= goalMl).length,
  };
}
