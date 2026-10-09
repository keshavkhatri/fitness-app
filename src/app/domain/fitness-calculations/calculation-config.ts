import { ACTIVITY_LEVELS, ActivityLevel, PRIMARY_GOALS, PrimaryGoal } from '../fitness-profile';

/**
 * Every tunable number used by the fitness calculation engine lives here.
 * Formulas read from a `FitnessCalculationConfig`; nothing else hard-codes
 * coefficients. Changing a value that alters results means shipping a new
 * `version`, so stored assessments stay explainable.
 */

export const CALCULATION_VERSIONS = ['v1'] as const;
export type CalculationVersion = (typeof CALCULATION_VERSIONS)[number];

export interface NumberRange {
  readonly min: number;
  readonly max: number;
}

export interface GramsPerKgRange extends NumberRange {
  /** Deterministic value used by the engine; must lie within [min, max]. */
  readonly default: number;
}

export interface FitnessCalculationConfig {
  readonly version: CalculationVersion;

  /** TDEE = BMR × multiplier. Training frequency is deliberately NOT included. */
  readonly activityMultipliers: Readonly<Record<ActivityLevel, number>>;

  /** Fractional change applied to TDEE (−0.15 = 15% below). */
  readonly goalCalorieAdjustments: Readonly<Record<PrimaryGoal, number>>;
  /** Approved goal adjustment ranges; the adjustments above must fall within them. */
  readonly goalCalorieAdjustmentRanges: Readonly<Record<PrimaryGoal, NumberRange>>;

  readonly calorieTarget: {
    /**
     * PRODUCT SAFETY GUARD, not medical guidance. Calorie targets are never
     * set below this value by the app; a target at or above it is NOT thereby
     * "safe" or appropriate for any individual. Selected by the sex basis
     * used for BMR; the sex-neutral value is the more conservative one.
     */
    readonly productSafetyThresholdKcal: { readonly male: number; readonly female: number; readonly sexNeutral: number };
  };

  readonly protein: {
    /** Protein per kg of the method's basis weight, by goal. */
    readonly gramsPerKg: Readonly<Record<PrimaryGoal, GramsPerKgRange>>;
    /**
     * Adjusted-weight method for higher body weights.
     *
     * Rationale: g/kg protein recommendations are derived mostly from people
     * near typical body composition. Multiplying total weight indefinitely
     * gives very high targets at higher body weights, where the extra weight
     * is largely not lean tissue. Above a height-relative threshold
     * (threshold weight = thresholdBmi × height²), only a fraction of the
     * excess weight counts:
     *
     *   referenceWeight = thresholdWeight + excessWeightFraction × (weight − thresholdWeight)
     *
     * This is continuous at the threshold (no jump in protein when crossing
     * it) and still rises gently with weight. A lean-mass method (InBody)
     * will replace this when body-composition data exists.
     */
    readonly adjustedWeight: {
      readonly thresholdBmi: number;
      readonly excessWeightFraction: number;
    };
  };

  /** Fat as a share of the final calorie target. min ≤ preferred ≤ max. */
  readonly fat: {
    readonly preferredShare: number;
    /** Never silently undercut: if it can't be met, macros are reported infeasible. */
    readonly minimumShare: number;
    readonly maximumShare: number;
  };

  /** Energy density used for macro ↔ calorie conversion. */
  readonly kcalPerGram: { readonly protein: number; readonly carbohydrate: number; readonly fat: number };
}

/**
 * v1 defaults. Where the product spec gave a range, the default is its
 * midpoint, so every choice follows one documented rule.
 */
export const DEFAULT_CALCULATION_CONFIG: FitnessCalculationConfig = {
  version: 'v1',
  activityMultipliers: {
    sedentary: 1.2,
    'lightly-active': 1.375,
    'moderately-active': 1.55,
    'very-active': 1.725,
  },
  goalCalorieAdjustments: {
    'lose-fat': -0.15, // midpoint of 10–20% below TDEE
    'build-muscle': 0.075, // midpoint of 5–10% above TDEE
    recomposition: 0,
    'get-stronger': 0,
    'improve-fitness': 0,
  },
  goalCalorieAdjustmentRanges: {
    'lose-fat': { min: -0.2, max: -0.1 },
    'build-muscle': { min: 0.05, max: 0.1 },
    recomposition: { min: 0, max: 0 },
    'get-stronger': { min: 0, max: 0 },
    'improve-fitness': { min: 0, max: 0 },
  },
  calorieTarget: {
    productSafetyThresholdKcal: { male: 1500, female: 1200, sexNeutral: 1500 },
  },
  protein: {
    gramsPerKg: {
      'lose-fat': { min: 1.6, max: 2.0, default: 1.8 },
      recomposition: { min: 1.6, max: 2.0, default: 1.8 },
      'build-muscle': { min: 1.6, max: 2.2, default: 1.9 },
      'get-stronger': { min: 1.6, max: 2.2, default: 1.9 },
      'improve-fitness': { min: 1.4, max: 1.8, default: 1.6 },
    },
    adjustedWeight: { thresholdBmi: 30, excessWeightFraction: 0.25 },
  },
  fat: { preferredShare: 0.3, minimumShare: 0.2, maximumShare: 0.35 },
  kcalPerGram: { protein: 4, carbohydrate: 4, fat: 9 },
};

