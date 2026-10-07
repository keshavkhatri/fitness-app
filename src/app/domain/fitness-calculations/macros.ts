import { PrimaryGoal } from '../fitness-profile';
import { FitnessCalculationConfig } from './calculation-config';
import { ProteinMethod } from './fitness-assessment.model';

// --- Protein -----------------------------------------------------------------

/**
 * Inputs for the protein target. Today only body weight; a future
 * lean-body-mass method (InBody) adds an optional field and a new `method`
 * without changing callers.
 */
export interface ProteinInput {
  readonly goal: PrimaryGoal;
  readonly bodyWeightKg: number;
}

export interface ProteinTarget {
  /** Unrounded grams/day. */
  readonly grams: number;
  readonly method: ProteinMethod;
  readonly gramsPerKg: number;
  readonly basisWeightKg: number;
}

/** The single protein-target calculation; features must call this, not re-derive it. */
export function calculateProteinTarget(input: ProteinInput, config: FitnessCalculationConfig): ProteinTarget {
  const gramsPerKg = config.proteinGramsPerKg[input.goal].default;
  return {
    grams: gramsPerKg * input.bodyWeightKg,
    method: 'body-weight',
    gramsPerKg,
    basisWeightKg: input.bodyWeightKg,
  };
}

// --- Fat -----------------------------------------------------------------------

/** Fat target as a configured share of calories (unrounded grams/day). */
export function calculateFatTarget(calorieTargetKcal: number, config: FitnessCalculationConfig): number {
  return (calorieTargetKcal * config.fat.fractionOfCalories) / config.kcalPerGram.fat;
}

// --- Carbohydrates (and constraint handling) -----------------------------------

export interface MacroSplit {
  readonly proteinGrams: number;
  readonly fatGrams: number;
  readonly carbohydrateGrams: number;
  readonly constraint:
    | { readonly adjustment: 'fat-reduced'; readonly unconstrainedFatGrams: number }
    | { readonly adjustment: 'protein-capped'; readonly unconstrainedProteinGrams: number }
    | null;
}

/**
 * Allocates whole-gram macros to a whole-kcal calorie target.
 *
 * Priority: protein, then fat, then carbohydrates take what remains:
 *   carbohydrateGrams = (target − protein×4 − fat×9) / 4
 *
 * Never returns negative grams. If protein + fat don't fit:
 *  1. fat is reduced to what fits and carbohydrates are 0;
 *  2. if protein alone doesn't fit, protein is capped and fat/carbohydrates are 0.
 * The constraint is reported so it can be surfaced as a safeguard.
 *
 * Inputs are rounded to whole grams first so the returned macros add up to
 * the presented calorie target (within rounding of the carbohydrate gram).
 */
export function allocateMacros(
  calorieTargetKcal: number,
  proteinGrams: number,
  fatGrams: number,
  config: FitnessCalculationConfig,
): MacroSplit {
  const kcal = config.kcalPerGram;
  const protein = Math.round(proteinGrams);
  const fat = Math.round(fatGrams);

  const afterProtein = calorieTargetKcal - protein * kcal.protein;
  if (afterProtein < 0) {
    return {
      proteinGrams: Math.floor(calorieTargetKcal / kcal.protein),
      fatGrams: 0,
      carbohydrateGrams: 0,
      constraint: { adjustment: 'protein-capped', unconstrainedProteinGrams: protein },
    };
  }

  const remaining = afterProtein - fat * kcal.fat;
  if (remaining < 0) {
    return {
      proteinGrams: protein,
      fatGrams: Math.floor(afterProtein / kcal.fat),
      carbohydrateGrams: 0,
      constraint: { adjustment: 'fat-reduced', unconstrainedFatGrams: fat },
    };
  }

  return {
    proteinGrams: protein,
    fatGrams: fat,
    carbohydrateGrams: Math.round(remaining / kcal.carbohydrate),
    constraint: null,
  };
}
