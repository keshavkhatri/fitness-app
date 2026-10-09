import { EquipmentId, TrainingLocation, UserFitnessProfile } from '../fitness-profile';
import { WorkoutResult, fail, ok } from './errors';
import { WorkoutGenerationInput } from './workout-input.model';
import { PlanAssumption } from './workout-plan.model';
import { WORKOUT_EQUIPMENT, WorkoutEquipment, WorkoutLocation, isWorkoutFrequency } from './workout-taxonomy';

/**
 * Maps the onboarding profile vocabulary onto workout-engine input. Kept
 * separate so the engine's own model stays independent of onboarding choices.
 */

const LOCATION_MAP: Readonly<Record<TrainingLocation, readonly WorkoutLocation[]>> = {
  gym: ['gym'],
  home: ['home'],
  both: ['gym', 'home'],
};

const EQUIPMENT_MAP: Readonly<Record<EquipmentId, readonly WorkoutEquipment[]>> = {
  // A full gym provides everything in the engine's vocabulary, including a rack.
  'full-gym': WORKOUT_EQUIPMENT,
  dumbbells: ['dumbbells'],
  barbells: ['barbell'],
  'cable-machine': ['cable'],
  machines: ['machine'],
  'resistance-bands': ['resistance-band'],
  'pull-up-bar': ['pull-up-bar'],
  bench: ['bench'],
  'bodyweight-only': [],
  // Unknown equipment can't be programmed against.
  other: [],
};

export interface ProfileWorkoutInput {
  readonly input: WorkoutGenerationInput;
  /** Assumptions made while mapping, to carry into the plan's explanation. */
  readonly assumptions: readonly PlanAssumption[];
}

export function workoutInputFromProfile(profile: UserFitnessProfile): WorkoutResult<ProfileWorkoutInput> {
  const days = profile.trainingDaysPerWeek;
  if (!isWorkoutFrequency(days)) {
    // The profile allows 7 days; the v1 engine programs 2–6 (see product decision).
    return fail('invalid-frequency', `Training frequency ${days} is not supported by workout programming v1 (2–6).`, {
      supported: ['2', '3', '4', '5', '6'],
    });
  }
  const assumptions: PlanAssumption[] = [];
  if (profile.trainingLocation === 'both') {
    assumptions.push('combined-gym-and-home-equipment');
  }
  if (profile.equipment.includes('other')) {
    assumptions.push('unrecognized-equipment-ignored');
  }
  if (profile.equipment.includes('full-gym')) {
    assumptions.push('full-gym-includes-all-equipment');
  }
  const equipment = WORKOUT_EQUIPMENT.filter((item) => profile.equipment.some((id) => EQUIPMENT_MAP[id].includes(item)));

  return ok({
    input: {
      goal: profile.primaryGoal,
      experience: profile.trainingExperience,
      daysPerWeek: days,
      locations: LOCATION_MAP[profile.trainingLocation],
      equipment,
    },
    assumptions,
  });
}
