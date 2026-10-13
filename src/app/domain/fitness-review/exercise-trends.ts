import { IsoCalendarDate, toIsoCalendarDate } from '../fitness-profile';
import {
  ExercisePerformanceSession,
  LocalDateOf,
  LoggingMode,
  PerformedSet,
  WorkoutLog,
  isBetterSet,
  performedExercises,
  topSet,
} from '../workout-session';

/**
 * Which exercises trained in a week improved or stalled, by explicit rules on
 * comparable sessions only (same logging mode and same weight unit, the
 * Progress screen's rule, so kg and lb or reps and time are never compared):
 *
 * - improving: the week's latest top set beats the best top set of the
 *   previous comparable sessions (up to IMPROVEMENT_LOOKBACK of them);
 * - stalled: at least STALL_MIN_SESSIONS comparable sessions, and none of the
 *   last STALL_WINDOW top sets beats the best top set before them;
 * - otherwise nothing is concluded (too few comparable sessions, or holding).
 *
 * Sessions after the reviewed week are ignored, so an older week is judged by
 * what was known then.
 */

export const IMPROVEMENT_LOOKBACK = 4;
export const STALL_WINDOW = 3;
/** The stall window plus at least one earlier session to compare with. */
export const STALL_MIN_SESSIONS = STALL_WINDOW + 1;

export interface ExerciseTrend {
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly logging: LoggingMode;
  readonly weightUnit: ExercisePerformanceSession['weightUnit'];
  /** The top set of the week's latest session. */
  readonly latest: PerformedSet;
  /** The best earlier top set it was compared with. */
  readonly reference: PerformedSet;
  /** Comparable sessions considered, the latest included. */
  readonly sessionsCompared: number;
}

export interface ExerciseTrends {
  readonly improving: readonly ExerciseTrend[];
  readonly stalled: readonly ExerciseTrend[];
  /** Trained in the week but without enough comparable history for either conclusion. */
  readonly notEnoughHistory: number;
  /** Exercises with completed sets in the week. */
  readonly trained: number;
}

const bestOf = (logging: LoggingMode, sessions: readonly ExercisePerformanceSession[]): PerformedSet | null =>
  sessions.map(topSet).reduce<PerformedSet | null>((best, set) => (best === null || isBetterSet(logging, set, best) ? set : best), null);

const inRange = (date: IsoCalendarDate | null, from: IsoCalendarDate, to: IsoCalendarDate) => date !== null && date >= from && date <= to;

export function exerciseTrends(
  logs: readonly WorkoutLog[],
  weekStart: IsoCalendarDate,
  weekEnd: IsoCalendarDate,
  localDateOf: LocalDateOf,
): ExerciseTrends {
  const dateOf = (instant: string) => toIsoCalendarDate(localDateOf(instant));
  const improving: ExerciseTrend[] = [];
  const stalled: ExerciseTrend[] = [];
  let notEnoughHistory = 0;
  let trained = 0;

  for (const performance of performedExercises(logs)) {
    // Most recent first; nothing after the reviewed week.
    const known = performance.sessions.filter((s) => (dateOf(s.completedAt) ?? '') <= weekEnd);
    const latest = known.find((s) => inRange(dateOf(s.completedAt), weekStart, weekEnd));
    if (!latest) {
      continue;
    }
    trained++;
    const comparable = known.filter((s) => s.logging === latest.logging && s.weightUnit === latest.weightUnit);
    const fromLatest = comparable.slice(comparable.indexOf(latest));
    const base = {
      exerciseId: performance.exerciseId,
      exerciseName: performance.exerciseName,
      logging: latest.logging,
      weightUnit: latest.weightUnit,
      latest: topSet(latest),
    };

    const previous = fromLatest.slice(1, 1 + IMPROVEMENT_LOOKBACK);
    const previousBest = bestOf(latest.logging, previous);
    if (previousBest && isBetterSet(latest.logging, base.latest, previousBest)) {
      improving.push({ ...base, reference: previousBest, sessionsCompared: previous.length + 1 });
      continue;
    }
    if (fromLatest.length >= STALL_MIN_SESSIONS) {
      const recent = fromLatest.slice(0, STALL_WINDOW);
      const earlier = fromLatest.slice(STALL_WINDOW, STALL_WINDOW + IMPROVEMENT_LOOKBACK);
      const earlierBest = bestOf(latest.logging, earlier) as PerformedSet;
      if (!recent.some((s) => isBetterSet(latest.logging, topSet(s), earlierBest))) {
        stalled.push({ ...base, reference: earlierBest, sessionsCompared: recent.length + earlier.length });
        continue;
      }
    }
    if (!previousBest || fromLatest.length < STALL_MIN_SESSIONS) {
      notEnoughHistory++;
    }
  }
  return { improving, stalled, notEnoughHistory, trained };
}
