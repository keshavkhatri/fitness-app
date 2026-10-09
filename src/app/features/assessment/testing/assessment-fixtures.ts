import { DEFAULT_CALCULATION_CONFIG, FitnessCalculationConfig } from '../../../domain/fitness-calculations';
import { UserFitnessProfile } from '../../../domain/fitness-profile';

/** Fixed "today" for deterministic ages: 7 October 2026. */
export const TODAY = new Date(2026, 9, 7, 12, 0, 0);
export const TODAY_ISO = '2026-10-07';

/** Male, 36, 180 cm, 80 kg, moderately active, fat loss to 74 kg → normal, feasible result. */
export const NORMAL_PROFILE: UserFitnessProfile = {
  primaryGoal: 'lose-fat',
  dateOfBirth: '1990-06-15',
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

export const profileWith = (overrides: Partial<UserFitnessProfile>): UserFitnessProfile => ({
  ...NORMAL_PROFILE,
  ...overrides,
});

/** Female, 60, 155 cm, 50 kg, sedentary, fat loss → calorie target floor-applied. */
export const FLOOR_APPLIED_PROFILE = profileWith({
  sex: 'female',
  dateOfBirth: '1966-01-01',
  height: { centimeters: 155 },
  weight: { kilograms: 50 },
  activityLevel: 'sedentary',
  goalTarget: { targetWeight: null },
});

/** Female, 70, 150 cm, 45 kg, sedentary, fat loss → estimated maintenance below threshold → review-required. */
export const REVIEW_REQUIRED_PROFILE = profileWith({
  sex: 'female',
  dateOfBirth: '1956-01-01',
  height: { centimeters: 150 },
  weight: { kilograms: 45 },
  activityLevel: 'sedentary',
  goalTarget: { targetWeight: null },
});

/**
 * The default configuration never yields constrained/infeasible macros for a
 * valid profile, so tests use an unusual protein energy density to exercise
 * those states end to end.
 */
export const configWithProteinKcal = (protein: number): FitnessCalculationConfig => ({
  ...DEFAULT_CALCULATION_CONFIG,
  kcalPerGram: { ...DEFAULT_CALCULATION_CONFIG.kcalPerGram, protein },
});
export const CONSTRAINED_MACROS_CONFIG = configWithProteinKcal(12);
export const INFEASIBLE_MACROS_CONFIG = configWithProteinKcal(20);
