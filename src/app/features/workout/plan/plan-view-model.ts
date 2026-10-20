import { CalendarDate, calendarDateOf, compareCalendarDates } from '../../../domain/fitness-profile';
import { Exercise, PlanSession } from '../../../domain/workout-programming';
import { WorkoutLog, addDays, completedWorkouts, isTrainingWorkout, startOfWeek } from '../../../domain/workout-session';
import { toResumeCard } from '../active/active-workout-view-model';
import { sessionFocusAreas } from '../workout-detail-view-model';
import { WORKOUT_COPY } from '../workout-content';
import { sessionPhoto } from '../workout-photos';
import { CATALOG, DayView, WorkoutScreen } from '../workout-view-model';

/**
 * The Workout tab (plan view): a week strip with dates, today's workout as the
 * featured card, and the week's sessions as rows. Built from the Workout
 * screen model (the plan by weekday), the workout in progress and finished
 * workouts. Dates are local; nothing is invented when data is missing.
 */

const copy = WORKOUT_COPY.planTab;

export interface PlanStripDayView {
  readonly key: string;
  /** "M", "T", … */
  readonly letter: string;
  /** Day of the month: "8". */
  readonly date: string;
  readonly isToday: boolean;
  /** done: a workout was finished that day; training/activity: planned; rest: nothing planned. */
  readonly state: 'done' | 'training' | 'activity' | 'rest';
  /** Plan session id (training and activity days open Workout Detail); null on rest days. */
  readonly sessionId: string | null;
  /** "Thursday 8 October, today. Upper Body B, done." */
  readonly accessibleLabel: string;
}

export type PlanFeatureView =
  /** The workout in progress (any session): resume it first. */
  | {
      readonly kind: 'resume';
      readonly sessionId: string;
      /** The session's hero photo, or null (drawn art). */
      readonly photo: string | null;
      readonly title: string;
      readonly progress: string;
      readonly setsDone: number;
      readonly setsTotal: number;
    }
  | {
      readonly kind: 'start';
      readonly sessionId: string;
      readonly photo: string | null;
      readonly title: string;
      /** The plan's estimate. */
      readonly minutes: number;
      readonly countLabel: string;
      /** Broad body areas ("Chest", "Back"), at most three. */
      readonly areas: readonly string[];
    }
  /** Today's session was already finished today: its record, not a second start. */
  | {
      readonly kind: 'done';
      readonly sessionId: string;
      readonly photo: string | null;
      readonly workoutId: string;
      readonly title: string;
      readonly minutes: number;
      readonly countLabel: string;
      readonly areas: readonly string[];
    }
  | { readonly kind: 'activity'; readonly sessionId: string; readonly photo: string | null; readonly title: string; readonly summary: string }
  | { readonly kind: 'rest'; readonly upNext: string | null };

export type PlanRowStatus = 'done' | 'in-progress' | 'upcoming' | 'missed';

export interface PlanWeekRowView {
  readonly sessionId: string;
  /** The session's photo (thumbnail), or null (drawn art). */
  readonly photo: string | null;
  readonly title: string;
  /** "50 min · 6 exercises" */
  readonly meta: string;
  /** "Fri, 10 Oct", or "Today". */
  readonly dateLabel: string;
  readonly isToday: boolean;
  readonly status: PlanRowStatus;
  readonly statusLabel: string;
  /** One sentence for the row's button. */
  readonly accessibleLabel: string;
}

