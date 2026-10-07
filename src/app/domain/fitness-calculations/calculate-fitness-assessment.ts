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
import { applyCalorieFloor, calorieFloorFor, estimateTdee, goalCalorieTarget, goalDirectionOf } from './energy';
import {
  AppliedSafeguard,
  AssessmentConfidence,
  FitnessAssessmentResult,
  FitnessCalculationError,
  FitnessCalculationErrorCode,
} from './fitness-assessment.model';
import { allocateMacros, calculateFatTarget, calculateProteinTarget } from './macros';

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
 * Pipeline (all unrounded until the end):
 *   age          = completed years from dateOfBirth on asOfDate
 *   BMR          = Mifflin-St Jeor (sex-neutral midpoint for "prefer not to say")
 *   TDEE         = BMR × activity multiplier
 *   target       = TDEE × (1 + goal adjustment), raised to the calorie floor if below it
 *   protein      = g/kg (goal default) × body weight
 *   fat          = target × fat fraction ÷ 9
 *   carbohydrate = remaining calories ÷ 4 (never negative; see allocateMacros)
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
  const unconstrainedTarget = goalCalorieTarget(tdee, goal, config);
  const target = applyCalorieFloor(unconstrainedTarget, calorieFloorFor(bmr.sexBasis, config));
  const calorieTargetKcal = Math.round(target.kcal);

  // --- Macros ----------------------------------------------------------------
  const protein = calculateProteinTarget({ goal, bodyWeightKg: weightKg }, config);
  const fatGrams = calculateFatTarget(calorieTargetKcal, config);
  const macros = allocateMacros(calorieTargetKcal, protein.grams, fatGrams, config);

  // --- Metadata --------------------------------------------------------------
  const safeguardsApplied: AppliedSafeguard[] = [];
  if (target.floorApplied) {
    safeguardsApplied.push({
      kind: 'calorie-floor',
      floorKcal: target.floorKcal,
      unconstrainedTargetKcal: Math.round(unconstrainedTarget),
    });
  }
  if (macros.constraint) {
    safeguardsApplied.push({ kind: 'macro-constraint', ...macros.constraint });
  }

  const sexNeutral = bmr.sexBasis === 'sex-neutral-midpoint';
  const confidence: AssessmentConfidence = sexNeutral
    ? { level: 'low', reasons: ['equation-based-estimate', 'sex-neutral-bmr'] }
    : { level: 'moderate', reasons: ['equation-based-estimate'] };

  return {
    ok: true,
    value: {
      calculationVersion: config.version,
      asOfDate: options.asOfDate,
      ageYears,
      goal,
      goalDirection: goalDirectionOf(adjustment),
      activityLevel: profile.activityLevel,
      bmrKcal: Math.round(bmr.kcal),
      tdeeKcal: Math.round(tdee),
      calorieTargetKcal,
      proteinGrams: macros.proteinGrams,
      fatGrams: macros.fatGrams,
      carbohydrateGrams: macros.carbohydrateGrams,
      confidence,
      safeguardsApplied,
      explanation: {
        bmr: { method: bmr.method, sexBasis: bmr.sexBasis, inputs: { weightKg, heightCm, ageYears } },
        activity: { level: profile.activityLevel, multiplier: config.activityMultipliers[profile.activityLevel] },
        goalAdjustment: { goal, fraction: adjustment },
        calorieFloor: { floorKcal: target.floorKcal, applied: target.floorApplied },
        protein: { method: protein.method, gramsPerKg: protein.gramsPerKg, basisWeightKg: protein.basisWeightKg },
        fat: { method: 'fraction-of-calories', fractionOfCalories: config.fat.fractionOfCalories },
        carbohydrate: { method: 'remaining-calories' },
      },
    },
  };
}
