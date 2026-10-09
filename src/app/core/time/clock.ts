import { InjectionToken } from '@angular/core';

import { CalendarDate, IsoCalendarDate, calendarDateOf, toIsoCalendarDate } from '../../domain/fitness-profile';

/** Current time, injectable so date-dependent features are deterministic in tests. */
export const CLOCK = new InjectionToken<() => Date>('CLOCK', { providedIn: 'root', factory: () => () => new Date() });

/** The user's local calendar date ("YYYY-MM-DD") for an instant. */
export function localIsoDate(instant: Date): IsoCalendarDate {
  return toIsoCalendarDate(calendarDateOf(instant)) as IsoCalendarDate;
}

/** The user's local calendar date for an ISO-8601 instant (the app layer owns the time zone). */
export function localCalendarDateOf(instant: string): CalendarDate {
  return calendarDateOf(new Date(instant));
}
