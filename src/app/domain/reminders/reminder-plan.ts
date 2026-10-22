import { IsoCalendarDate } from '../fitness-profile';

/**
 * Which reminders to put on the device's schedule, and when: a pure function of the user's settings and what is
 * known about the coming days. The app re-plans whenever it opens or returns to the foreground, so a reminder that
 * stopped making sense (the workout was done) is cancelled then. Lock-screen texts never carry health numbers.
 */

export const REMINDER_KINDS = ['training', 'open-workout', 'streak', 'meals', 'weigh-in', 'recovery'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

/** "HH:MM", 24-hour, local time. */
export type ClockTime = string;

export interface ReminderSettings {
  /** The master switch (off until the user turns reminders on; the system permission is asked then). */
  readonly enabled: boolean;
  readonly training: { readonly on: boolean; readonly time: ClockTime };
  readonly openWorkout: { readonly on: boolean };
  readonly streak: { readonly on: boolean; readonly time: ClockTime };
  readonly meals: { readonly on: boolean; readonly times: readonly ClockTime[] };
  /** `weekday`: 0 Monday … 6 Sunday. */
  readonly weighIn: { readonly on: boolean; readonly weekday: number; readonly time: ClockTime };
  readonly recovery: { readonly on: boolean; readonly time: ClockTime };
  readonly quietHours: { readonly start: ClockTime; readonly end: ClockTime };
  /** At most this many reminders on one day (the most useful ones are kept). */
  readonly dailyCap: number;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  training: { on: true, time: '08:00' },
  openWorkout: { on: true },
  streak: { on: true, time: '20:00' },
  meals: { on: false, times: ['13:00', '20:30'] },
  weighIn: { on: true, weekday: 0, time: '08:00' },
  recovery: { on: false, time: '08:30' },
  quietHours: { start: '22:00', end: '07:00' },
  dailyCap: 2,
};

/** What a reminder opens (the in-app inbox's actions, plus the streak page). */
export type ReminderAction =
  | { readonly kind: 'resume'; readonly sessionId: string }
  | { readonly kind: 'open-session'; readonly sessionId: string }
  | { readonly kind: 'recovery-check-in' }
  | { readonly kind: 'log-weight' }
  | { readonly kind: 'log-food' }
  | { readonly kind: 'streak' };

/** What is known now about today and the coming days. */
export interface ReminderFacts {
  /** The next days, today first (at least today): what the plan has on each. */
  readonly days: readonly {
    readonly date: IsoCalendarDate;
    readonly session: { readonly id: string; readonly title: string; readonly kind: 'resistance' | 'activity' } | null;
  }[];
  readonly trainedToday: boolean;
  readonly foodLoggedToday: boolean;
  readonly recoveryToday: boolean;
  /** Anything recorded today (the streak is safe). */
  readonly activeToday: boolean;
  readonly streak: number;
  /** Days since the latest weigh-in; null without any. */
  readonly daysSinceWeighIn: number | null;
  /** A workout in progress: its session and when its last set was logged (or it started). */
  readonly openWorkout: { readonly sessionId: string; readonly title: string; readonly lastActivityAt: Date } | null;
}

export interface PlannedReminder {
  /** Stable per kind and day, so re-planning replaces rather than duplicates. */
  readonly key: string;
  /** A numeric id the device's scheduler needs (derived from the key). */
  readonly id: number;
  readonly kind: ReminderKind;
  readonly at: Date;
  readonly title: string;
  readonly body: string;
  readonly action: ReminderAction;
}

/** Most useful first, for the daily cap. */
const PRIORITY: Readonly<Record<ReminderKind, number>> = { 'open-workout': 0, training: 1, streak: 2, 'weigh-in': 3, recovery: 4, meals: 5 };
/** The streak reminder only matters for a streak worth keeping. */
const STREAK_WORTH_KEEPING = 3;
const OPEN_WORKOUT_AFTER_MS = 2 * 60 * 60_000;

export const isClockTime = (value: unknown): value is ClockTime =>
  typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const minutesOf = (time: ClockTime) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** A local date and time as an instant. */
export function atLocal(date: IsoCalendarDate, time: ClockTime): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, Number(time.slice(0, 2)), Number(time.slice(3, 5)));
}

