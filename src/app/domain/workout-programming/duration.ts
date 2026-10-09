import { WorkoutProgrammingConfig } from './workout-config';
import { PlannedExercise } from './workout-plan.model';

/**
 * Rough session length:
 *   warm-up
 *   + per exercise: setup + sets × work + (sets − 1) × rest
 * where work = mid-range reps × seconds-per-rep (or the timed interval),
 * doubled for per-side exercises. Rounded UP to the configured granularity,
 * because it is an estimate, not a timer.
 */
export type TimedWork = Pick<PlannedExercise, 'sets' | 'target' | 'restSeconds' | 'notes'>;

export function estimateSessionMinutes(
  exercises: readonly TimedWork[],
  config: WorkoutProgrammingConfig,
): number {
  const d = config.duration;
  const seconds = exercises.reduce((total, planned) => {
    const perSide = planned.notes.includes('per-side') ? 2 : 1;
    const workPerSet =
      (planned.target.kind === 'time'
        ? planned.target.seconds
        : ((planned.target.min + planned.target.max) / 2) * d.secondsPerRep) * perSide;
    return (
      total + d.setupSecondsPerExercise + planned.sets * workPerSet + Math.max(planned.sets - 1, 0) * planned.restSeconds
    );
  }, d.warmupMinutes * 60);
  return Math.ceil(seconds / 60 / d.roundToMinutes) * d.roundToMinutes;
}
