import { IsoCalendarDate, parseIsoCalendarDate, toIsoCalendarDate } from '../fitness-profile';

/**
 * Consecutive active days ending today. A day is active when the user
 * recorded something for it (the caller decides which records count). Today
 * not being active yet doesn't break the streak: it ends yesterday until the
 * day is over. Returns 0 when neither today nor yesterday is active.
 */
export function activeDayStreak(activeDays: ReadonlySet<IsoCalendarDate>, today: IsoCalendarDate): number {
  let day = activeDays.has(today) ? today : previousDay(today);
  let streak = 0;
  while (day && activeDays.has(day)) {
    streak++;
    day = previousDay(day);
  }
  return streak;
}

function previousDay(date: IsoCalendarDate): IsoCalendarDate | null {
  const parsed = parseIsoCalendarDate(date);
  if (!parsed) {
    return null;
  }
  const d = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day - 1));
  return toIsoCalendarDate({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}
