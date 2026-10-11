import { Exercise, PlanSession } from '../../domain/workout-programming';
import { ActivityDay, TrainingOverview, WorkoutLog } from '../../domain/workout-session';
import { toResumeCard } from '../workout/active/active-workout-view-model';
import { sessionFocusAreas } from '../workout/workout-detail-view-model';
import { WORKOUT_COPY } from '../workout/workout-content';
import { CATALOG, WorkoutScreen } from '../workout/workout-view-model';

/**
 * Home's workout and week cards, built from the Workout feature's own
 * presentation models (today's session by the plan's weekday layout, the
 * in-progress workout, the training overview). Nothing is recalculated here.
 */

export type HomeWorkoutView =
  /** A workout is in progress (the log service's state): resume it first. */
  | {
      readonly kind: 'resume';
      readonly sessionId: string;
      readonly title: string;
      readonly progress: string;
      /** Completed and total sets, for the progress bar. */
      readonly setsDone: number;
      readonly setsTotal: number;
    }
  | {
      readonly kind: 'resistance';
      readonly sessionId: string;
      readonly title: string;
      readonly descriptor: string;
      readonly countLabel: string;
      readonly durationLabel: string;
      /** Exercise names in plan order (Home shows the first few). */
      readonly exercises: readonly string[];
      /** Broad body areas the session trains ("Chest", "Back"); empty when the plan session isn't given. */
      readonly focusAreas: readonly string[];
      /** Planned sets across the session; null when the plan session isn't given. */
      readonly setsTotal: number | null;
    }
  | { readonly kind: 'activity'; readonly sessionId: string; readonly title: string; readonly summary: string }
  /** `upNext`: "Next up: Upper Body on Wednesday." when another session follows. */
  | { readonly kind: 'rest'; readonly message: string; readonly upNext: string | null }
  | { readonly kind: 'no-profile' }
  | { readonly kind: 'unavailable' };

/**
 * `sessions` (the plan's sessions) adds the session's body areas and planned
 * set count; without it those stay empty/null (Quick Add only needs the kind).
 */
export function toHomeWorkout(
  screen: WorkoutScreen,
  active: WorkoutLog | null,
  sessions: readonly PlanSession[] = [],
  catalog: ReadonlyMap<string, Exercise> = CATALOG,
): HomeWorkoutView {
  if (active) {
    const sets = active.exercises.flatMap((e) => e.sets);
    return {
      kind: 'resume',
      ...toResumeCard(active),
      setsDone: sets.filter((set) => set.status === 'completed').length,
      setsTotal: sets.length,
    };
  }
  if (screen.kind !== 'ready') {
    return { kind: screen.kind };
  }
  const { today, upNext } = screen;
  const s = today.session;
  if (s.kind === 'resistance' && today.sessionId) {
    const planned = sessions.find((p) => p.id === today.sessionId);
    const session = planned?.kind === 'resistance' ? planned : null;
    return {
      kind: 'resistance',
      sessionId: today.sessionId,
      title: s.title,
      descriptor: s.descriptor,
      countLabel: s.countLabel,
      durationLabel: s.durationLabel,
      exercises: s.exercises.map((e) => e.name),
      focusAreas: session ? sessionFocusAreas(session, catalog) : [],
      setsTotal: session ? session.exercises.reduce((sum, e) => sum + e.sets, 0) : null,
    };
  }
  if (s.kind === 'activity' && today.sessionId) {
    return { kind: 'activity', sessionId: today.sessionId, title: s.title, summary: s.summary };
  }
  return {
    kind: 'rest',
    message: WORKOUT_COPY.today.restMessage,
    upNext: upNext ? WORKOUT_COPY.today.upNext(upNext.session.title, upNext.weekday) : null,
  };
}

// --- This week ----------------------------------------------------------------------------

export interface HomeWeekDayView {
  readonly key: string;
  /** "M", "T", … */
  readonly letter: string;
  /** Day of the month, e.g. "9". */
  readonly date: string;
  /** done: a training workout was finished that day; planned: a plan workout falls on it. */
  readonly state: 'done' | 'planned' | 'rest';
  readonly isToday: boolean;
}

export interface HomeWeekView {
  readonly days: readonly HomeWeekDayView[];
  /** Training workouts finished this week (the history overview's count). */
  readonly done: number;
  /** Resistance workouts the plan schedules this week. */
  readonly planned: number;
  /** "3 of 4 workouts" */
  readonly countLabel: string;
  /** One sentence for the whole strip (the days themselves are hidden from assistive tech). */
  readonly accessibleLabel: string;
}

/**
 * The plan's week (from the Workout tab's view model) with this week's
 * finished workouts (from history). Null when there is no plan to show.
 */
export function toHomeWeek(screen: WorkoutScreen, activity: readonly ActivityDay[], overview: TrainingOverview): HomeWeekView | null {
  if (screen.kind !== 'ready' || activity.length !== 7) {
    return null;
  }
  const days = screen.week.map((day, i): HomeWeekDayView => {
    const planned = day.session.kind === 'resistance';
    return {
      key: day.key,
      letter: day.shortWeekday.charAt(0),
      date: String(activity[i].date.day),
      state: activity[i].workouts > 0 ? 'done' : planned ? 'planned' : 'rest',
      isToday: day.isToday,
    };
  });
  const planned = screen.week.filter((d) => d.session.kind === 'resistance').length;
  const done = overview.workoutsThisWeek;
  const unit = planned === 1 ? 'workout' : 'workouts';
  const countLabel = `${done} of ${planned} ${unit}`;
  const today = screen.today;
  const todayText = today.session.kind === 'rest' ? 'rest day' : today.session.title;
  return {
    days,
    done,
    planned,
    countLabel,
    accessibleLabel: `This week: ${countLabel} done. Today, ${today.weekday}: ${todayText}.`,
  };
}
