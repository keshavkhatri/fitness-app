import { FitnessAssessment } from '../fitness-calculations';

/**
 * Daily nutrition targets, taken from the fitness calculation engine's
 * assessment (never recalculated here). Targets are what the plan suggests;
 * intake is what the user logged. The two are never mixed.
 *
 * The engine's own statuses decide what may be shown:
 * - calories review-required → no calorie target and no macro targets
 *   (the assessment withholds them too);
 * - macros infeasible → no macro gram targets;
 * - macros constrained / calories floor-applied → targets shown, flagged.
 */
export type CalorieTargetView =
  | { readonly kind: 'target'; readonly kcal: number; readonly adjusted: boolean }
  | { readonly kind: 'review-required' };

export type MacroTargetView =
  | {
      readonly kind: 'target';
      readonly proteinGrams: number;
      readonly carbohydrateGrams: number;
      readonly fatGrams: number;
      readonly constrained: boolean;
    }
  | { readonly kind: 'withheld'; readonly reason: 'calorie-review' | 'infeasible' };

export interface NutritionTargets {
  readonly calories: CalorieTargetView;
  readonly macros: MacroTargetView;
}

export function nutritionTargetsFrom(assessment: FitnessAssessment): NutritionTargets {
  const calories = assessment.targets.calories;
  const macros = assessment.targets.macros;
  if (calories.status === 'review-required') {
    return { calories: { kind: 'review-required' }, macros: { kind: 'withheld', reason: 'calorie-review' } };
  }
  return {
    calories: { kind: 'target', kcal: calories.finalKcal, adjusted: calories.status === 'floor-applied' },
    macros:
      macros.status === 'infeasible'
        ? { kind: 'withheld', reason: 'infeasible' }
        : {
            kind: 'target',
            proteinGrams: macros.proteinGrams,
            carbohydrateGrams: macros.carbohydrateGrams,
            fatGrams: macros.fatGrams,
            constrained: macros.status === 'constrained',
          },
  };
}
