import { FitnessCalculationConfig } from './calculation-config';
import { MacroAnalysis, MacroTargets } from './fitness-assessment.model';

export interface FatTargets {
  /** Preferred share of calories, whole grams (rounded). */
  readonly preferredGrams: number;
  /** Minimum share of calories, whole grams (rounded UP so it never undercuts the share). */
  readonly minimumGrams: number;
}

/** Fat targets as configured shares of the calorie target. */
export function calculateFatTargets(calorieTargetKcal: number, config: FitnessCalculationConfig): FatTargets {
  const kcalPerGram = config.kcalPerGram.fat;
  return {
    preferredGrams: Math.round((calorieTargetKcal * config.fat.preferredShare) / kcalPerGram),
    minimumGrams: Math.ceil((calorieTargetKcal * config.fat.minimumShare) / kcalPerGram),
  };
}

/**
 * Plans whole-gram macros for a whole-kcal calorie target, in priority order:
 *   1. protein (as requested)
 *   2. fat: preferred share, never below the minimum share
 *   3. carbohydrates: remaining calories ÷ 4
 *
 * Outcomes:
 * - feasible: everything fits at preferred fat.
 * - constrained: fat lowered toward (not below) its minimum to fit; carbohydrates get any remainder.
 * - infeasible: protein + minimum fat (or protein alone) exceed the target.
 *   No gram targets are returned; the analysis records the conflict.
 *
 * Never returns negative grams and never cuts protein or minimum fat silently.
 */
export function planMacros(
  calorieTargetKcal: number,
  requestedProteinGrams: number,
  config: FitnessCalculationConfig,
): MacroTargets {
  const kcal = config.kcalPerGram;
  const protein = Math.round(requestedProteinGrams);
  const fat = calculateFatTargets(calorieTargetKcal, config);

  const proteinKcal = protein * kcal.protein;
  const analysis: MacroAnalysis = {
    calorieTargetKcal,
    requestedProteinGrams: protein,
    preferredFatGrams: fat.preferredGrams,
    minimumFatGrams: fat.minimumGrams,
    shortfallKcal: Math.max(proteinKcal + fat.preferredGrams * kcal.fat - calorieTargetKcal, 0),
    shortfallAtMinimumFatKcal: Math.max(proteinKcal + fat.minimumGrams * kcal.fat - calorieTargetKcal, 0),
  };

  if (proteinKcal > calorieTargetKcal) {
    return { status: 'infeasible', reason: 'protein-exceeds-calories', analysis };
  }
  if (analysis.shortfallAtMinimumFatKcal > 0) {
    return { status: 'infeasible', reason: 'protein-and-minimum-fat-exceed-calories', analysis };
  }

  const afterProtein = calorieTargetKcal - proteinKcal;
  if (analysis.shortfallKcal > 0) {
    // Largest whole-gram fat that fits; guaranteed ≥ minimum by the check above.
    const fatGrams = Math.floor(afterProtein / kcal.fat);
    return {
      status: 'constrained',
      constraint: 'fat-reduced-toward-minimum',
      proteinGrams: protein,
      fatGrams,
      carbohydrateGrams: Math.floor((afterProtein - fatGrams * kcal.fat) / kcal.carbohydrate),
      analysis,
    };
  }

  return {
    status: 'feasible',
    proteinGrams: protein,
    fatGrams: fat.preferredGrams,
    carbohydrateGrams: Math.round((afterProtein - fat.preferredGrams * kcal.fat) / kcal.carbohydrate),
    analysis,
  };
}
