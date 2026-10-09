import { DEFAULT_CALCULATION_CONFIG as CONFIG, FitnessCalculationConfig } from './calculation-config';
import { MacroTargets } from './fitness-assessment.model';
import { calculateFatTargets, planMacros } from './macros';

const gramsOf = (macros: MacroTargets) =>
  macros.status === 'infeasible' ? [] : [macros.proteinGrams, macros.fatGrams, macros.carbohydrateGrams];

const kcalOf = (macros: MacroTargets) =>
  macros.status === 'infeasible' ? 0 : macros.proteinGrams * 4 + macros.fatGrams * 9 + macros.carbohydrateGrams * 4;

describe('macros', () => {
  describe('fat targets', () => {
    it('preferred share (rounded) and minimum share (rounded up)', () => {
      // 2400 × 0.30 / 9 = 80; 2400 × 0.20 / 9 = 53.3 → 54
      expect(calculateFatTargets(2400, CONFIG)).toEqual({ preferredGrams: 80, minimumGrams: 54 });
    });

    it('follows configured shares', () => {
      const config: FitnessCalculationConfig = {
        ...CONFIG,
        fat: { preferredShare: 0.25, minimumShare: 0.15, maximumShare: 0.35 },
      };
      // 1800 × 0.25 / 9 = 50; 1800 × 0.15 / 9 = 30
      expect(calculateFatTargets(1800, config)).toEqual({ preferredGrams: 50, minimumGrams: 30 });
    });
  });

  describe('planMacros', () => {
    it('feasible: protein, preferred fat, carbohydrates from the remainder', () => {
      // 2400 − 160×4 − 80×9 = 1040 kcal → 260 g carbohydrates
      expect(planMacros(2400, 160, CONFIG)).toEqual({
        status: 'feasible',
        proteinGrams: 160,
        fatGrams: 80,
        carbohydrateGrams: 260,
        analysis: {
          calorieTargetKcal: 2400,
          requestedProteinGrams: 160,
          preferredFatGrams: 80,
          minimumFatGrams: 54,
          shortfallKcal: 0,
          shortfallAtMinimumFatKcal: 0,
        },
      });
    });

    it('feasible with only a small remainder for carbohydrates', () => {
      // 1500 − 250×4 − 50×9 = 50 kcal → 12.5 → 13 g
      const macros = planMacros(1500, 250, CONFIG);
      expect(macros.status).toBe('feasible');
      expect(gramsOf(macros)).toEqual([250, 50, 13]);
    });

    it('constrained: fat lowered toward (not below) its minimum, recorded with the shortfall', () => {
      // 1500: preferred fat 50 g (450 kcal), minimum 34 g (306 kcal).
      // Protein 270 g = 1080 kcal → 420 kcal left: preferred doesn't fit, minimum does.
      const macros = planMacros(1500, 270, CONFIG);
      expect(macros).toEqual({
        status: 'constrained',
        constraint: 'fat-reduced-toward-minimum',
        proteinGrams: 270,
        fatGrams: 46, // floor(420 / 9)
        carbohydrateGrams: 1, // floor((420 − 414) / 4)
        analysis: {
          calorieTargetKcal: 1500,
          requestedProteinGrams: 270,
          preferredFatGrams: 50,
          minimumFatGrams: 34,
          shortfallKcal: 30, // 1080 + 450 − 1500
          shortfallAtMinimumFatKcal: 0,
        },
      });
      expect(macros.status !== 'infeasible' && macros.fatGrams).toBeGreaterThanOrEqual(34);
    });

    it('infeasible: protein + minimum fat exceed the target (fat is NOT cut below minimum)', () => {
      // Protein 300 g = 1200 kcal; minimum fat 34 g = 306 kcal → 1506 > 1500
      const macros = planMacros(1500, 300, CONFIG);
      expect(macros).toEqual({
        status: 'infeasible',
        reason: 'protein-and-minimum-fat-exceed-calories',
        analysis: {
          calorieTargetKcal: 1500,
          requestedProteinGrams: 300,
          preferredFatGrams: 50,
          minimumFatGrams: 34,
          shortfallKcal: 150,
          shortfallAtMinimumFatKcal: 6,
        },
      });
    });

    it('infeasible: protein alone exceeds the target (protein is NOT silently capped)', () => {
      const macros = planMacros(1200, 400.4, CONFIG);
      expect(macros.status).toBe('infeasible');
      expect(macros.status === 'infeasible' && macros.reason).toBe('protein-exceeds-calories');
      expect(macros.analysis).toMatchObject({ requestedProteinGrams: 400, shortfallAtMinimumFatKcal: 643 }); // 1600 + 27×9 − 1200
      expect(gramsOf(macros)).toEqual([]); // no gram targets to misuse
    });

    it('boundary: protein + minimum fat exactly filling the target is constrained, not infeasible', () => {
      // 1800 kcal: minimum fat = 40 g (360 kcal); 360 g protein = 1440 kcal → exactly 1800
      expect(planMacros(1800, 360, CONFIG)).toMatchObject({
        status: 'constrained',
        proteinGrams: 360,
        fatGrams: 40,
        carbohydrateGrams: 0,
        analysis: { shortfallAtMinimumFatKcal: 0 },
      });
      // One more gram of protein no longer fits.
      expect(planMacros(1800, 361, CONFIG).status).toBe('infeasible');
    });

    it('never returns negative macros, for a sweep of inputs', () => {
      for (let kcal = 1000; kcal <= 4000; kcal += 250) {
        for (let protein = 0; protein <= 600; protein += 25) {
          const macros = planMacros(kcal, protein, CONFIG);
          for (const grams of gramsOf(macros)) {
            expect(grams).toBeGreaterThanOrEqual(0);
          }
          if (macros.status !== 'infeasible') {
            expect(kcalOf(macros)).toBeLessThanOrEqual(kcal + 2); // within carbohydrate rounding
            expect(macros.fatGrams).toBeGreaterThanOrEqual(macros.analysis.minimumFatGrams);
          }
        }
      }
    });
  });
});
