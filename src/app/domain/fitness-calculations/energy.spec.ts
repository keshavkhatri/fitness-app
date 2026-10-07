import { ACTIVITY_LEVELS } from '../fitness-profile';
import { DEFAULT_CALCULATION_CONFIG as CONFIG } from './calculation-config';
import { applyCalorieFloor, calorieFloorFor, estimateTdee, goalCalorieTarget, goalDirectionOf } from './energy';

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

    it('keeps defaults inside the approved ranges (10–20% deficit, 5–10% surplus)', () => {
      expect(CONFIG.goalCalorieAdjustments['lose-fat']).toBeGreaterThanOrEqual(-0.2);
      expect(CONFIG.goalCalorieAdjustments['lose-fat']).toBeLessThanOrEqual(-0.1);
      expect(CONFIG.goalCalorieAdjustments['build-muscle']).toBeGreaterThanOrEqual(0.05);
      expect(CONFIG.goalCalorieAdjustments['build-muscle']).toBeLessThanOrEqual(0.1);
    });
  });

  describe('calorie floor', () => {
    it('leaves targets above the floor unchanged', () => {
      expect(applyCalorieFloor(1650.4, 1500)).toEqual({ kcal: 1650.4, floorKcal: 1500, floorApplied: false });
    });

    it('does not count a target exactly at the floor as applied', () => {
      expect(applyCalorieFloor(1500, 1500)).toEqual({ kcal: 1500, floorKcal: 1500, floorApplied: false });
    });

    it('raises targets below the floor and reports it', () => {
      expect(applyCalorieFloor(1499.9, 1500)).toEqual({ kcal: 1500, floorKcal: 1500, floorApplied: true });
    });

    it('selects the floor by BMR sex basis, using the conservative floor when sex-neutral', () => {
      expect(calorieFloorFor('male', CONFIG)).toBe(1500);
      expect(calorieFloorFor('female', CONFIG)).toBe(1200);
      expect(calorieFloorFor('sex-neutral-midpoint', CONFIG)).toBe(1500);
    });
  });
});
