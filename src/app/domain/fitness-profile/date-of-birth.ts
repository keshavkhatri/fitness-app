/**
 * Calendar dates and age, without time zones.
 *
 * A date of birth is a calendar date, not an instant, so it's stored as an
 * ISO-8601 calendar date string ("YYYY-MM-DD"): sortable, JSON/API-friendly
 * and immune to the off-by-one-day bugs of serialising a `Date` at midnight.
 */

/** ISO-8601 calendar date, e.g. "1990-04-23". Create via `toIsoCalendarDate` / `parseIsoCalendarDate`. */
export type IsoCalendarDate = string;

export interface CalendarDate {
  readonly year: number;
  /** 1–12 */
  readonly month: number;
  /** 1–31 */
  readonly day: number;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/** True for a real date (rejects 2023-02-29, month 13, day 0…). */
export function isValidCalendarDate({ year, month, day }: CalendarDate): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    year >= 1 &&
    year <= 9999 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

/** Formats a valid date as "YYYY-MM-DD"; returns null for invalid dates. */
export function toIsoCalendarDate(date: CalendarDate): IsoCalendarDate | null {
  if (!isValidCalendarDate(date)) {
    return null;
  }
  const pad = (value: number, length: number) => String(value).padStart(length, '0');
  return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;
}

/** Parses a strict "YYYY-MM-DD" string into a valid calendar date, or null. */
export function parseIsoCalendarDate(value: unknown): CalendarDate | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = ISO_DATE.exec(value);
  if (!match) {
    return null;
  }
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  return isValidCalendarDate(date) ? date : null;
}

/** The user's local calendar date for an instant (what "today" means to them). */
export function calendarDateOf(instant: Date): CalendarDate {
  return { year: instant.getFullYear(), month: instant.getMonth() + 1, day: instant.getDate() };
}

export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/**
 * Completed years of age on `today`.
 *
 * Someone is a year older only once their birthday has occurred this year.
 * A 29 February birthday counts as reached on 1 March in non-leap years.
 * Returns a negative number if `today` is before the date of birth.
 */
export function ageOn(dateOfBirth: CalendarDate, today: CalendarDate): number {
  const birthdayReached =
    today.month > dateOfBirth.month || (today.month === dateOfBirth.month && today.day >= dateOfBirth.day);
  return today.year - dateOfBirth.year - (birthdayReached ? 0 : 1);
}

/** Current age from a stored date of birth, or null if the stored value is invalid. */
export function currentAge(dateOfBirth: IsoCalendarDate, now: Date = new Date()): number | null {
  const dob = parseIsoCalendarDate(dateOfBirth);
  return dob ? ageOn(dob, calendarDateOf(now)) : null;
}