/** Inside quiet hours (which may wrap past midnight). */
export function inQuietHours(at: Date, quiet: ReminderSettings['quietHours']): boolean {
  const minute = at.getHours() * 60 + at.getMinutes();
  const start = minutesOf(quiet.start);
  const end = minutesOf(quiet.end);
  return start === end ? false : start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/** A positive 31-bit id from the key (Android needs an int). */
export function reminderId(key: string): number {
  let hash = 0;
  for (const char of key) {
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  }
  return (hash & 0x7fffffff) || 1;
}

const weekdayOf = (date: IsoCalendarDate) => {
  const [y, m, d] = date.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
};

export function planReminders(settings: ReminderSettings, facts: ReminderFacts, now: Date): PlannedReminder[] {
  if (!settings.enabled || facts.days.length === 0) {
    return [];
  }
  const today = facts.days[0].date;
  const all: Omit<PlannedReminder, 'id'>[] = [];
  const add = (kind: ReminderKind, date: IsoCalendarDate, at: Date, title: string, body: string, action: ReminderAction) =>
    all.push({ key: `${kind}:${date}`, kind, at, title, body, action });

  for (const day of facts.days) {
    const isToday = day.date === today;
    if (settings.training.on && day.session && !(isToday && facts.trainedToday)) {
      const s = day.session;
      add(
        'training',
        day.date,
        atLocal(day.date, settings.training.time),
        s.kind === 'resistance' ? `${s.title} is on today` : 'Light activity today',
        s.kind === 'resistance' ? 'Your workout is ready when you are.' : `${s.title}: mark it done when you have moved.`,
        { kind: 'open-session', sessionId: s.id },
      );
    }
    if (settings.meals.on && !(isToday && facts.foodLoggedToday)) {
      settings.meals.times.forEach((time, i) =>
        all.push({
          key: `meals:${day.date}:${i}`,
          kind: 'meals',
          at: atLocal(day.date, time),
          title: 'Log your meals',
          body: 'A quick log keeps your calories and protein on track.',
          action: { kind: 'log-food' },
        }),
      );
    }
    if (settings.recovery.on && !(isToday && facts.recoveryToday)) {
      add('recovery', day.date, atLocal(day.date, settings.recovery.time), 'How did you sleep?', 'A 5-second recovery check-in.', { kind: 'recovery-check-in' });
    }
    if (settings.weighIn.on && weekdayOf(day.date) === settings.weighIn.weekday) {
      const daysAhead = facts.days.indexOf(day);
      const due = facts.daysSinceWeighIn === null || facts.daysSinceWeighIn + daysAhead >= 6;
      if (due) {
        add('weigh-in', day.date, atLocal(day.date, settings.weighIn.time), 'Weekly weigh-in', 'Step on the scale and log it: same time, same conditions.', { kind: 'log-weight' });
      }
    }
  }
  // Only today can be judged now (re-planned on every return to the app).
  if (settings.streak.on && facts.streak >= STREAK_WORTH_KEEPING && !facts.activeToday) {
    add('streak', today, atLocal(today, settings.streak.time), `Keep your ${facts.streak}-day streak`, 'Log anything today: food, a weigh-in or a workout.', { kind: 'streak' });
  }
  if (settings.openWorkout.on && facts.openWorkout) {
    const w = facts.openWorkout;
    add('open-workout', today, new Date(w.lastActivityAt.getTime() + OPEN_WORKOUT_AFTER_MS), `${w.title} is still open`, 'Finish it or pick up where you left off.', {
      kind: 'resume',
      sessionId: w.sessionId,
    });
  }

  const soon = now.getTime() + 60_000;
  const due = all.filter((r) => r.at.getTime() > soon && !inQuietHours(r.at, settings.quietHours));
  // The daily cap: the most useful reminders of each day, in time order.
  const byDay = new Map<string, Omit<PlannedReminder, 'id'>[]>();
  for (const r of due) {
    const key = r.at.toDateString();
    byDay.set(key, [...(byDay.get(key) ?? []), r]);
  }
  const kept = [...byDay.values()].flatMap((list) =>
    [...list].sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.at.getTime() - b.at.getTime()).slice(0, Math.max(1, settings.dailyCap)),
  );
  return kept.sort((a, b) => a.at.getTime() - b.at.getTime()).map((r) => ({ ...r, id: reminderId(r.key) }));
}

/** Stored settings, read strictly: anything unreadable falls back to the default for that field. */
export function parseReminderSettings(value: unknown): ReminderSettings {
  const d = DEFAULT_REMINDER_SETTINGS;
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, Record<string, unknown> | undefined>;
  const on = (group: Record<string, unknown> | undefined, fallback: boolean) => (typeof group?.['on'] === 'boolean' ? (group['on'] as boolean) : fallback);
  const time = (raw: unknown, fallback: ClockTime) => (isClockTime(raw) ? raw : fallback);
  const meals = Array.isArray(v['meals']?.['times']) ? (v['meals']!['times'] as unknown[]).filter(isClockTime).slice(0, 3) : d.meals.times;
  const weekday = v['weighIn']?.['weekday'];
  const cap = (value as Record<string, unknown> | null)?.['dailyCap'];
  return {
    enabled: (value as Record<string, unknown> | null)?.['enabled'] === true,
    training: { on: on(v['training'], d.training.on), time: time(v['training']?.['time'], d.training.time) },
    openWorkout: { on: on(v['openWorkout'], d.openWorkout.on) },
    streak: { on: on(v['streak'], d.streak.on), time: time(v['streak']?.['time'], d.streak.time) },
    meals: { on: on(v['meals'], d.meals.on), times: meals.length ? meals : d.meals.times },
    weighIn: {
      on: on(v['weighIn'], d.weighIn.on),
      weekday: Number.isInteger(weekday) && (weekday as number) >= 0 && (weekday as number) <= 6 ? (weekday as number) : d.weighIn.weekday,
      time: time(v['weighIn']?.['time'], d.weighIn.time),
    },
    recovery: { on: on(v['recovery'], d.recovery.on), time: time(v['recovery']?.['time'], d.recovery.time) },
    quietHours: { start: time(v['quietHours']?.['start'], d.quietHours.start), end: time(v['quietHours']?.['end'], d.quietHours.end) },
    dailyCap: Number.isInteger(cap) && (cap as number) >= 1 && (cap as number) <= 6 ? (cap as number) : d.dailyCap,
  };
}
