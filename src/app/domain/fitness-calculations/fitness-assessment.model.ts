import { ActivityLevel, IsoCalendarDate, PrimaryGoal } from '../fitness-profile';
import { CalculationVersion } from './calculation-config';

/**
 * Result of the deterministic fitness calculation engine.
 *
 * Two kinds of numbers, kept apart on purpose:
 * - `estimates`: estimated physiological values from population equations
 *   (BMR, TDEE). Not measurements.
 * - `targets`: initial planning targets derived from those estimates
 *   (calories, protein, fat, carbohydrates). Starting points, not prescriptions.
 *
 * UI copy should say "estimated maintenance", "starting calorie target",
 * "initial protein target", never imply a lab or medical measurement.
 * Presentation values are rounded (whole kcal / grams). `explanation` is
 * structured metadata (no display strings) so the UI can answer "Why did I
 * get this target?", and `calculationVersion` keeps old assessments
 * explainable after formulas change.
 */
export interface FitnessAssessment {
  readonly calculationVersion: CalculationVersion;
  /** Calendar date the assessment was calculated for (drives the age). */
  readonly asOfDate: IsoCalendarDate;
  readonly ageYears: number;
  readonly goal: PrimaryGoal;
  readonly goalDirection: GoalDirection;
  readonly activityLevel: ActivityLevel;

  readonly estimates: PhysiologicalEstimates;
  readonly targets: InitialTargets;

  /** Safeguards that changed or withheld a target. Empty when none applied. */
  readonly safeguardsApplied: readonly SafeguardKind[];
  readonly explanation: AssessmentExplanation;
}

export type GoalDirection = 'deficit' | 'maintenance' | 'surplus';

// --- Estimated physiological values ------------------------------------------

export interface PhysiologicalEstimates {
  /** Estimated basal metabolic rate, kcal/day. */
  readonly bmrKcal: number;
  /** Estimated total daily energy expenditure ("estimated maintenance"), kcal/day. */
  readonly tdeeKcal: number;
  readonly confidence: EstimateConfidence;
}

/**
 * Confidence in the BMR/TDEE estimate.
 * - low: formula-based with a known extra source of error (sex-neutral BMR).
 * - moderate: standard formula-based estimate; the best a profile alone allows.
 * - high: RESERVED for future methods where validated measurements (body
 *   composition, observed intake/weight trend) materially improve the
 *   estimate. Formula-only results are never high.
 */
export type ConfidenceLevel = 'low' | 'moderate' | 'high';
export type ConfidenceReason = 'formula-based-estimate' | 'sex-neutral-bmr';

export interface EstimateConfidence {
  readonly level: ConfidenceLevel;
  readonly reasons: readonly ConfidenceReason[];
}

// --- Initial planning targets ----------------------------------------------------

export interface InitialTargets {
  readonly calories: CalorieTarget;
  readonly macros: MacroTargets;
}

/**
 * - normal: calculated target used as-is.
 * - floor-applied: the goal adjustment took the target below the product
 *   safety threshold; the threshold is used. Estimated maintenance is above it.
 * - review-required: estimated maintenance itself is below the threshold, so
 *   the threshold sits ABOVE estimated maintenance and the goal adjustment
 *   can't be honoured. The UI should flag this rather than present it as normal.
 */
export type CalorieTargetStatus = 'normal' | 'floor-applied' | 'review-required';

export interface CalorieTarget {
  /** TDEE × (1 + goal adjustment), before any safeguard. */
  readonly calculatedKcal: number;
  /** The usable starting target. */
  readonly finalKcal: number;
  readonly status: CalorieTargetStatus;
  /** Product safety guard in effect (not medical guidance). */
  readonly productSafetyThresholdKcal: number;
}

/**
 * - feasible: protein, preferred fat and carbohydrates fit the calorie target.
 * - constrained: protein + preferred fat don't fit; fat was lowered (never
 *   below its configured minimum) and carbohydrates take what's left.
 * - infeasible: protein + MINIMUM fat don't fit. No gram targets are
 *   returned; nothing is silently cut. `analysis` explains the conflict.
 */
export type MacroTargets =
  | ({ readonly status: 'feasible' } & MacroGrams & { readonly analysis: MacroAnalysis })
  | ({ readonly status: 'constrained'; readonly constraint: 'fat-reduced-toward-minimum' } & MacroGrams & {
      readonly analysis: MacroAnalysis;
    })
  | {
      readonly status: 'infeasible';
      readonly reason: 'protein-exceeds-calories' | 'protein-and-minimum-fat-exceed-calories';
      readonly analysis: MacroAnalysis;
    };

export type MacroStatus = MacroTargets['status'];

export interface MacroGrams {
  readonly proteinGrams: number;
  readonly fatGrams: number;
  readonly carbohydrateGrams: number;
}

/** Why the macro status is what it is. All values whole kcal / grams. */
export interface MacroAnalysis {
  readonly calorieTargetKcal: number;
  readonly requestedProteinGrams: number;
  readonly preferredFatGrams: number;
  readonly minimumFatGrams: number;
  /** kcal by which requested protein + preferred fat exceed the target (0 if they fit). */
  readonly shortfallKcal: number;
  /** kcal by which requested protein + minimum fat exceed the target (0 if they fit). */
  readonly shortfallAtMinimumFatKcal: number;
}

// --- Safeguards ------------------------------------------------------------------

/** Details live in `targets` (calories.status / macros.status); this is the summary list. */
export type SafeguardKind = 'calorie-safety-threshold' | 'fat-reduced-toward-minimum' | 'macros-infeasible';

// --- Explanation -----------------------------------------------------------------

/** Which sex coefficients the BMR used. */
export type BmrSexBasis = 'male' | 'female' | 'sex-neutral-midpoint';

/** Method identifiers are unions so future methods slot in without breaking consumers. */
export type BmrMethod = 'mifflin-st-jeor';
export type FatMethod = 'share-of-calories';
export type CarbohydrateMethod = 'remaining-calories';

/**
 * How the protein target was derived. Future: a `lean-mass` variant using
 * body-composition data (InBody) added to this union.
 */
export type ProteinMethodDetail =
  | {
      readonly type: 'body-weight';
      readonly gramsPerKg: number;
      readonly basisWeightKg: number;
    }
  | {
      readonly type: 'adjusted-weight';
      readonly gramsPerKg: number;
      readonly actualWeightKg: number;
      /** Weight the g/kg was applied to (rounded to 0.1 kg). */
      readonly referenceWeightKg: number;
      /** Weight at the threshold BMI for the user's height (rounded to 0.1 kg). */
      readonly thresholdWeightKg: number;
      readonly thresholdBmi: number;
      readonly excessWeightFraction: number;
    };

export type ProteinMethodType = ProteinMethodDetail['type'];

export interface AssessmentExplanation {
  readonly bmr: {
    readonly method: BmrMethod;
    readonly sexBasis: BmrSexBasis;
    readonly inputs: { readonly weightKg: number; readonly heightCm: number; readonly ageYears: number };
  };
  readonly activity: { readonly level: ActivityLevel; readonly multiplier: number };
  /** Fraction applied to TDEE (−0.15 = 15% below). */
  readonly goalAdjustment: { readonly goal: PrimaryGoal; readonly fraction: number };
  readonly protein: ProteinMethodDetail;
  readonly fat: {
    readonly method: FatMethod;
    readonly preferredShare: number;
    readonly minimumShare: number;
    readonly maximumShare: number;
  };
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
