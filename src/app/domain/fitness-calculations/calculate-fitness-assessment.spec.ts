import { UserFitnessProfile } from '../fitness-profile';
import { DEFAULT_CALCULATION_CONFIG as DEFAULTS, FitnessCalculationConfig, validateCalculationConfig } from './calculation-config';
import { calculateFitnessAssessment } from './calculate-fitness-assessment';
import { FitnessAssessment, FitnessAssessmentResult, MacroTargets } from './fitness-assessment.model';

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
const grams = (macros: MacroTargets) =>
  macros.status === 'infeasible' ? null : [macros.proteinGrams, macros.fatGrams, macros.carbohydrateGrams];

describe('calculateFitnessAssessment', () => {
  describe('worked example (male, 36, 180 cm, 80 kg, moderately active, fat loss)', () => {
    // BMR  = 800 + 1125 − 180 + 5            = 1750
    // TDEE = 1750 × 1.55                     = 2712.5 → 2713
    // target = 2712.5 × 0.85                 = 2305.625 → 2306 (above 1500 threshold)
    // protein = 1.8 × 80 (body weight)       = 144 g
    // fat = 2306 × 0.30 / 9                  = 76.87 → 77 g  (minimum 20% → 52 g)
    // carbs = (2306 − 144×4 − 77×9) / 4      = 259.25 → 259 g
    it('separates estimated physiological values from initial targets', () => {
      const result = assess();
      expect(result.estimates).toEqual({
        bmrKcal: 1750,
        tdeeKcal: 2713,
        confidence: { level: 'moderate', reasons: ['formula-based-estimate'] },
      });
      expect(result.targets).toEqual({
        calories: { calculatedKcal: 2306, finalKcal: 2306, status: 'normal', productSafetyThresholdKcal: 1500 },
        macros: {
          status: 'feasible',
          proteinGrams: 144,
          fatGrams: 77,
          carbohydrateGrams: 259,
          analysis: {
            calorieTargetKcal: 2306,
            requestedProteinGrams: 144,
            preferredFatGrams: 77,
            minimumFatGrams: 52,
            shortfallKcal: 0,
            shortfallAtMinimumFatKcal: 0,
          },
        },
      });
      expect(result).toMatchObject({ ageYears: 36, goal: 'lose-fat', goalDirection: 'deficit', safeguardsApplied: [] });
    });

    it('explains how every number was derived (structured, no display strings)', () => {
      expect(assess().explanation).toEqual({
        bmr: { method: 'mifflin-st-jeor', sexBasis: 'male', inputs: { weightKg: 80, heightCm: 180, ageYears: 36 } },
        activity: { level: 'moderately-active', multiplier: 1.55 },
        maintenance: { source: 'formula', kcal: assess().estimates.tdeeKcal },
        goalAdjustment: { goal: 'lose-fat', fraction: -0.15 },
        protein: { type: 'body-weight', gramsPerKg: 1.8, basisWeightKg: 80 },
        fat: { method: 'share-of-calories', preferredShare: 0.3, minimumShare: 0.2, maximumShare: 0.35 },
        carbohydrate: { method: 'remaining-calories' },
      });
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
      expect(tomorrow.estimates.bmrKcal - today.estimates.bmrKcal).toBe(5);
    });

    it('rejects 17-year-olds', () => {
      expect(errorCode(calculateFitnessAssessment(profile({ dateOfBirth: '2008-10-08' }), { asOfDate: AS_OF }))).toBe(
        'age-out-of-range',
      );
    });
  });

  describe('sex and confidence', () => {
    it('female uses the female equation and threshold; formula-only stays moderate', () => {
      const result = assess(profile({ sex: 'female' }));
      expect(result.estimates.bmrKcal).toBe(1584); // 1750 − 166
      expect(result.explanation.bmr.sexBasis).toBe('female');
      expect(result.targets.calories.productSafetyThresholdKcal).toBe(1200);
      expect(result.estimates.confidence.level).toBe('moderate');
    });

    it('prefer-not-to-say uses the midpoint and is marked low confidence', () => {
      const result = assess(profile({ sex: 'prefer-not-to-say' }));
      expect(result.estimates.bmrKcal).toBe(1667); // (1750 + 1584) / 2
      expect(result.explanation.bmr.sexBasis).toBe('sex-neutral-midpoint');
      expect(result.estimates.confidence).toEqual({ level: 'low', reasons: ['formula-based-estimate', 'sex-neutral-bmr'] });
      expect(result.targets.calories.productSafetyThresholdKcal).toBe(1500);
    });

    it('never reports high confidence for formula-only estimates', () => {
      for (const sex of ['male', 'female', 'prefer-not-to-say'] as const) {
        expect(assess(profile({ sex })).estimates.confidence.level).not.toBe('high');
      }
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
      expect(result.estimates.tdeeKcal).toBe(tdee);
      expect(result.estimates.tdeeKcal).toBe(Math.round(1750 * DEFAULTS.activityMultipliers[activityLevel]));
    });

    it('does not factor in training days per week', () => {
      expect(assess(profile({ trainingDaysPerWeek: 6 }))).toEqual(assess(profile({ trainingDaysPerWeek: 2 })));
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
      expect(result.targets.calories.finalKcal).toBe(kcal);
      expect(result.goalDirection).toBe(direction);
      expect(grams(result.targets.macros)?.[0]).toBe(protein);
    });

    it('does not use the target weight in v1', () => {
      expect(assess(profile({ goalTarget: { targetWeight: null } }))).toEqual(assess());
    });
  });

  describe('protein method in the pipeline', () => {
    it('uses adjusted weight above the threshold, with metadata', () => {
      // 150 kg, 180 cm (BMI 46.3): reference = 97.2 + 0.25 × 52.8 = 110.4 kg → 198.72 → 199 g (not 270 g)
      const result = assess(profile({ weight: { kilograms: 150 } }));
      expect(grams(result.targets.macros)?.[0]).toBe(199);
      expect(result.explanation.protein).toEqual({
        type: 'adjusted-weight',
        gramsPerKg: 1.8,
        actualWeightKg: 150,
        referenceWeightKg: 110.4,
        thresholdWeightKg: 97.2,
        thresholdBmi: 30,
        excessWeightFraction: 0.25,
      });
      // Energy estimates still use actual body weight.
      expect(result.explanation.bmr.inputs.weightKg).toBe(150);
    });
  });

  describe('calorie target safety handling', () => {
    it('normal: threshold not triggered', () => {
      expect(assess().targets.calories.status).toBe('normal');
      expect(assess().safeguardsApplied).not.toContain('calorie-safety-threshold');
    });

    it('floor-applied: deficit dips below the threshold while maintenance is above it', () => {
      // Female, 60 y, 155 cm, 50 kg, sedentary:
      // BMR 1007.75; TDEE 1209.3 (≥ 1200); target 1027.9 (< 1200)
      const result = assess(
        profile({
          sex: 'female',
          dateOfBirth: '1966-01-01',
          height: { centimeters: 155 },
          weight: { kilograms: 50 },
          activityLevel: 'sedentary',
        }),
      );
      expect(result.estimates.tdeeKcal).toBe(1209);
      expect(result.targets.calories).toEqual({
        calculatedKcal: 1028, // original preserved
        finalKcal: 1200,
        status: 'floor-applied',
        productSafetyThresholdKcal: 1200,
      });
      expect(result.safeguardsApplied).toEqual(['calorie-safety-threshold']);
      expect(grams(result.targets.macros)).toEqual([90, 40, 120]); // macros planned on the final target
    });

    describe('review-required: estimated maintenance is below the threshold', () => {
      // Female, 70 y, 150 cm, 45 kg, sedentary: BMR 876.5; TDEE 1051.8 (< 1200)
      const small = profile({
        sex: 'female',
        dateOfBirth: '1956-01-01',
        height: { centimeters: 150 },
        weight: { kilograms: 45 },
        activityLevel: 'sedentary',
      });

      it('for a deficit goal', () => {
        const result = assess(small);
        expect(result.targets.calories).toEqual({
          calculatedKcal: 894, // 1051.8 × 0.85, preserved
          finalKcal: 1200,
          status: 'review-required',
          productSafetyThresholdKcal: 1200,
        });
        expect(result.estimates.tdeeKcal).toBe(1052); // the estimate itself is not altered
        expect(result.safeguardsApplied).toEqual(['calorie-safety-threshold']);
      });

      it('for a maintenance goal', () => {
        const result = assess({ ...small, primaryGoal: 'recomposition' });
        expect(result.targets.calories).toMatchObject({ calculatedKcal: 1052, finalKcal: 1200, status: 'review-required' });
      });

      it('deterministically', () => {
        expect(assess(small)).toEqual(assess(structuredClone(small)));
      });
    });

    it('a target exactly at the threshold is normal', () => {
      // Sedentary maintenance target is exactly 1750 × 1.2 = 2100; set the threshold to that value.
      const config: FitnessCalculationConfig = {
        ...DEFAULTS,
        calorieTarget: { productSafetyThresholdKcal: { male: 2100, female: 1200, sexNeutral: 1500 } },
      };
      const result = assess(profile({ primaryGoal: 'recomposition', activityLevel: 'sedentary' }), { config });
      expect(result.targets.calories).toMatchObject({ calculatedKcal: 2100, finalKcal: 2100, status: 'normal' });
    });
  });

  describe('macro feasibility in the pipeline', () => {
    // Default configuration never produces these for valid profiles; an unusual
    // energy density is used purely to exercise the wiring.
    const withProteinKcal = (protein: number): FitnessCalculationConfig => ({
      ...DEFAULTS,
      kcalPerGram: { ...DEFAULTS.kcalPerGram, protein },
    });

    it('constrained: recorded as a safeguard, fat never below minimum', () => {
      const result = assess(PROFILE, { config: withProteinKcal(12) }); // 144 g × 12 = 1728 kcal
      expect(result.targets.macros).toMatchObject({ status: 'constrained', fatGrams: 64, carbohydrateGrams: 0 });
      expect(result.safeguardsApplied).toEqual(['fat-reduced-toward-minimum']);
    });

    it('infeasible: no gram targets, conflict explained', () => {
      const result = assess(PROFILE, { config: withProteinKcal(20) }); // 144 g × 20 = 2880 kcal > 2306
      expect(result.targets.macros).toEqual({
        status: 'infeasible',
        reason: 'protein-exceeds-calories',
        analysis: {
          calorieTargetKcal: 2306,
          requestedProteinGrams: 144,
          preferredFatGrams: 77,
          minimumFatGrams: 52,
          shortfallKcal: 1267, // 2880 + 693 − 2306
          shortfallAtMinimumFatKcal: 1042, // 2880 + 468 − 2306
        },
      });
      expect(result.safeguardsApplied).toEqual(['macros-infeasible']);
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
      const config = structuredClone(DEFAULTS);
      calculateFitnessAssessment(p, { asOfDate: AS_OF, config });
      expect(p).toEqual(PROFILE);
      expect(config).toEqual(DEFAULTS);
    });
  });

  describe('configuration changes', () => {
    const withConfig = (patch: Partial<FitnessCalculationConfig>, p = PROFILE) =>
      assess(p, { config: { ...DEFAULTS, ...patch } });

    it('activity multiplier changes TDEE proportionally', () => {
      const result = withConfig({ activityMultipliers: { ...DEFAULTS.activityMultipliers, 'moderately-active': 1.5 } });
      expect(result.estimates.tdeeKcal).toBe(2625); // 1750 × 1.5
    });

    it('fat-loss adjustment changes the target predictably', () => {
      const result = withConfig({ goalCalorieAdjustments: { ...DEFAULTS.goalCalorieAdjustments, 'lose-fat': -0.1 } });
      expect(result.targets.calories.finalKcal).toBe(2441); // 2712.5 × 0.9 = 2441.25
    });

    it('preferred fat share changes fat and, in turn, carbohydrates', () => {
      const result = withConfig({ fat: { ...DEFAULTS.fat, preferredShare: 0.25 } });
      expect(grams(result.targets.macros)).toEqual([144, 64, 289]); // fat 64.06 → 64; (2306 − 576 − 576)/4 = 288.5 → 289
    });

    it('protein threshold changes the protein method', () => {
      const heavy = profile({ weight: { kilograms: 105 } }); // BMI 32.4
      expect(assess(heavy).explanation.protein.type).toBe('adjusted-weight');
      const raised = withConfig({ protein: { ...DEFAULTS.protein, adjustedWeight: { thresholdBmi: 35, excessWeightFraction: 0.25 } } }, heavy);
      expect(raised.explanation.protein.type).toBe('body-weight');
    });

    it('product safety threshold changes when the guard applies', () => {
      const result = withConfig({
        calorieTarget: { productSafetyThresholdKcal: { male: 2400, female: 1200, sexNeutral: 1500 } },
      });
      expect(result.targets.calories).toMatchObject({ calculatedKcal: 2306, finalKcal: 2400, status: 'floor-applied' });
    });
  });

  describe('invalid configuration is rejected', () => {
    const variants: [string, FitnessCalculationConfig][] = [
      ['unknown version', { ...DEFAULTS, version: 'v0' as never }],
      ['activity multiplier < 1', { ...DEFAULTS, activityMultipliers: { ...DEFAULTS.activityMultipliers, sedentary: 0.5 } }],
      [
        'goal adjustment outside approved range',
        { ...DEFAULTS, goalCalorieAdjustments: { ...DEFAULTS.goalCalorieAdjustments, 'lose-fat': -0.4 } },
      ],
      [
        'protein default outside its range',
        {
          ...DEFAULTS,
          protein: {
            ...DEFAULTS.protein,
            gramsPerKg: { ...DEFAULTS.protein.gramsPerKg, 'lose-fat': { min: 1.6, max: 2.0, default: 2.5 } },
          },
        },
      ],
      ['protein threshold BMI too low', { ...DEFAULTS, protein: { ...DEFAULTS.protein, adjustedWeight: { thresholdBmi: 18, excessWeightFraction: 0.25 } } }],
      ['protein threshold BMI too high', { ...DEFAULTS, protein: { ...DEFAULTS.protein, adjustedWeight: { thresholdBmi: 60, excessWeightFraction: 0.25 } } }],
      ['protein threshold BMI NaN', { ...DEFAULTS, protein: { ...DEFAULTS.protein, adjustedWeight: { thresholdBmi: Number.NaN, excessWeightFraction: 0.25 } } }],
      ['negative excess-weight fraction', { ...DEFAULTS, protein: { ...DEFAULTS.protein, adjustedWeight: { thresholdBmi: 30, excessWeightFraction: -0.1 } } }],
      ['excess-weight fraction above 1', { ...DEFAULTS, protein: { ...DEFAULTS.protein, adjustedWeight: { thresholdBmi: 30, excessWeightFraction: 1.5 } } }],
      ['fat minimum above preferred', { ...DEFAULTS, fat: { minimumShare: 0.32, preferredShare: 0.3, maximumShare: 0.35 } }],
      ['fat maximum below preferred', { ...DEFAULTS, fat: { minimumShare: 0.2, preferredShare: 0.3, maximumShare: 0.25 } }],
      ['fat minimum below limit', { ...DEFAULTS, fat: { minimumShare: 0.05, preferredShare: 0.3, maximumShare: 0.35 } }],
      ['fat maximum above limit', { ...DEFAULTS, fat: { minimumShare: 0.2, preferredShare: 0.3, maximumShare: 0.6 } }],
      ['zero calorie threshold', { ...DEFAULTS, calorieTarget: { productSafetyThresholdKcal: { male: 0, female: 1200, sexNeutral: 1500 } } }],
      ['implausibly low calorie threshold', { ...DEFAULTS, calorieTarget: { productSafetyThresholdKcal: { male: 1500, female: 500, sexNeutral: 1500 } } }],
      ['implausibly high calorie threshold', { ...DEFAULTS, calorieTarget: { productSafetyThresholdKcal: { male: 1500, female: 1200, sexNeutral: 5000 } } }],
      ['NaN calorie threshold', { ...DEFAULTS, calorieTarget: { productSafetyThresholdKcal: { male: Number.NaN, female: 1200, sexNeutral: 1500 } } }],
    ];

    it.each(variants)('%s', (_, config) => {
      expect(validateCalculationConfig(config)).not.toEqual([]);
      expect(errorCode(calculateFitnessAssessment(PROFILE, { asOfDate: AS_OF, config }))).toBe('invalid-configuration');
    });

    it('accepts the default configuration', () => {
      expect(validateCalculationConfig(DEFAULTS)).toEqual([]);
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

describe('accepted Calorie Check-in calibration', () => {
  const calibrated = (maintenanceKcal: number) =>
    profile({ energyCalibration: { maintenanceKcal, observedFrom: '2026-01-01', observedTo: '2026-01-28', acceptedAt: '2026-01-29T09:00:00.000Z' } });

  it('replaces the formula maintenance for targets; BMR and the formula TDEE stay as estimated', () => {
    const formula = assess();
    const result = assess(calibrated(2400));
    expect(result.estimates).toEqual(formula.estimates);
    expect(result.explanation.maintenance).toEqual({ source: 'check-in', kcal: 2400, observedFrom: '2026-01-01', observedTo: '2026-01-28', acceptedAt: '2026-01-29T09:00:00.000Z' });
    expect(result.targets.calories.calculatedKcal).toBe(Math.round(2400 * (1 + DEFAULTS.goalCalorieAdjustments[PROFILE.primaryGoal])));
  });

  it('macros are recalculated from the new calorie target', () => {
    const result = assess(calibrated(2400));
    expect(result.targets.macros.analysis.calorieTargetKcal).toBe(result.targets.calories.finalKcal);
    expect(grams(result.targets.macros)).not.toEqual(grams(assess().targets.macros));
  });

  it('the product safety threshold still applies, and can still withhold the target', () => {
    expect(assess(calibrated(1300)).targets.calories).toMatchObject({ status: 'review-required' });
    const floored = assess(profile({ ...calibrated(1600), primaryGoal: 'lose-fat' })).targets.calories;
    expect(floored.finalKcal).toBeGreaterThanOrEqual(floored.productSafetyThresholdKcal);
  });

  it('a calibration outside the plausible range is ignored (formula used)', () => {
    const result = assess(profile({ energyCalibration: { maintenanceKcal: 900, observedFrom: '2026-01-01', observedTo: '2026-01-28', acceptedAt: '2026-01-29T09:00:00.000Z' } }));
    expect(result.explanation.maintenance).toEqual({ source: 'formula', kcal: result.estimates.tdeeKcal });
  });
});
