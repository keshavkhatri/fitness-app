import { UserFitnessProfile } from '../../fitness-profile';
import { generateWorkoutPlanForProfile } from '../../training-plan';
import { WorkoutPlan } from '../../workout-programming';
import { completeSet, finishWorkout, skipSet, startWorkoutLog } from '../workout-log';
import { SetEntry, WorkoutLog, WorkoutLogResult } from '../workout-log.model';

/**
 * Realistic finished workouts for tests, built through the real domain
 * transitions from a real V2 plan (no hand-written JSON).
 */

export const GYM_PROFILE: UserFitnessProfile = {
  primaryGoal: 'build-muscle',
  dateOfBirth: '1990-06-15',
  sex: 'male',
  height: { centimeters: 180 },
  weight: { kilograms: 80 },
  unitSystem: 'metric',
  trainingExperience: 'intermediate',
  trainingDaysPerWeek: 4,
  trainingLocation: 'gym',
  equipment: ['full-gym'],
  activityLevel: 'moderately-active',
  goalTarget: { targetWeight: null },
  updatedAt: '2026-10-01T09:00:00.000Z',
};

export const BODYWEIGHT_PROFILE: UserFitnessProfile = {
  ...GYM_PROFILE,
  primaryGoal: 'lose-fat',
  trainingExperience: 'beginner',
  trainingDaysPerWeek: 3,
  trainingLocation: 'home',
  equipment: ['bodyweight-only'],
};

export function planFor(profile: UserFitnessProfile = GYM_PROFILE): WorkoutPlan {
  const result = generateWorkoutPlanForProfile(profile, { generatedAt: '2026-10-01' });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

const must = <T>(result: WorkoutLogResult<T>): T => {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
};

export interface FinishedLogOptions {
  readonly plan?: WorkoutPlan;
  readonly sessionId?: string;
  /** Start instant (a local date/time is the clearest: `new Date(2026, 9, 8, 9, 0)`). */
  readonly startedAt: Date;
  readonly minutes: number;
  /**
   * Which sets to complete: every set (default), or a predicate
   * (exercise index, set index). Sets not completed are skipped when
   * `skipRest` is set, otherwise left not done.
   */
  readonly complete?: (exercise: number, set: number) => boolean;
  readonly skipRest?: boolean;
  /** Values per set; default derives sensible numbers from the set position. */
  readonly entry?: (exercise: number, set: number) => SetEntry;
  readonly weightUnit?: 'kg' | 'lb';
}

export function finishedLog(options: FinishedLogOptions): WorkoutLog {
  const plan = options.plan ?? planFor();
  const sessionId = options.sessionId ?? plan.sessions.find((s) => s.kind === 'resistance')!.id;
  const start = options.startedAt;
  const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000).toISOString();
  let log = must(
    startWorkoutLog(plan, sessionId, {
      id: `wl-${start.getTime()}-${sessionId}`,
      startedAt: start.toISOString(),
      weightUnit: options.weightUnit ?? 'kg',
    }),
  );
  const entry = options.entry ?? ((e: number, s: number) => ({ weight: 40 + e * 5 + (s === 0 ? 0 : 2.5), reps: 10 - s, durationSeconds: 30 + s * 5 }));
  log.exercises.forEach((exercise, ei) =>
    exercise.sets.forEach((_, si) => {
      if (options.complete ? options.complete(ei, si) : true) {
        log = must(completeSet(log, { exercise: ei, set: si }, entry(ei, si), at(Math.min(options.minutes, 1 + ei * 5 + si))));
      } else if (options.skipRest) {
        log = must(skipSet(log, { exercise: ei, set: si }));
      }
    }),
  );
  return must(finishWorkout(log, at(options.minutes)));
}
