import { IsoCalendarDate, parseIsoCalendarDate, roundTo } from '../../domain/fitness-profile';
import { WaterLog, weekDates } from '../../domain/nutrition';
import { WeekChartView } from './nutrition-week-chart';

/**
 * Presentation of water (part of nutrition): the day's hydration card, and the week's water by day with its
 * daily average. A day without water logged has no bar and doesn't count towards the average.
 */

// "0.25", "1.5", "3.0": a glass (250 ml) is never rounded away.
const litres = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

/** "1.25 L" */
export const formatLitres = (ml: number) => `${litres.format(ml / 1000)} L`;

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

export function toHydration(ml: number, goalMl: number, dayLabel = 'today'): HydrationView {
  const quarter = goalMl / HYDRATION_GLASSES;
  const amount = litres.format(ml / 1000);
  const goal = litres.format(goalMl / 1000);
  return {
    amount,
    goal: `/ ${goal} L`,
    glasses: Array.from({ length: HYDRATION_GLASSES }, (_, i) => Math.min(1, Math.max(0, (ml - i * quarter) / quarter))),
    reached: ml >= goalMl,
    accessibleLabel: `Water ${dayLabel}: ${amount} of ${goal} litres.`,
  };
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const TICKS = 4;

export interface WaterWeekView {
  readonly chart: WeekChartView;
  /** "1.8 L" a day, over the days with water logged; null without any. */
  readonly average: string | null;
  /** "Average on 4 days · goal 3.0 L" */
  readonly caption: string;
  /** Days that reached the goal. */
  readonly goalDays: number;
}

/** The Monday–Sunday week starting `monday`: water by day against the daily goal. */
export function toWaterWeek(monday: IsoCalendarDate, log: WaterLog, goalMl: number, today: IsoCalendarDate): WaterWeekView {
  const dates = weekDates(monday);
  const values = dates.map((d) => (d > today ? null : (log[d] ?? null)));
  const logged = values.filter((v): v is number => v !== null && v > 0);
  // Half-litre steps up to the goal or the biggest day.
  const top = Math.max(1000, Math.ceil(Math.max(goalMl, ...logged) / 2000) * 2000);
  const pct = (ml: number) => roundTo(Math.min(100, (ml / top) * 100), 2);
  const average = logged.length ? Math.round(logged.reduce((a, b) => a + b, 0) / logged.length) : null;
  return {
    chart: {
      metric: 'water',
      name: 'Water',
      ticks: Array.from({ length: TICKS + 1 }, (_, i) => {
        const ml = (top / TICKS) * (TICKS - i);
        return { label: `${roundTo(ml / 1000, 1)}`, position: pct(ml) };
      }),
      targetHeight: pct(goalMl),
      targetText: `Daily goal ${formatLitres(goalMl)}`,
      bars: dates.map((date, i) => {
        const d = parseIsoCalendarDate(date);
        const name = `${WEEKDAYS[i]} ${d ? `${d.day} ${MONTHS[d.month - 1]}` : date}`;
        const value = values[i];
        const status = date > today ? 'upcoming' : value === null || value === 0 ? 'not-logged' : 'logged';
        const spoken = `${name}: ${status === 'logged' ? formatLitres(value!) : status === 'upcoming' ? 'upcoming' : 'nothing logged'}`;
        return { date, letter: WEEKDAYS[i][0], status, isToday: date === today, height: status === 'logged' ? pct(value!) : null, spoken };
      }),
    },
    average: average === null ? null : formatLitres(average),
    caption: logged.length
      ? `Average on ${logged.length} ${logged.length === 1 ? 'day' : 'days'} · goal ${formatLitres(goalMl)}`
      : `Nothing logged this week · goal ${formatLitres(goalMl)}`,
    goalDays: logged.filter((v) => v >= goalMl).length,
  };
}