export interface PlanTabView {
  /** "Thursday, 8 Oct" */
  readonly todayLabel: string;
  readonly days: readonly PlanStripDayView[];
  readonly feature: PlanFeatureView;
  /** Training sessions of the week, in weekday order. */
  readonly rows: readonly PlanWeekRowView[];
  /** "2 of 4 done" */
  readonly weekProgress: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
const MAX_AREAS = 3;

const localDateOf = (instant: string) => calendarDateOf(new Date(instant));
const sameDay = (a: CalendarDate, b: CalendarDate) => compareCalendarDates(a, b) === 0;

export function toPlanTab(
  screen: Extract<WorkoutScreen, { kind: 'ready' }>,
  sessions: readonly PlanSession[],
  history: readonly WorkoutLog[],
  active: WorkoutLog | null,
  now: Date,
  catalog: ReadonlyMap<string, Exercise> = CATALOG,
): PlanTabView {
  const today = calendarDateOf(now);
  const monday = startOfWeek(today);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  // Finished training workouts this week (≥ 1 completed set), newest first.
  const thisWeek = completedWorkouts(history)
    .filter(isTrainingWorkout)
    .filter((log) => compareCalendarDates(localDateOf(log.completedAt as string), monday) >= 0);
  const doneOn = (date: CalendarDate) => thisWeek.some((log) => sameDay(localDateOf(log.completedAt as string), date));
  const finishedFor = (sessionId: string) => thisWeek.find((log) => log.source.sessionId === sessionId) ?? null;
  const photoFor = (sessionId: string | null) => sessionPhoto(sessions.find((s) => s.id === sessionId));
  const areasFor = (sessionId: string | null) => {
    const planned = sessions.find((s) => s.id === sessionId);
    return planned?.kind === 'resistance' ? sessionFocusAreas(planned, catalog).slice(0, MAX_AREAS) : [];
  };

  const days = screen.week.map((day, i): PlanStripDayView => {
    const date = dates[i];
    const state = doneOn(date) ? 'done' : day.session.kind === 'resistance' ? 'training' : day.session.kind === 'activity' ? 'activity' : 'rest';
    const what = day.session.kind === 'rest' ? copy.restDay : day.session.title;
    return {
      key: day.key,
      letter: day.shortWeekday.charAt(0),
      date: String(date.day),
      isToday: day.isToday,
      state,
      sessionId: day.sessionId,
      accessibleLabel: `${day.weekday} ${date.day} ${MONTHS_LONG[date.month - 1]}${day.isToday ? `, ${copy.today.toLowerCase()}` : ''}. ${what}${state === 'done' ? `, ${copy.done.toLowerCase()}` : ''}.`,
    };
  });

  const rows = screen.week.flatMap((day, i): PlanWeekRowView[] => {
    if (day.session.kind !== 'resistance' || !day.sessionId) {
      return [];
    }
    const date = dates[i];
    const status: PlanRowStatus =
      active?.source.sessionId === day.sessionId
        ? 'in-progress'
        : finishedFor(day.sessionId)
          ? 'done'
          : compareCalendarDates(date, today) < 0
            ? 'missed'
            : 'upcoming';
    const dateLabel = day.isToday ? copy.today : shortDate(day, date);
    const meta = `${day.session.estimatedMinutes} min · ${day.session.countLabel}`;
    const statusLabel = copy.status[status];
    return [
      {
        sessionId: day.sessionId,
        photo: photoFor(day.sessionId),
        title: day.session.title,
        meta,
        dateLabel,
        isToday: day.isToday,
        status,
        statusLabel,
        accessibleLabel: `${day.session.title}, ${dateLabel}. About ${day.session.estimatedMinutes} minutes, ${day.session.countLabel}. ${statusLabel}.`,
      },
    ];
  });

  const done = rows.filter((r) => r.status === 'done').length;
  return {
    todayLabel: `${screen.today.weekday}, ${today.day} ${MONTHS[today.month - 1]}`,
    days,
    feature: toFeature(screen, active, finishedFor, areasFor, photoFor),
    rows,
    weekProgress: copy.weekProgress(done, rows.length),
  };
}

const shortDate = (day: DayView, date: CalendarDate) => `${day.shortWeekday}, ${date.day} ${MONTHS[date.month - 1]}`;

function toFeature(
  screen: Extract<WorkoutScreen, { kind: 'ready' }>,
  active: WorkoutLog | null,
  finishedFor: (sessionId: string) => WorkoutLog | null,
  areasFor: (sessionId: string | null) => string[],
  photoFor: (sessionId: string | null) => string | null,
): PlanFeatureView {
  if (active) {
    const sets = active.exercises.flatMap((e) => e.sets);
    return {
      kind: 'resume',
      ...toResumeCard(active),
      photo: photoFor(active.source.sessionId),
      setsDone: sets.filter((set) => set.status === 'completed').length,
      setsTotal: sets.length,
    };
  }
  const { today, upNext } = screen;
  const s = today.session;
  if (s.kind === 'resistance' && today.sessionId) {
    const base = {
      sessionId: today.sessionId,
      photo: photoFor(today.sessionId),
      title: s.title,
      minutes: s.estimatedMinutes,
      countLabel: s.countLabel,
      areas: areasFor(today.sessionId),
    };
    const finished = finishedFor(today.sessionId);
    return finished ? { kind: 'done', workoutId: finished.id, ...base } : { kind: 'start', ...base };
  }
  if (s.kind === 'activity' && today.sessionId) {
    return { kind: 'activity', sessionId: today.sessionId, photo: photoFor(today.sessionId), title: s.title, summary: s.summary };
  }
  return { kind: 'rest', upNext: upNext ? WORKOUT_COPY.today.upNext(upNext.session.title, upNext.weekday) : null };
}
