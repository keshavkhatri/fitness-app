import { ActivityLevel, IsoCalendarDate, PrimaryGoal } from '../fitness-profile';
import { CalculationVersion } from './calculation-config';

/**
 * Result of the deterministic fitness calculation engine.
 *
 * These are ESTIMATES from population equations, not measurements. UI copy
 * should say "estimated maintenance", "starting calorie target", "initial
 * protein target", never imply a lab or medical measurement.
 *
 * Presentation values are rounded (whole kcal / grams). `explanation` holds
 * structured metadata (no display strings) so the UI can answer
 * "Why did I get this target?" and old assessments stay explainable after
 * formulas change (see `calculationVersion`).
 */
export interface FitnessAssessment {
  readonly calculationVersion: CalculationVersion;
  /** Calendar date the assessment was calculated for (drives the age). */
  readonly asOfDate: IsoCalendarDate;
  readonly ageYears: number;
  readonly goal: PrimaryGoal;
  readonly goalDirection: GoalDirection;
  readonly activityLevel: ActivityLevel;

  /** Estimated basal metabolic rate, kcal/day. */
  readonly bmrKcal: number;
  /** Estimated total daily energy expenditure ("estimated maintenance"), kcal/day. */
  readonly tdeeKcal: number;
  /** Starting calorie target, kcal/day. */
  readonly calorieTargetKcal: number;
  readonly proteinGrams: number;
  readonly fatGrams: number;
  readonly carbohydrateGrams: number;

  readonly confidence: AssessmentConfidence;
  /** Empty when no safeguard altered the result. */
  readonly safeguardsApplied: readonly AppliedSafeguard[];
  readonly explanation: AssessmentExplanation;
}

export type GoalDirection = 'deficit' | 'maintenance' | 'surplus';

// --- Confidence ----------------------------------------------------------------

/**
 * - low: equation-based with a known extra source of error (e.g. sex-neutral BMR).
 * - moderate: standard equation-based estimate (best possible from a profile alone).
 * - high: reserved for future methods backed by measurements or observed trends.
 */
export type ConfidenceLevel = 'low' | 'moderate' | 'high';
export type ConfidenceReason = 'equation-based-estimate' | 'sex-neutral-bmr';

export interface AssessmentConfidence {
  readonly level: ConfidenceLevel;
  readonly reasons: readonly ConfidenceReason[];
}

// --- Safeguards ------------------------------------------------------------------

export type AppliedSafeguard =
  | {
      readonly kind: 'calorie-floor';
      readonly floorKcal: number;
      /** What the target would have been without the floor (rounded). */
      readonly unconstrainedTargetKcal: number;
    }
  | {
      /** Protein + fat exceeded the calorie target; fat was reduced (carbohydrates = 0). */
      readonly kind: 'macro-constraint';
      readonly adjustment: 'fat-reduced';
      readonly unconstrainedFatGrams: number;
    }
  | {
      /** Protein alone exceeded the calorie target; protein was capped (fat and carbohydrates = 0). */
      readonly kind: 'macro-constraint';
      readonly adjustment: 'protein-capped';
      readonly unconstrainedProteinGrams: number;
    };

// --- Explanation -----------------------------------------------------------------

/** Which sex coefficients the BMR used. */
export type BmrSexBasis = 'male' | 'female' | 'sex-neutral-midpoint';

/** Method identifiers are unions so future methods (e.g. lean-mass based) slot in. */
export type BmrMethod = 'mifflin-st-jeor';
export type ProteinMethod = 'body-weight';
export type FatMethod = 'fraction-of-calories';
export type CarbohydrateMethod = 'remaining-calories';

export interface AssessmentExplanation {
  readonly bmr: {
    readonly method: BmrMethod;
    readonly sexBasis: BmrSexBasis;
    readonly inputs: { readonly weightKg: number; readonly heightCm: number; readonly ageYears: number };
  };
  readonly activity: { readonly level: ActivityLevel; readonly multiplier: number };
  /** Fraction applied to TDEE (−0.15 = 15% below). */
  readonly goalAdjustment: { readonly goal: PrimaryGoal; readonly fraction: number };
  readonly calorieFloor: { readonly floorKcal: number; readonly applied: boolean };
  readonly protein: { readonly method: ProteinMethod; readonly gramsPerKg: number; readonly basisWeightKg: number };
  readonly fat: { readonly method: FatMethod; readonly fractionOfCalories: number };
  readonly carbohydrate: { readonly method: CarbohydrateMethod };
}

// --- Errors ----------------------------------------------------------------------

export type FitnessCalculationErrorCode =
  | 'invalid-as-of-date'
  | 'invalid-date-of-birth'
  | 'age-out-of-range'
  | 'invalid-height'
  | 'invalid-weight'
  | 'invalid-sex'
  | 'invalid-activity-level'
  | 'invalid-goal'
  | 'invalid-configuration';

/** Domain error: machine-readable code plus a developer-facing message (not UI copy). */
export interface FitnessCalculationError {
  readonly code: FitnessCalculationErrorCode;
  readonly message: string;
}

export type FitnessAssessmentResult =
  | { readonly ok: true; readonly value: FitnessAssessment }
  | { readonly ok: false; readonly error: FitnessCalculationError };
