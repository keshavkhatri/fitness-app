import { IsoCalendarDate, parseIsoCalendarDate, toIsoCalendarDate } from '../fitness-profile';
import { activeDayStreak } from './activity-streak';

/**
 * The active-day streak in full: what was recorded on each day, the current and best streaks, totals, milestones
 * and a week-by-week activity grid (like a commit graph). A day is active when anything was recorded; nothing is
 * scored or judged.
 */

/** What can make a day active. */
export const ACTIVITY_KINDS = ['workout', 'activity', 'food', 'weight', 'steps', 'recovery'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** Every active day with what was recorded on it. */
export type ActivityDays = ReadonlyMap<IsoCalendarDate, ReadonlySet<ActivityKind>>;

/** Streak lengths worth marking. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365] as const;

export interface StreakSummary {
  readonly current: number;
  /** The longest run of consecutive active days ever (at least the current one). */
  readonly best: number;
  /** Active days in total, and in the current calendar month. */
  readonly activeDays: number;
  readonly thisMonth: number;
  readonly todayActive: boolean;
  /** The next milestone above the current streak; null past the last one. */
  readonly nextMilestone: number | null;
  /** Milestones the best streak has reached. */
  readonly reached: readonly number[];
}

const utcDay = (iso: IsoCalendarDate): number => {
  const d = parseIsoCalendarDate(iso);
  return d ? Date.UTC(d.year, d.month - 1, d.day) / 86_400_000 : Number.NaN;
};
const isoOfDay = (day: number): IsoCalendarDate => {
  const d = new Date(day * 86_400_000);
  return toIsoCalendarDate({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() })!;
};

/** The longest run of consecutive days in the set. */
export function bestStreak(days: Iterable<IsoCalendarDate>): number {
  const sorted = [...new Set([...days].map(utcDay).filter(Number.isFinite))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  sorted.forEach((day, i) => {
    run = i > 0 && day - sorted[i - 1] === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

export function streakSummary(days: ActivityDays, today: IsoCalendarDate): StreakSummary {
  const active = new Set([...days.keys()].filter((d) => d <= today));
  const current = activeDayStreak(active, today);
  const best = Math.max(current, bestStreak(active));
  const month = today.slice(0, 7);
  return {
    current,
    best,
    activeDays: active.size,
    thisMonth: [...active].filter((d) => d.startsWith(month)).length,
    todayActive: active.has(today),
    nextMilestone: STREAK_MILESTONES.find((m) => m > current) ?? null,
    reached: STREAK_MILESTONES.filter((m) => m <= best),
  };
}

export interface ActivityGridDay {
  readonly date: IsoCalendarDate;
  /** 0 nothing, 1–4 by how many kinds of things were recorded (4 = four or more). */
  readonly level: 0 | 1 | 2 | 3 | 4;
  readonly kinds: readonly ActivityKind[];
  readonly future: boolean;
  readonly today: boolean;
}

export interface ActivityGrid {
  /** Oldest first; each a Monday–Sunday column. */
  readonly weeks: readonly { readonly key: string; readonly days: readonly ActivityGridDay[] }[];
  /** A month label above the week where it starts. */
  readonly months: readonly { readonly week: number; readonly label: string }[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** The last \`weeks\` Monday–Sunday weeks up to this one, as a grid of days. */
export function activityGrid(days: ActivityDays, today: IsoCalendarDate, weeks = 17): ActivityGrid {
  const todayNumber = utcDay(today);
  // 1970-01-01 was a Thursday: day 0 is weekday 3 when Monday is 0.
  const weekday = (((todayNumber + 3) % 7) + 7) % 7;
  const firstMonday = todayNumber - weekday - (weeks - 1) * 7;
  const columns = Array.from({ length: weeks }, (_, w) => {
    const monday = firstMonday + w * 7;
    return {
      key: isoOfDay(monday),
      days: Array.from({ length: 7 }, (_, i): ActivityGridDay => {
        const date = isoOfDay(monday + i);
        const kinds = [...(days.get(date) ?? [])];
        return {
          date,
          level: Math.min(4, kinds.length) as ActivityGridDay['level'],
          kinds,
          future: monday + i > todayNumber,
          today: monday + i === todayNumber,
        };
      }),
    };
  });
  // A month is labelled above the week holding its 1st; the first week gets its own month only when no month
  // starts in the first two weeks (so two labels never crowd each other).
  const months: { week: number; label: string }[] = [];
  columns.forEach((column, w) => {
    const first = column.days.find((d) => d.date.endsWith('-01'));
    if (first) {
      months.push({ week: w, label: MONTHS[Number(first.date.slice(5, 7)) - 1] });
    }
  });
  if (columns.length && !months.some((m) => m.week <= 1)) {
    months.unshift({ week: 0, label: MONTHS[Number(columns[0].days[0].date.slice(5, 7)) - 1] });
  }
  return { weeks: columns, months };
}
