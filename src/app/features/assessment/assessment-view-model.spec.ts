import {
  DEFAULT_CALCULATION_CONFIG,
  FitnessAssessment,
  FitnessCalculationConfig,
  calculateFitnessAssessment,
} from '../../domain/fitness-calculations';
import { UserFitnessProfile } from '../../domain/fitness-profile';
import { toAssessmentViewModel } from './assessment-view-model';
import {
  CONSTRAINED_MACROS_CONFIG,
  FLOOR_APPLIED_PROFILE,
  INFEASIBLE_MACROS_CONFIG,
  NORMAL_PROFILE,
  REVIEW_REQUIRED_PROFILE,
  TODAY_ISO,
  profileWith,
} from './testing/assessment-fixtures';

function viewFor(profile: UserFitnessProfile, config: FitnessCalculationConfig = DEFAULT_CALCULATION_CONFIG) {
  const result = calculateFitnessAssessment(profile, { asOfDate: TODAY_ISO, config });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return toAssessmentViewModel(profile, result.value, config);
}

/** Every user-facing string in a view model, for "never leaks X" checks. */
const allText = (value: unknown): string => JSON.stringify(value);

describe('toAssessmentViewModel', () => {
  describe('normal result', () => {
    const view = viewFor(NORMAL_PROFILE);

    it('formats estimates and the starting target from the domain result', () => {
      expect(view.energy).toEqual({
        calorieTarget: { kind: 'target', kcal: '2,306', notice: null },
        bmr: '1,750 kcal',
        maintenance: '2,713 kcal',
        maintenanceCaption: 'Estimated daily energy needs at your activity level',
      });
    });

    it('with an accepted Calorie Check-in, shows the maintenance the target is built on and where it came from', () => {
      const calibrated = viewFor({
        ...NORMAL_PROFILE,
        energyCalibration: { maintenanceKcal: 2500, observedFrom: '2026-09-01', observedTo: '2026-09-28', acceptedAt: '2026-09-29T12:00:00.000Z' },
      });
      expect(calibrated.energy).toMatchObject({ bmr: '1,750 kcal', maintenance: '2,500 kcal' });
      expect(calibrated.energy.maintenanceCaption).toMatch(/^From your calorie check-in on Sep 29, 2026: /);
      expect(calibrated.energy.calorieTarget).toMatchObject({ kind: 'target', kcal: '2,125' });
    });

    it('shows gram targets with approximate calorie shares', () => {
      expect(view.macros).toEqual({
        kind: 'grams',
        notice: null,
        rows: [
          { key: 'protein', label: 'Protein', grams: '144 g', share: 'About 25% of calories' },
          { key: 'fat', label: 'Fat', grams: '77 g', share: 'About 30% of calories' },
          { key: 'carbohydrate', label: 'Carbohydrates', grams: '259 g', share: 'About 45% of calories' },
        ],
      });
    });

    it('does not require review and uses moderate confidence copy', () => {
      expect(view.requiresReview).toBe(false);
      expect(view.confidence).toEqual({
        label: 'Moderate',
        description: 'These are formula-based estimates using the information you provided.',
      });
    });

    it('explains in plain language, without implementation terms', () => {
      expect(view.why[0]).toContain('starting estimates');
      for (const term of ['Mifflin', 'multiplier', 'BMI', 'threshold', 'adjusted', 'TDEE', 'safeguard']) {
        expect(allText(view)).not.toContain(term);
      }
    });
  });

  describe('goal', () => {
    it('renders the goal and a target when one applies', () => {
      expect(viewFor(NORMAL_PROFILE).goal).toEqual({
        label: 'Lose fat',
        target: { summary: 'Lose 6 kg', detail: 'Target weight 74 kg' },
      });
    });

    it('uses the user’s unit system for the target', () => {
      expect(viewFor(profileWith({ unitSystem: 'imperial' })).goal.target).toEqual({
        summary: 'Lose 13.3 lb', // 176.4 lb − 163.1 lb
        detail: 'Target weight 163.1 lb',
      });
    });

    it('describes gaining weight for muscle gain', () => {
      const view = viewFor(profileWith({ primaryGoal: 'build-muscle', goalTarget: { targetWeight: { kilograms: 84 } } }));
      expect(view.goal).toEqual({ label: 'Build muscle', target: { summary: 'Gain 4 kg', detail: 'Target weight 84 kg' } });
    });

    it('hides the target when none was set', () => {
      expect(viewFor(profileWith({ goalTarget: { targetWeight: null } })).goal.target).toBeNull();
    });

    it('hides target information that does not apply to the goal', () => {
      const view = viewFor(profileWith({ primaryGoal: 'recomposition', goalTarget: { targetWeight: { kilograms: 74 } } }));
      expect(view.goal).toEqual({ label: 'Recompose', target: null });
    });
  });

  describe('confidence', () => {
    it('uses stronger uncertainty copy for low confidence and never says "high"', () => {
      const view = viewFor(profileWith({ sex: 'prefer-not-to-say' }));
      expect(view.confidence.label).toBe('Low');
      expect(view.confidence.description).toContain('less precise');
      expect(allText(view)).not.toMatch(/high/i);
    });
  });

  describe('calorie target states', () => {
    it('floor-applied: keeps the target with an explanatory notice', () => {
      const view = viewFor(FLOOR_APPLIED_PROFILE);
      expect(view.energy.calorieTarget).toEqual({
        kind: 'target',
        kcal: '1,200',
        notice: expect.objectContaining({ tone: 'info', title: 'A steadier starting target' }),
      });
      expect(view.requiresReview).toBe(false);
    });

    it('review-required: withholds the target, puts macros on hold, requires review', () => {
      const view = viewFor(REVIEW_REQUIRED_PROFILE);
      expect(view.energy.calorieTarget).toEqual({
        kind: 'review',
        notice: expect.objectContaining({ tone: 'warning', title: 'Your numbers need a second look' }),
      });
      expect(view.macros.kind).toBe('unavailable');
      expect(view.requiresReview).toBe(true);
      // Estimates remain visible as estimates.
      expect(view.energy.maintenance).toBe('1,052 kcal');
    });

    it('never shows the internal product safety threshold in review copy', () => {
      const view = viewFor(REVIEW_REQUIRED_PROFILE);
      const reviewText = allText(view.energy.calorieTarget) + allText(view.macros);
      expect(reviewText).not.toContain('1,200');
      expect(reviewText).not.toContain('1200');
    });
  });

  describe('macro states', () => {
    it('constrained: shows grams with an attention notice', () => {
      const view = viewFor(NORMAL_PROFILE, CONSTRAINED_MACROS_CONFIG);
      expect(view.macros).toMatchObject({
        kind: 'grams',
        notice: { tone: 'warning', title: 'Macro balance needs review' },
      });
      expect(view.requiresReview).toBe(false);
    });

    it('infeasible: no gram targets at all, review required', () => {
      const view = viewFor(NORMAL_PROFILE, INFEASIBLE_MACROS_CONFIG);
      expect(view.macros).toEqual({
        kind: 'unavailable',
        notice: expect.objectContaining({ tone: 'warning', title: "We couldn't create a balanced macro target" }),
      });
      expect(allText(view.macros)).not.toMatch(/\d+ g/);
      expect(view.requiresReview).toBe(true);
    });
  });

  it('maps a future "high" confidence level to moderate copy rather than claiming high confidence', () => {
    const result = calculateFitnessAssessment(NORMAL_PROFILE, { asOfDate: TODAY_ISO });
    if (!result.ok) {
      throw new Error();
    }
    const high: FitnessAssessment = {
      ...result.value,
      estimates: { ...result.value.estimates, confidence: { level: 'high', reasons: [] } },
    };
    expect(toAssessmentViewModel(NORMAL_PROFILE, high, DEFAULT_CALCULATION_CONFIG).confidence.label).toBe('Moderate');
  });
});
