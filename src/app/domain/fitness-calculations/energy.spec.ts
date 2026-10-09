import { ACTIVITY_LEVELS } from '../fitness-profile';
import { DEFAULT_CALCULATION_CONFIG as CONFIG } from './calculation-config';
import {
  estimateTdee,
  goalCalorieTarget,
  goalDirectionOf,
  productSafetyThresholdFor,
  resolveCalorieTarget,
} from './energy';

describe('energy', () => {
  describe('TDEE = BMR × activity multiplier', () => {
    it.each([
      ['sedentary', 1.2, 2136],
      ['lightly-active', 1.375, 2447.5],
      ['moderately-active', 1.55, 2759],
      ['very-active', 1.725, 3070.5],
    ] as const)('%s uses %s', (level, multiplier, expected) => {
      expect(CONFIG.activityMultipliers[level]).toBe(multiplier);
      expect(estimateTdee(1780, level, CONFIG)).toBeCloseTo(expected, 10);
    });

    it('covers every activity level', () => {
      for (const level of ACTIVITY_LEVELS) {
        expect(estimateTdee(1000, level, CONFIG)).toBeCloseTo(1000 * CONFIG.activityMultipliers[level], 10);
      }
    });
  });

  describe('goal calorie target', () => {
    it.each([
      ['lose-fat', 0.85, 'deficit'],
      ['build-muscle', 1.075, 'surplus'],
      ['recomposition', 1, 'maintenance'],
      ['get-stronger', 1, 'maintenance'],
      ['improve-fitness', 1, 'maintenance'],
    ] as const)('%s → TDEE × %s (%s)', (goal, factor, direction) => {
      expect(goalCalorieTarget(2800, goal, CONFIG)).toBeCloseTo(2800 * factor, 10);
      expect(goalDirectionOf(CONFIG.goalCalorieAdjustments[goal])).toBe(direction);
    });
  });

  describe('product safety threshold', () => {
    it('is selected by BMR sex basis, using the conservative value when sex-neutral', () => {
      expect(productSafetyThresholdFor('male', CONFIG)).toBe(1500);
      expect(productSafetyThresholdFor('female', CONFIG)).toBe(1200);
      expect(productSafetyThresholdFor('sex-neutral-midpoint', CONFIG)).toBe(1500);
    });

    it('normal: target above the threshold is used unchanged', () => {
      expect(resolveCalorieTarget(1650.4, 1941.6, 1500)).toEqual({
        calculatedKcal: 1650.4,
        finalKcal: 1650.4,
        status: 'normal',
        thresholdKcal: 1500,
      });
    });

    it('normal: a target exactly at the threshold does not trigger it', () => {
      expect(resolveCalorieTarget(1500, 1764.7, 1500).status).toBe('normal');
    });

    it('floor-applied: deficit dips below the threshold, maintenance is above it', () => {
      expect(resolveCalorieTarget(1450, 1705.9, 1500)).toEqual({
        calculatedKcal: 1450, // preserved
        finalKcal: 1500,
        status: 'floor-applied',
        thresholdKcal: 1500,
      });
    });

    it('review-required: estimated maintenance itself is below the threshold', () => {
      expect(resolveCalorieTarget(1050, 1150, 1200)).toEqual({
        calculatedKcal: 1050, // preserved
        finalKcal: 1200,
        status: 'review-required',
        thresholdKcal: 1200,
      });
    });

    it('review-required also for maintenance goals below the threshold', () => {
      expect(resolveCalorieTarget(1150, 1150, 1200).status).toBe('review-required');
    });

    it('is deterministic', () => {
      expect(resolveCalorieTarget(1111.1, 1300, 1200)).toEqual(resolveCalorieTarget(1111.1, 1300, 1200));
    });
  });
});
