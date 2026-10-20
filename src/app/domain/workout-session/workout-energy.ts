import { WorkoutLog } from './workout-log.model';

/**
 * A rough estimate of the energy a resistance workout used, from the MET method: kcal = MET × body weight
 * (kg) × hours. MET 5.0 is the Compendium of Physical Activities' value for general resistance training
 * (multiple exercises, moderate effort; 3.5 light to 6.0 vigorous). It counts the time from start to
 * finish, so rests are included, as the MET value assumes. An estimate only: shown with "Est.", never used
 * for targets.
 */
export const RESISTANCE_TRAINING_MET = 5.0;

/** Estimated kcal for a finished workout, rounded to 5; null without a usable body weight or duration. */
export function estimateWorkoutCalories(log: WorkoutLog, bodyWeightKg: number | null): number | null {
  if (log.completedAt === null || bodyWeightKg === null || !Number.isFinite(bodyWeightKg) || bodyWeightKg <= 0) {
    return null;
  }
  const hours = (Date.parse(log.completedAt) - Date.parse(log.startedAt)) / 3_600_000;
  if (!Number.isFinite(hours) || hours <= 0) {
    return null;
  }
  return Math.round((RESISTANCE_TRAINING_MET * bodyWeightKg * hours) / 5) * 5;
}
