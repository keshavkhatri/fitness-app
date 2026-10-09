import {
  AGE_YEARS,
  HEIGHT_CM,
  IsoCalendarDate,
  UserFitnessProfile,
  WEIGHT_KG,
  ageOn,
  compareCalendarDates,
  isActivityLevel,
  isPrimaryGoal,
  isSex,
  isWithin,
  parseIsoCalendarDate,
} from '../fitness-profile';
import { DEFAULT_CALCULATION_CONFIG, FitnessCalculationConfig, validateCalculationConfig } from './calculation-config';
import { estimateBmr } from './bmr';
import { estimateTdee, goalCalorieTarget, goalDirectionOf, productSafetyThresholdFor, resolveCalorieTarget } from './energy';
import {
  EstimateConfidence,
  FitnessAssessmentResult,
  FitnessCalculationError,
  FitnessCalculationErrorCode,
  SafeguardKind,
} from './fitness-assessment.model';
import { planMacros } from './macros';
import { calculateProteinTarget } from './protein';

export interface CalculationOptions {
  /**
   * The user's local calendar date to calculate for ("YYYY-MM-DD"). Required
   * (no hidden clock) so results are deterministic and timezone-independent.
   */
  readonly asOfDate: IsoCalendarDate;
  readonly config?: FitnessCalculationConfig;
}

/**
 * Calculates an initial, equation-based fitness assessment from a profile.
 *
 * Pipeline (unrounded until the output boundary):
 *   Estimated physiological values
 *     age          = completed years from dateOfBirth on asOfDate
 *     BMR          = Mifflin-St Jeor (sex-neutral midpoint for "prefer not to say")
 *     TDEE         = BMR × activity multiplier
 *   Initial planning targets
 *     calories     = TDEE × (1 + goal adjustment), then the product safety threshold
 *                    (see resolveCalorieTarget; calculated value always preserved)
 *     protein      = g/kg × body weight, or × adjusted weight above the threshold (protein.ts)
 *     fat          = preferred share of calories, never below the minimum share
 *     carbohydrate = remaining calories ÷ 4
 *     → macros are feasible / constrained / infeasible (planMacros); never negative
 *
 * `goalTarget` (e.g. target weight) is intentionally not used in v1: there is
 * no rate/timeline model yet, so it would not change any number.
 *
 * Pure and deterministic: no Angular, browser APIs, storage or clock.
 * Returns a typed error instead of producing nonsense for impossible input.
 */
export function calculateFitnessAssessment(
  profile: UserFitnessProfile,
  options: CalculationOptions,
): FitnessAssessmentResult {
  const config = options.config ?? DEFAULT_CALCULATION_CONFIG;
  const fail = (code: FitnessCalculationErrorCode, message: string): FitnessAssessmentResult => ({
    ok: false,
    error: { code, message } satisfies FitnessCalculationError,
  });

  // --- Input protection ------------------------------------------------------
  const configProblems = validateCalculationConfig(config);
  if (configProblems.length > 0) {
    return fail('invalid-configuration', configProblems.join(' '));
  }
  const asOf = parseIsoCalendarDate(options.asOfDate);
  if (!asOf) {
    return fail('invalid-as-of-date', `asOfDate must be a valid YYYY-MM-DD date, got "${options.asOfDate}".`);
  }
  const dob = parseIsoCalendarDate(profile.dateOfBirth);
  if (!dob || compareCalendarDates(dob, asOf) > 0) {
    return fail('invalid-date-of-birth', 'dateOfBirth must be a valid date on or before asOfDate.');
  }
  const ageYears = ageOn(dob, asOf);
  if (!isWithin(ageYears, AGE_YEARS)) {
    return fail('age-out-of-range', `Age ${ageYears} is outside ${AGE_YEARS.min}–${AGE_YEARS.max}.`);
  }
  const heightCm = profile.height?.centimeters;
  if (!Number.isFinite(heightCm) || !isWithin(heightCm, HEIGHT_CM)) {
    return fail('invalid-height', `Height must be ${HEIGHT_CM.min}–${HEIGHT_CM.max} cm.`);
  }
  const weightKg = profile.weight?.kilograms;
  if (!Number.isFinite(weightKg) || !isWithin(weightKg, WEIGHT_KG)) {
    return fail('invalid-weight', `Weight must be ${WEIGHT_KG.min}–${WEIGHT_KG.max} kg.`);
  }
  if (!isSex(profile.sex)) {
    return fail('invalid-sex', `Unknown sex "${String(profile.sex)}".`);
  }
  if (!isActivityLevel(profile.activityLevel)) {
    return fail('invalid-activity-level', `Unknown activity level "${String(profile.activityLevel)}".`);
  }
  if (!isPrimaryGoal(profile.primaryGoal)) {
    return fail('invalid-goal', `Unknown goal "${String(profile.primaryGoal)}".`);
  }

  // --- Energy ----------------------------------------------------------------
  const goal = profile.primaryGoal;
  const bmr = estimateBmr({ weightKg, heightCm, ageYears, sex: profile.sex });
  const tdee = estimateTdee(bmr.kcal, profile.activityLevel, config);
  const adjustment = config.goalCalorieAdjustments[goal];
  const calories = resolveCalorieTarget(
    goalCalorieTarget(tdee, goal, config),
    tdee,
    productSafetyThresholdFor(bmr.sexBasis, config),
  );
  const finalCalorieKcal = Math.round(calories.finalKcal);

  // --- Macros ----------------------------------------------------------------
  const protein = calculateProteinTarget({ goal, bodyWeightKg: weightKg, heightCm }, config);
  const macros = planMacros(finalCalorieKcal, protein.grams, config);

  // --- Metadata --------------------------------------------------------------
  const safeguardsApplied: SafeguardKind[] = [];
  if (calories.status !== 'normal') {
    safeguardsApplied.push('calorie-safety-threshold');
  }
  if (macros.status === 'constrained') {
    safeguardsApplied.push('fat-reduced-toward-minimum');
  } else if (macros.status === 'infeasible') {
    safeguardsApplied.push('macros-infeasible');
  }

  // Formula-only estimates are never "high" (reserved for measurement-backed methods).
  const confidence: EstimateConfidence =
    bmr.sexBasis === 'sex-neutral-midpoint'
      ? { level: 'low', reasons: ['formula-based-estimate', 'sex-neutral-bmr'] }
      : { level: 'moderate', reasons: ['formula-based-estimate'] };

  return {
    ok: true,
    value: {
      calculationVersion: config.version,
      asOfDate: options.asOfDate,
      ageYears,
      goal,
      goalDirection: goalDirectionOf(adjustment),
      activityLevel: profile.activityLevel,
      estimates: { bmrKcal: Math.round(bmr.kcal), tdeeKcal: Math.round(tdee), confidence },
      targets: {
        calories: {
          calculatedKcal: Math.round(calories.calculatedKcal),
          finalKcal: finalCalorieKcal,
          status: calories.status,
          productSafetyThresholdKcal: calories.thresholdKcal,
        },
        macros,
      },
      safeguardsApplied,
      explanation: {
        bmr: { method: bmr.method, sexBasis: bmr.sexBasis, inputs: { weightKg, heightCm, ageYears } },
        activity: { level: profile.activityLevel, multiplier: config.activityMultipliers[profile.activityLevel] },
        goalAdjustment: { goal, fraction: adjustment },
        protein: protein.method,
        fat: { method: 'share-of-calories', ...config.fat },
        carbohydrate: { method: 'remaining-calories' },
      },
    },
  };
}
