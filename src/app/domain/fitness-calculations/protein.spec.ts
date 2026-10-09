import { PRIMARY_GOALS } from '../fitness-profile';
import { DEFAULT_CALCULATION_CONFIG as CONFIG, FitnessCalculationConfig } from './calculation-config';
import { calculateProteinTarget, proteinThresholdWeightKg, selectProteinMethod } from './protein';

// 180 cm → threshold weight at BMI 30 = 30 × 1.8² = 97.2 kg
const HEIGHT = 180;

describe('protein target', () => {
  describe('body-weight method (at or below the threshold)', () => {
    it.each([
      ['lose-fat', 1.8, 144],
      ['recomposition', 1.8, 144],
      ['build-muscle', 1.9, 152],
      ['get-stronger', 1.9, 152],
      ['improve-fitness', 1.6, 128],
    ] as const)('%s → %s g/kg × body weight', (goal, gramsPerKg, grams) => {
      const target = calculateProteinTarget({ goal, bodyWeightKg: 80, heightCm: HEIGHT }, CONFIG);
      expect(target.grams).toBeCloseTo(grams, 10);
      expect(target.method).toEqual({ type: 'body-weight', gramsPerKg, basisWeightKg: 80 });
    });

    it('defaults sit inside each goal’s approved range', () => {
      for (const goal of PRIMARY_GOALS) {
        const { min, max, default: value } = CONFIG.protein.gramsPerKg[goal];
        expect(value).toBeGreaterThanOrEqual(min);
        expect(value).toBeLessThanOrEqual(max);
      }
    });

    it('uses body weight exactly at the threshold', () => {
      expect(proteinThresholdWeightKg(HEIGHT, CONFIG)).toBeCloseTo(97.2, 10);
      expect(selectProteinMethod({ goal: 'lose-fat', bodyWeightKg: 97.2, heightCm: HEIGHT }, CONFIG)).toBe('body-weight');
    });
  });

  describe('adjusted-weight method (above the threshold)', () => {
    it('counts only a fraction of the weight above the threshold', () => {
      // reference = 97.2 + 0.25 × (150 − 97.2) = 110.4 kg → 1.8 × 110.4 = 198.72 g
      const target = calculateProteinTarget({ goal: 'lose-fat', bodyWeightKg: 150, heightCm: HEIGHT }, CONFIG);
      expect(target.grams).toBeCloseTo(198.72, 10);
      expect(target.method).toEqual({
        type: 'adjusted-weight',
        gramsPerKg: 1.8,
        actualWeightKg: 150,
        referenceWeightKg: 110.4,
        thresholdWeightKg: 97.2,
        thresholdBmi: 30,
        excessWeightFraction: 0.25,
      });
    });

    it('is much lower than multiplying total body weight', () => {
      const adjusted = calculateProteinTarget({ goal: 'build-muscle', bodyWeightKg: 180, heightCm: HEIGHT }, CONFIG);
      expect(adjusted.grams).toBeLessThan(1.9 * 180 * 0.7);
    });

    it('is continuous at the threshold (no jump when crossing it)', () => {
      const at = calculateProteinTarget({ goal: 'lose-fat', bodyWeightKg: 97.2, heightCm: HEIGHT }, CONFIG);
      const justAbove = calculateProteinTarget({ goal: 'lose-fat', bodyWeightKg: 97.3, heightCm: HEIGHT }, CONFIG);
      expect(justAbove.method.type).toBe('adjusted-weight');
      expect(Math.abs(justAbove.grams - at.grams)).toBeLessThan(0.1);
    });

    it('still increases (slowly) with weight', () => {
      const lighter = calculateProteinTarget({ goal: 'lose-fat', bodyWeightKg: 120, heightCm: HEIGHT }, CONFIG);
      const heavier = calculateProteinTarget({ goal: 'lose-fat', bodyWeightKg: 140, heightCm: HEIGHT }, CONFIG);
      expect(heavier.grams - lighter.grams).toBeCloseTo(1.8 * 0.25 * 20, 10);
    });

    it('depends on height: the same weight is body-weight for a taller person', () => {
      expect(selectProteinMethod({ goal: 'lose-fat', bodyWeightKg: 110, heightCm: 180 }, CONFIG)).toBe('adjusted-weight');
      expect(selectProteinMethod({ goal: 'lose-fat', bodyWeightKg: 110, heightCm: 200 }, CONFIG)).toBe('body-weight');
    });
  });

  it('is deterministic', () => {
    const input = { goal: 'get-stronger' as const, bodyWeightKg: 131.4, heightCm: 172.5 };
    expect(calculateProteinTarget(input, CONFIG)).toEqual(calculateProteinTarget(input, CONFIG));
  });

  describe('configuration', () => {
    const withAdjusted = (thresholdBmi: number, excessWeightFraction: number): FitnessCalculationConfig => ({
      ...CONFIG,
      protein: { ...CONFIG.protein, adjustedWeight: { thresholdBmi, excessWeightFraction } },
    });

    it('a higher threshold BMI moves people back to the body-weight method', () => {
      const input = { goal: 'lose-fat' as const, bodyWeightKg: 105, heightCm: HEIGHT }; // BMI 32.4
      expect(calculateProteinTarget(input, CONFIG).method.type).toBe('adjusted-weight');
      expect(calculateProteinTarget(input, withAdjusted(35, 0.25)).method.type).toBe('body-weight');
    });

    it('the excess fraction controls how much extra weight counts (0 = cap, 1 = full)', () => {
      const input = { goal: 'lose-fat' as const, bodyWeightKg: 150, heightCm: HEIGHT };
      expect(calculateProteinTarget(input, withAdjusted(30, 0)).grams).toBeCloseTo(1.8 * 97.2, 10);
      expect(calculateProteinTarget(input, withAdjusted(30, 1)).grams).toBeCloseTo(1.8 * 150, 10);
    });

    it('changing the goal default changes protein proportionally', () => {
      const config: FitnessCalculationConfig = {
        ...CONFIG,
        protein: {
          ...CONFIG.protein,
          gramsPerKg: { ...CONFIG.protein.gramsPerKg, 'lose-fat': { min: 1.6, max: 2.0, default: 2.0 } },
        },
      };
      expect(calculateProteinTarget({ goal: 'lose-fat', bodyWeightKg: 80, heightCm: HEIGHT }, config).grams).toBe(160);
    });
  });
});
