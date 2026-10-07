import { UserFitnessProfile } from '../fitness-profile';
import { DEFAULT_CALCULATION_CONFIG, FitnessCalculationConfig } from './calculation-config';
import { calculateFitnessAssessment } from './calculate-fitness-assessment';
import { FitnessAssessment, FitnessAssessmentResult } from './fitness-assessment.model';

const AS_OF = '2026-10-07';

const PROFILE: UserFitnessProfile = {
  primaryGoal: 'lose-fat',
  dateOfBirth: '1990-06-15', // 36 on 2026-10-07
  sex: 'male',
  height: { centimeters: 180 },
  weight: { kilograms: 80 },
  unitSystem: 'metric',
  trainingExperience: 'intermediate',
  trainingDaysPerWeek: 4,
  trainingLocation: 'gym',
  equipment: ['full-gym'],
  activityLevel: 'moderately-active',
  goalTarget: { targetWeight: { kilograms: 74 } },
  updatedAt: '2026-10-01T09:00:00.000Z',
};

const profile = (overrides: Partial<UserFitnessProfile> = {}): UserFitnessProfile => ({ ...PROFILE, ...overrides });

function assess(
  p: UserFitnessProfile = PROFILE,
  options: { asOfDate?: string; config?: FitnessCalculationConfig } = {},
): FitnessAssessment {
  const result = calculateFitnessAssessment(p, { asOfDate: options.asOfDate ?? AS_OF, config: options.config });
  if (!result.ok) {
    throw new Error(`Expected success, got ${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

const errorCode = (result: FitnessAssessmentResult) => (result.ok ? null : result.error.code);

describe('calculateFitnessAssessment', () => {
  describe('worked example (male, 36, 180 cm, 80 kg, moderately active, fat loss)', () => {
    // BMR  = 800 + 1125 − 180 + 5            = 1750
    // TDEE = 1750 × 1.55                     = 2712.5 → 2713
    // goal = 2712.5 × 0.85                   = 2305.625 → 2306
    // protein = 1.8 × 80                     = 144 g
    // fat  = 2306 × 0.30 / 9                 = 76.87 → 77 g
    // carbs = (2306 − 144×4 − 77×9) / 4      = 259.25 → 259 g
    it('produces the expected, rounded numbers', () => {
      expect(assess()).toMatchObject({
        ageYears: 36,
        bmrKcal: 1750,
        tdeeKcal: 2713,
        calorieTargetKcal: 2306,
        proteinGrams: 144,
        fatGrams: 77,
        carbohydrateGrams: 259,
        goal: 'lose-fat',
        goalDirection: 'deficit',
        activityLevel: 'moderately-active',
      });
    });

    it('explains how every number was derived (structured, no display strings)', () => {
      expect(assess().explanation).toEqual({
        bmr: { method: 'mifflin-st-jeor', sexBasis: 'male', inputs: { weightKg: 80, heightCm: 180, ageYears: 36 } },
        activity: { level: 'moderately-active', multiplier: 1.55 },
        goalAdjustment: { goal: 'lose-fat', fraction: -0.15 },
        calorieFloor: { floorKcal: 1500, applied: false },
        protein: { method: 'body-weight', gramsPerKg: 1.8, basisWeightKg: 80 },
        fat: { method: 'fraction-of-calories', fractionOfCalories: 0.3 },
        carbohydrate: { method: 'remaining-calories' },
      });
      expect(assess().safeguardsApplied).toEqual([]);
    });

    it('carries the calculation version and as-of date', () => {
      expect(assess()).toMatchObject({ calculationVersion: 'v1', asOfDate: AS_OF });
    });
  });

  describe('age (from date of birth on asOfDate)', () => {
    it.each([
      ['exactly 18 today', '2008-10-07', 18],
      ['normal adult', '1985-03-02', 41],
      ['birthday today', '1990-10-07', 36],
      ['birthday tomorrow', '1990-10-08', 35],
      ['birthday already occurred this year', '1990-01-20', 36],
    ])('%s', (_, dateOfBirth, age) => {
      expect(assess(profile({ dateOfBirth })).ageYears).toBe(age);
    });

    it('uses the age in the BMR (5 kcal less per year)', () => {
      const today = assess(profile({ dateOfBirth: '1990-10-07' }));
      const tomorrow = assess(profile({ dateOfBirth: '1990-10-08' }));
      expect(tomorrow.bmrKcal - today.bmrKcal).toBe(5);
    });

    it('rejects 17-year-olds', () => {
      expect(errorCode(calculateFitnessAssessment(profile({ dateOfBirth: '2008-10-08' }), { asOfDate: AS_OF }))).toBe(
        'age-out-of-range',
      );
    });
  });

  describe('sex', () => {
    it('female uses the female equation and floor', () => {
      const result = assess(profile({ sex: 'female' }));
      expect(result.bmrKcal).toBe(1584); // 1750 − 166
      expect(result.explanation.bmr.sexBasis).toBe('female');
      expect(result.explanation.calorieFloor.floorKcal).toBe(1200);
      expect(result.confidence.level).toBe('moderate');
    });

    it('prefer-not-to-say uses the midpoint and is marked lower confidence', () => {
      const result = assess(profile({ sex: 'prefer-not-to-say' }));
      expect(result.bmrKcal).toBe(1667); // (1750 + 1584) / 2
      expect(result.explanation.bmr.sexBasis).toBe('sex-neutral-midpoint');
      expect(result.confidence).toEqual({ level: 'low', reasons: ['equation-based-estimate', 'sex-neutral-bmr'] });
    });
  });

  describe('activity', () => {
    it.each([
      ['sedentary', 2100],
      ['lightly-active', 2406],
      ['moderately-active', 2713],
      ['very-active', 3019],
    ] as const)('%s: TDEE = BMR × multiplier', (activityLevel, tdee) => {
      const result = assess(profile({ activityLevel }));
      expect(result.tdeeKcal).toBe(tdee);
      expect(result.tdeeKcal).toBe(Math.round(1750 * DEFAULT_CALCULATION_CONFIG.activityMultipliers[activityLevel]));
    });

    it('does not factor in training days per week', () => {
      expect(assess(profile({ trainingDaysPerWeek: 7 }))).toEqual(assess(profile({ trainingDaysPerWeek: 2 })));
    });
  });

  describe('goals', () => {
    it.each([
      ['lose-fat', 2306, 'deficit', 144],
      ['build-muscle', 2916, 'surplus', 152],
      ['recomposition', 2713, 'maintenance', 144],
      ['get-stronger', 2713, 'maintenance', 152],
      ['improve-fitness', 2713, 'maintenance', 128],
    ] as const)('%s → %s kcal (%s), %s g protein', (primaryGoal, kcal, direction, protein) => {
      const result = assess(profile({ primaryGoal }));
      expect(result.calorieTargetKcal).toBe(kcal);
      expect(result.goalDirection).toBe(direction);
      expect(result.proteinGrams).toBe(protein);
    });

    it('does not use the target weight in v1', () => {
      expect(assess(profile({ goalTarget: { targetWeight: null } }))).toEqual(assess());
    });
  });

  describe('calorie floor safeguard', () => {
    // Small, older, sedentary woman cutting: 45 kg, 150 cm, 70 y.
    // BMR = 450 + 937.5 − 350 − 161 = 876.5; TDEE = 1051.8; −15% = 894.03 → below 1200.
    const small = profile({
      sex: 'female',
      dateOfBirth: '1956-01-01',
      height: { centimeters: 150 },
      weight: { kilograms: 45 },
      activityLevel: 'sedentary',
    });

    it('returns the floor and records the safeguard when the target is below it', () => {
      const result = assess(small);
      expect(result.calorieTargetKcal).toBe(1200);
      expect(result.safeguardsApplied).toEqual([
        { kind: 'calorie-floor', floorKcal: 1200, unconstrainedTargetKcal: 894 },
      ]);
      expect(result.explanation.calorieFloor).toEqual({ floorKcal: 1200, applied: true });
      expect(result.tdeeKcal).toBe(1052); // maintenance estimate itself is not altered
    });

    it('leaves a target exactly at the floor alone', () => {
      // Set the floor to the exact unrounded target.
      const config: FitnessCalculationConfig = {
        ...DEFAULT_CALCULATION_CONFIG,
        calorieFloorKcal: { ...DEFAULT_CALCULATION_CONFIG.calorieFloorKcal, female: 894.03 },
      };
      const result = assess(small, { config });
      expect(result.explanation.calorieFloor.applied).toBe(false);
      expect(result.safeguardsApplied).toEqual([]);
      expect(result.calorieTargetKcal).toBe(894);
    });

    it('does not apply when the target is above the floor', () => {
      expect(assess().explanation.calorieFloor.applied).toBe(false);
    });
  });

  describe('macro constraint safeguard', () => {
    it('reduces fat instead of returning negative carbohydrates, and records it', () => {
      // Deliberately extreme (test-only) protein setting: 6 g/kg × 80 kg = 480 g = 1920 kcal.
      const config: FitnessCalculationConfig = {
        ...DEFAULT_CALCULATION_CONFIG,
        proteinGramsPerKg: {
          ...DEFAULT_CALCULATION_CONFIG.proteinGramsPerKg,
          'lose-fat': { min: 1.6, max: 6, default: 6 },
        },
      };
      const result = assess(PROFILE, { config });
      expect(result.carbohydrateGrams).toBe(0);
      expect(result.fatGrams).toBe(42); // (2306 − 1920) / 9 = 42.9 → 42
      expect(result.safeguardsApplied).toEqual([
        { kind: 'macro-constraint', adjustment: 'fat-reduced', unconstrainedFatGrams: 77 },
      ]);
    });
  });

  describe('determinism', () => {
    it('returns identical assessments for identical input', () => {
      const first = calculateFitnessAssessment(PROFILE, { asOfDate: AS_OF });
      for (let i = 0; i < 5; i++) {
        expect(calculateFitnessAssessment(structuredClone(PROFILE), { asOfDate: AS_OF })).toEqual(first);
      }
    });

    it('does not mutate the profile or the configuration', () => {
      const p = structuredClone(PROFILE);
      const config = structuredClone(DEFAULT_CALCULATION_CONFIG);
      calculateFitnessAssessment(p, { asOfDate: AS_OF, config });
      expect(p).toEqual(PROFILE);
      expect(config).toEqual(DEFAULT_CALCULATION_CONFIG);
    });
  });

  describe('configuration', () => {
    const withConfig = (patch: Partial<FitnessCalculationConfig>) => assess(PROFILE, {
      config: { ...DEFAULT_CALCULATION_CONFIG, ...patch },
    });

    it('changing the activity multiplier changes TDEE proportionally', () => {
      const result = withConfig({
        activityMultipliers: { ...DEFAULT_CALCULATION_CONFIG.activityMultipliers, 'moderately-active': 1.5 },
      });
      expect(result.tdeeKcal).toBe(2625); // 1750 × 1.5
      expect(result.explanation.activity.multiplier).toBe(1.5);
    });

    it('changing the fat-loss adjustment changes the target predictably', () => {
      const result = withConfig({
        goalCalorieAdjustments: { ...DEFAULT_CALCULATION_CONFIG.goalCalorieAdjustments, 'lose-fat': -0.1 },
      });
      expect(result.calorieTargetKcal).toBe(2441); // 2712.5 × 0.9 = 2441.25
      expect(result.explanation.goalAdjustment.fraction).toBe(-0.1);
    });

    it('changing the fat fraction changes fat and, in turn, carbohydrates', () => {
      const result = withConfig({ fat: { ...DEFAULT_CALCULATION_CONFIG.fat, fractionOfCalories: 0.25 } });
      expect(result.fatGrams).toBe(64); // 2306 × 0.25 / 9 = 64.06
      expect(result.carbohydrateGrams).toBe(289); // (2306 − 64×9 − 144×4) / 4 = 288.5 → 289
    });

    it('changing the protein default changes protein', () => {
      const result = withConfig({
        proteinGramsPerKg: {
          ...DEFAULT_CALCULATION_CONFIG.proteinGramsPerKg,
          'lose-fat': { min: 1.6, max: 2.0, default: 2.0 },
        },
      });
      expect(result.proteinGrams).toBe(160);
    });

    it('rejects configurations outside approved ranges', () => {
      const invalid: FitnessCalculationConfig[] = [
        { ...DEFAULT_CALCULATION_CONFIG, fat: { ...DEFAULT_CALCULATION_CONFIG.fat, fractionOfCalories: 0.6 } },
        {
          ...DEFAULT_CALCULATION_CONFIG,
          goalCalorieAdjustments: { ...DEFAULT_CALCULATION_CONFIG.goalCalorieAdjustments, 'lose-fat': -0.4 },
        },
        {
          ...DEFAULT_CALCULATION_CONFIG,
          activityMultipliers: { ...DEFAULT_CALCULATION_CONFIG.activityMultipliers, sedentary: 0.5 },
        },
        { ...DEFAULT_CALCULATION_CONFIG, calorieFloorKcal: { male: 0, female: 1200, sexNeutral: 1500 } },
        { ...DEFAULT_CALCULATION_CONFIG, version: 'v0' as never },
      ];
      for (const config of invalid) {
        expect(errorCode(calculateFitnessAssessment(PROFILE, { asOfDate: AS_OF, config }))).toBe(
          'invalid-configuration',
        );
      }
    });
  });

  describe('domain errors for impossible input', () => {
    it.each([
      ['malformed as-of date', PROFILE, '07/10/2026', 'invalid-as-of-date'],
      ['malformed date of birth', profile({ dateOfBirth: '15/06/1990' }), AS_OF, 'invalid-date-of-birth'],
      ['date of birth after as-of date', profile({ dateOfBirth: '2027-01-01' }), AS_OF, 'invalid-date-of-birth'],
      ['implausible age', profile({ dateOfBirth: '1850-01-01' }), AS_OF, 'age-out-of-range'],
      ['zero height', profile({ height: { centimeters: 0 } }), AS_OF, 'invalid-height'],
      ['NaN weight', profile({ weight: { kilograms: Number.NaN } }), AS_OF, 'invalid-weight'],
      ['negative weight', profile({ weight: { kilograms: -80 } }), AS_OF, 'invalid-weight'],
      ['unknown sex', profile({ sex: 'other' as never }), AS_OF, 'invalid-sex'],
      ['unknown activity level', profile({ activityLevel: 'athlete' as never }), AS_OF, 'invalid-activity-level'],
      ['unknown goal', profile({ primaryGoal: 'get-huge' as never }), AS_OF, 'invalid-goal'],
    ])('%s → %s', (_, p, asOfDate, code) => {
      const result = calculateFitnessAssessment(p, { asOfDate });
      expect(errorCode(result)).toBe(code);
      expect(result.ok ? '' : result.error.message).not.toBe('');
    });
  });
});
