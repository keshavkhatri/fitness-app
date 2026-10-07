import { ACTIVITY_LEVELS, ActivityLevel, PRIMARY_GOALS, PrimaryGoal } from '../fitness-profile';

/**
 * Every tunable number used by the fitness calculation engine lives here.
 * Formulas read from a `FitnessCalculationConfig`; nothing else hard-codes
 * coefficients. Changing a value that alters results means shipping a new
 * `version`, so stored assessments stay explainable.
 */

export const CALCULATION_VERSIONS = ['v1'] as const;
export type CalculationVersion = (typeof CALCULATION_VERSIONS)[number];

export interface GramsPerKgRange {
  readonly min: number;
  readonly max: number;
  /** Deterministic value used by the engine; must lie within [min, max]. */
  readonly default: number;
}

export interface FractionRange {
  readonly min: number;
  readonly max: number;
}

/** Lowest calorie target the engine will return, by the sex basis used for BMR. */
export interface CalorieFloorConfig {
  readonly male: number;
  readonly female: number;
  /** Used for sex-neutral estimates; the higher (more conservative) floor. */
  readonly sexNeutral: number;
}

export interface FitnessCalculationConfig {
  readonly version: CalculationVersion;
  /** TDEE = BMR × multiplier. Training frequency is deliberately NOT included. */
  readonly activityMultipliers: Readonly<Record<ActivityLevel, number>>;
  /** Fractional change applied to TDEE (−0.15 = 15% below). */
  readonly goalCalorieAdjustments: Readonly<Record<PrimaryGoal, number>>;
  /** Approved goal adjustment ranges; defaults above must fall within them. */
  readonly goalCalorieAdjustmentRanges: Readonly<Record<PrimaryGoal, FractionRange>>;
  /** Protein per kg of body weight, by goal. */
  readonly proteinGramsPerKg: Readonly<Record<PrimaryGoal, GramsPerKgRange>>;
  readonly fat: {
    /** Share of the calorie target allocated to fat. */
    readonly fractionOfCalories: number;
    /** Allowed bounds for `fractionOfCalories` (prevents fat consuming an unreasonable share). */
    readonly allowedFraction: FractionRange;
  };
  readonly calorieFloorKcal: CalorieFloorConfig;
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
  proteinGramsPerKg: {
    'lose-fat': { min: 1.6, max: 2.0, default: 1.8 },
    recomposition: { min: 1.6, max: 2.0, default: 1.8 },
    'build-muscle': { min: 1.6, max: 2.2, default: 1.9 },
    'get-stronger': { min: 1.6, max: 2.2, default: 1.9 },
    'improve-fitness': { min: 1.4, max: 1.8, default: 1.6 },
  },
  fat: {
    fractionOfCalories: 0.3,
    allowedFraction: { min: 0.2, max: 0.35 },
  },
  // Conservative lower bounds, NOT individual medical recommendations.
  calorieFloorKcal: { male: 1500, female: 1200, sexNeutral: 1500 },
  kcalPerGram: { protein: 4, carbohydrate: 4, fat: 9 },
};

/**
 * Sanity-checks a configuration. Returns human-readable problems for
 * developers (empty when valid); the engine refuses to run on a bad config.
 */
export function validateCalculationConfig(config: FitnessCalculationConfig): string[] {
  const problems: string[] = [];
  const positive = (value: number) => Number.isFinite(value) && value > 0;
  const within = (value: number, range: FractionRange) =>
    Number.isFinite(value) && value >= range.min && value <= range.max;

  if (!(CALCULATION_VERSIONS as readonly string[]).includes(config.version)) {
    problems.push(`Unknown calculation version "${config.version}".`);
  }
  for (const level of ACTIVITY_LEVELS) {
    const multiplier = config.activityMultipliers[level];
    if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 2.5) {
      problems.push(`Activity multiplier for "${level}" must be between 1 and 2.5.`);
    }
  }
  for (const goal of PRIMARY_GOALS) {
    if (!within(config.goalCalorieAdjustments[goal], config.goalCalorieAdjustmentRanges[goal])) {
      problems.push(`Calorie adjustment for "${goal}" is outside its approved range.`);
    }
    const protein = config.proteinGramsPerKg[goal];
    if (!positive(protein.min) || !within(protein.default, protein)) {
      problems.push(`Protein default for "${goal}" must be positive and within its range.`);
    }
  }
  if (!within(config.fat.fractionOfCalories, config.fat.allowedFraction) || config.fat.allowedFraction.max >= 1) {
    problems.push('Fat fraction must be within its allowed range (and below 1).');
  }
  const floors = config.calorieFloorKcal;
  if (![floors.male, floors.female, floors.sexNeutral].every(positive)) {
    problems.push('Calorie floors must be positive.');
  }
  const { protein, carbohydrate, fat } = config.kcalPerGram;
  if (![protein, carbohydrate, fat].every(positive)) {
    problems.push('Energy densities must be positive.');
  }
  return problems;
}
