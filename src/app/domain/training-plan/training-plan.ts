import { IsoCalendarDate, UserFitnessProfile } from '../fitness-profile';
import {
  PlanAssumption,
  WORKOUT_EQUIPMENT,
  WORKOUT_LOCATIONS,
  WorkoutPlan,
  WorkoutProgrammingConfig,
  WorkoutResult,
  generateWorkoutPlan,
  workoutInputFromProfile,
} from '../workout-programming';

/**
 * The user's training plan lifecycle on top of the (frozen, v2) workout
 * engine: create a plan from the stored profile, and decide whether a stored
 * plan still belongs to the profile it is shown with.
 */

export interface PlanForProfileOptions {
  /** The user's local calendar date ("YYYY-MM-DD"). */
  readonly generatedAt: IsoCalendarDate;
  readonly config?: WorkoutProgrammingConfig;
}

/** Profile → engine input (with mapping assumptions) → deterministic plan. */
export function generateWorkoutPlanForProfile(
  profile: UserFitnessProfile,
  options: PlanForProfileOptions,
): WorkoutResult<WorkoutPlan> {
  const mapped = workoutInputFromProfile(profile);
  if (!mapped.ok) {
    return mapped;
  }
  return generateWorkoutPlan(mapped.value.input, {
    generatedAt: options.generatedAt,
    ...(options.config ? { config: options.config } : {}),
    assumptions: mapped.value.assumptions,
  });
}

/**
 * current: the plan was generated from the profile's present programming
 * inputs (goal, experience, training days, location, equipment).
 * profile-changed: any of those changed since; the plan no longer fits.
 *
 * Fields that don't affect programming (weight, activity level, units, …)
 * never make a plan stale. Neither does a newer engine version: a stored plan
 * is a snapshot of the user's program and is not rewritten behind their back.
 */
export type PlanFreshness = 'current' | 'profile-changed';

/** Assumptions recorded while mapping the profile (see `workoutInputFromProfile`). */
const PROFILE_MAPPING_ASSUMPTIONS: readonly PlanAssumption[] = [
  'combined-gym-and-home-equipment',
  'unrecognized-equipment-ignored',
  'full-gym-includes-all-equipment',
];

export function planFreshness(plan: WorkoutPlan, profile: UserFitnessProfile): PlanFreshness {
  const mapped = workoutInputFromProfile(profile);
  if (!mapped.ok) {
    return 'profile-changed';
  }
  const { input, assumptions } = mapped.value;
  const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  const recordedAssumptions = plan.assumptions.filter((a) => PROFILE_MAPPING_ASSUMPTIONS.includes(a));
  const expectedAssumptions = PROFILE_MAPPING_ASSUMPTIONS.filter((a) => assumptions.includes(a));

  const matches =
    plan.goal === input.goal &&
    plan.experience === input.experience &&
    plan.daysPerWeek === input.daysPerWeek &&
    // The engine records its normalized (canonical-order) locations and equipment.
    sameList(plan.explanation.availability.locations, WORKOUT_LOCATIONS.filter((l) => input.locations.includes(l))) &&
    sameList(plan.explanation.availability.equipment, WORKOUT_EQUIPMENT.filter((e) => input.equipment.includes(e))) &&
    sameList(
      PROFILE_MAPPING_ASSUMPTIONS.filter((a) => recordedAssumptions.includes(a)),
      expectedAssumptions,
    );
  return matches ? 'current' : 'profile-changed';
}