/**
 * Outer sanity limits for configuration values. Not tuning knobs: they stop a
 * typo (e.g. fat share 3.0, threshold BMI 3) from reaching users.
 */
export const CONFIG_LIMITS = {
  activityMultiplier: { min: 1, max: 2.5 },
  goalAdjustment: { min: -0.3, max: 0.2 },
  proteinGramsPerKg: { min: 0.8, max: 3 },
  proteinThresholdBmi: { min: 25, max: 40 },
  excessWeightFraction: { min: 0, max: 1 },
  fatShare: { min: 0.15, max: 0.45 },
  productSafetyThresholdKcal: { min: 800, max: 2500 },
} as const satisfies Record<string, NumberRange>;

/**
 * Sanity-checks a configuration. Returns developer-facing problems (empty when
 * valid); the engine refuses to run on a bad config.
 */
export function validateCalculationConfig(config: FitnessCalculationConfig): string[] {
  const problems: string[] = [];
  const within = (value: number, range: NumberRange) =>
    Number.isFinite(value) && value >= range.min && value <= range.max;
  const check = (ok: boolean, problem: string) => {
    if (!ok) {
      problems.push(problem);
    }
  };

  check((CALCULATION_VERSIONS as readonly string[]).includes(config.version), `Unknown version "${config.version}".`);

  for (const level of ACTIVITY_LEVELS) {
    check(
      within(config.activityMultipliers[level], CONFIG_LIMITS.activityMultiplier),
      `Activity multiplier for "${level}" is outside ${CONFIG_LIMITS.activityMultiplier.min}–${CONFIG_LIMITS.activityMultiplier.max}.`,
    );
  }

  for (const goal of PRIMARY_GOALS) {
    const range = config.goalCalorieAdjustmentRanges[goal];
    check(
      within(range.min, CONFIG_LIMITS.goalAdjustment) && within(range.max, CONFIG_LIMITS.goalAdjustment) && range.min <= range.max,
      `Approved calorie adjustment range for "${goal}" is invalid.`,
    );
    check(within(config.goalCalorieAdjustments[goal], range), `Calorie adjustment for "${goal}" is outside its approved range.`);

    const protein = config.protein.gramsPerKg[goal];
    check(
      within(protein.min, CONFIG_LIMITS.proteinGramsPerKg) &&
        within(protein.max, CONFIG_LIMITS.proteinGramsPerKg) &&
        within(protein.default, protein),
      `Protein g/kg for "${goal}" is invalid or its default is outside its range.`,
    );
  }

  const { thresholdBmi, excessWeightFraction } = config.protein.adjustedWeight;
  check(within(thresholdBmi, CONFIG_LIMITS.proteinThresholdBmi), 'Protein adjustment threshold BMI is out of range.');
  check(within(excessWeightFraction, CONFIG_LIMITS.excessWeightFraction), 'Protein excess-weight fraction must be 0–1.');

  const fat = config.fat;
  check(
    [fat.minimumShare, fat.preferredShare, fat.maximumShare].every((share) => within(share, CONFIG_LIMITS.fatShare)) &&
      fat.minimumShare <= fat.preferredShare &&
      fat.preferredShare <= fat.maximumShare,
    'Fat shares must satisfy minimum ≤ preferred ≤ maximum within the allowed limits.',
  );

  const thresholds = config.calorieTarget.productSafetyThresholdKcal;
  check(
    [thresholds.male, thresholds.female, thresholds.sexNeutral].every((kcal) =>
      within(kcal, CONFIG_LIMITS.productSafetyThresholdKcal),
    ),
    'Product safety thresholds are out of range.',
  );

  const { protein, carbohydrate, fat: fatKcal } = config.kcalPerGram;
  check([protein, carbohydrate, fatKcal].every((kcal) => Number.isFinite(kcal) && kcal > 0), 'Energy densities must be positive.');

  return problems;
}
