import { ActivityLevel, PrimaryGoal } from '../fitness-profile';
import { FitnessCalculationConfig } from './calculation-config';
import { BmrSexBasis, GoalDirection } from './fitness-assessment.model';

/** TDEE = BMR × activity multiplier (unrounded). Training days are intentionally not a factor. */
export function estimateTdee(bmrKcal: number, activityLevel: ActivityLevel, config: FitnessCalculationConfig): number {
  return bmrKcal * config.activityMultipliers[activityLevel];
}

export function goalDirectionOf(adjustmentFraction: number): GoalDirection {
  if (adjustmentFraction < 0) {
    return 'deficit';
  }
  return adjustmentFraction > 0 ? 'surplus' : 'maintenance';
}

/** Goal calorie target before safeguards (unrounded). */
export function goalCalorieTarget(tdeeKcal: number, goal: PrimaryGoal, config: FitnessCalculationConfig): number {
  return tdeeKcal * (1 + config.goalCalorieAdjustments[goal]);
}

export function calorieFloorFor(sexBasis: BmrSexBasis, config: FitnessCalculationConfig): number {
  const floors = config.calorieFloorKcal;
  switch (sexBasis) {
    case 'male':
      return floors.male;
    case 'female':
      return floors.female;
    default:
      return floors.sexNeutral;
  }
}

export interface FlooredTarget {
  readonly kcal: number;
  readonly floorKcal: number;
  readonly floorApplied: boolean;
}

/**
 * Conservative lower-bound safeguard: a target below the floor is raised to
 * the floor. A target exactly at the floor is left as-is (not "applied").
 * The floor is a product safety limit, not individual medical advice.
 */
export function applyCalorieFloor(targetKcal: number, floorKcal: number): FlooredTarget {
  return targetKcal < floorKcal
    ? { kcal: floorKcal, floorKcal, floorApplied: true }
    : { kcal: targetKcal, floorKcal, floorApplied: false };
}
