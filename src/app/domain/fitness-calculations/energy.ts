import { ActivityLevel, PrimaryGoal } from '../fitness-profile';
import { FitnessCalculationConfig } from './calculation-config';
import { BmrSexBasis, CalorieTargetStatus, GoalDirection } from './fitness-assessment.model';

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

/** Product safety threshold for the BMR sex basis (not medical guidance). */
export function productSafetyThresholdFor(sexBasis: BmrSexBasis, config: FitnessCalculationConfig): number {
  const thresholds = config.calorieTarget.productSafetyThresholdKcal;
  switch (sexBasis) {
    case 'male':
      return thresholds.male;
    case 'female':
      return thresholds.female;
    default:
      return thresholds.sexNeutral;
  }
}

export interface ResolvedCalorieTarget {
  readonly calculatedKcal: number;
  readonly finalKcal: number;
  readonly status: CalorieTargetStatus;
  readonly thresholdKcal: number;
}

/**
 * Applies the PRODUCT SAFETY GUARD to a calculated target (all unrounded).
 *
 * - calculated ≥ threshold                  → normal (a target exactly at the threshold is normal)
 * - calculated < threshold ≤ maintenance    → floor-applied (the deficit was limited)
 * - maintenance < threshold                 → review-required (even maintenance is below the guard)
 *
 * The final target is never below the threshold; the calculated value is
 * always preserved so the UI can explain what happened.
 */
export function resolveCalorieTarget(
  calculatedKcal: number,
  tdeeKcal: number,
  thresholdKcal: number,
): ResolvedCalorieTarget {
  if (calculatedKcal >= thresholdKcal) {
    return { calculatedKcal, finalKcal: calculatedKcal, status: 'normal', thresholdKcal };
  }
  return {
    calculatedKcal,
    finalKcal: thresholdKcal,
    status: tdeeKcal >= thresholdKcal ? 'floor-applied' : 'review-required',
    thresholdKcal,
  };
}
