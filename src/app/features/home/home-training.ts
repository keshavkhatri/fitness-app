import { TrainingOverview, WorkoutLog } from '../../domain/workout-session';
import { toResumeCard } from '../workout/active/active-workout-view-model';
import { RecentWorkoutView, toRecentWorkouts } from '../workout/history/history-view-model';
import { WORKOUT_COPY } from '../workout/workout-content';
import { WorkoutScreen } from '../workout/workout-view-model';

/**
 * Home's workout and progress cards, built from the Workout feature's own
 * presentation models (today's session by the plan's weekday layout, the
 * in-progress workout, the training overview). Nothing is recalculated here.
 */

export type HomeWorkoutView =
  /** A workout is in progress (the log service's state): resume it first. */
  | { readonly kind: 'resume'; readonly sessionId: string; readonly title: string; readonly progress: string }
  | {
      readonly kind: 'resistance';
      readonly sessionId: string;
      readonly title: string;
      readonly descriptor: string;
      readonly countLabel: string;
      readonly durationLabel: string;
    }
  | { readonly kind: 'activity'; readonly sessionId: string; readonly title: string; readonly summary: string }
  /** `upNext`: "Next up: Upper Body on Wednesday." when another session follows. */
  | { readonly kind: 'rest'; readonly message: string; readonly upNext: string | null }
  | { readonly kind: 'no-profile' }
  | { readonly kind: 'unavailable' };

export function toHomeWorkout(screen: WorkoutScreen, active: WorkoutLog | null): HomeWorkoutView {
  if (active) {
    return { kind: 'resume', ...toResumeCard(active) };
  }
  if (screen.kind !== 'ready') {
    return { kind: screen.kind };
  }
  const { today, upNext } = screen;
  const s = today.session;
  if (s.kind === 'resistance' && today.sessionId) {
    return { kind: 'resistance', sessionId: today.sessionId, title: s.title, descriptor: s.descriptor, countLabel: s.countLabel, durationLabel: s.durationLabel };
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

export type HomeProgressView =
  | {
      readonly kind: 'ready';
      /** Finished in the current local week (Monday–Sunday). */
      readonly thisWeek: { readonly count: number; readonly unit: string };
      readonly lastWorkout: RecentWorkoutView;
    }
  /** No finished workouts yet: nothing to show, nothing invented. */
  | { readonly kind: 'empty' }
  | { readonly kind: 'error' };

/** From `WorkoutHistoryService.overview()` (null when history can't be read). */
export function toHomeProgress(overview: TrainingOverview | null, now: Date): HomeProgressView {
  if (!overview) {
    return { kind: 'error' };
  }
  const last = overview.lastWorkout ? toRecentWorkouts([overview.lastWorkout], now, 1)[0] : undefined;
  if (overview.workoutsCompleted === 0 || !last) {
    return { kind: 'empty' };
  }
  const count = overview.workoutsThisWeek;
  const units = WORKOUT_COPY.progress.overview;
  return { kind: 'ready', thisWeek: { count, unit: count === 1 ? units.workout : units.workouts }, lastWorkout: last };
}
