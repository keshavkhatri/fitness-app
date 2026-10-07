import { PRIMARY_GOALS } from '../fitness-profile';
import { DEFAULT_CALCULATION_CONFIG as CONFIG } from './calculation-config';
import { allocateMacros, calculateFatTarget, calculateProteinTarget } from './macros';

describe('macros', () => {
  describe('protein', () => {
    it.each([
      ['lose-fat', 1.8, 144],
      ['recomposition', 1.8, 144],
      ['build-muscle', 1.9, 152],
      ['get-stronger', 1.9, 152],
      ['improve-fitness', 1.6, 128],
    ] as const)('%s → %s g/kg', (goal, gramsPerKg, grams) => {
      expect(calculateProteinTarget({ goal, bodyWeightKg: 80 }, CONFIG)).toEqual({
        grams: expect.closeTo(grams, 10),
        method: 'body-weight',
        gramsPerKg,
        basisWeightKg: 80,
      });
    });

    it('defaults sit inside each goal’s approved range', () => {
      for (const goal of PRIMARY_GOALS) {
        const { min, max, default: value } = CONFIG.proteinGramsPerKg[goal];
        expect(value).toBeGreaterThanOrEqual(min);
        expect(value).toBeLessThanOrEqual(max);
      }
      expect(CONFIG.proteinGramsPerKg['build-muscle']).toMatchObject({ min: 1.6, max: 2.2 });
      expect(CONFIG.proteinGramsPerKg['improve-fitness']).toMatchObject({ min: 1.4, max: 1.8 });
    });
  });

  describe('fat', () => {
    it('is the configured share of calories ÷ 9 kcal/g', () => {
      // 2400 × 0.30 / 9
      expect(calculateFatTarget(2400, CONFIG)).toBeCloseTo(80, 10);
      expect(calculateFatTarget(2000, CONFIG)).toBeCloseTo(66.667, 3);
    });
  });

  describe('carbohydrates (remaining calories)', () => {
    it('allocates the remainder after protein and fat', () => {
      // 2400 − 160×4 − 80×9 = 1040 kcal → 260 g
      expect(allocateMacros(2400, 160, 80, CONFIG)).toEqual({
        proteinGrams: 160,
        fatGrams: 80,
        carbohydrateGrams: 260,
        constraint: null,
      });
    });

    it('handles a small positive remainder', () => {
      // 1500 − 250×4 − 54×9 = 14 kcal → 3.5 g → 4 g
      expect(allocateMacros(1500, 250, 54, CONFIG)).toMatchObject({ carbohydrateGrams: 4, constraint: null });
    });

    it('returns zero carbohydrates (not negative) when exactly nothing remains', () => {
      // 1340 − 200×4 − 60×9 = 0
      expect(allocateMacros(1340, 200, 60, CONFIG)).toMatchObject({ carbohydrateGrams: 0, constraint: null });
    });

    it('reduces fat (never negative carbohydrates) when protein + fat exceed the target', () => {
      // 1500 − 300×4 = 300 kcal left for fat → 33 g (not the requested 50 g)
      const split = allocateMacros(1500, 300, 50, CONFIG);
      expect(split).toEqual({
        proteinGrams: 300,
        fatGrams: 33,
        carbohydrateGrams: 0,
        constraint: { adjustment: 'fat-reduced', unconstrainedFatGrams: 50 },
      });
      expect(split.proteinGrams * 4 + split.fatGrams * 9).toBeLessThanOrEqual(1500);
    });

    it('caps protein when protein alone exceeds the target', () => {
      expect(allocateMacros(1200, 400, 40, CONFIG)).toEqual({
        proteinGrams: 300,
        fatGrams: 0,
        carbohydrateGrams: 0,
        constraint: { adjustment: 'protein-capped', unconstrainedProteinGrams: 400 },
      });
    });

    it('keeps macro calories within rounding of the target', () => {
      const split = allocateMacros(2306, 144, 76.87, CONFIG);
      const kcal = split.proteinGrams * 4 + split.fatGrams * 9 + split.carbohydrateGrams * 4;
      expect(Math.abs(kcal - 2306)).toBeLessThanOrEqual(2);
    });
  });
});
