import { EMPTY_DRAFT, OnboardingDraft } from '../state/onboarding-draft';

/** A fully answered draft; override fields per test. */
export function completeDraft(overrides: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return {
    ...EMPTY_DRAFT,
    primaryGoal: 'lose-fat',
    basics: { dateOfBirth: '1991-06-15', sex: 'female', height: { centimeters: 168 }, weight: { kilograms: 80 } },
    trainingExperience: 'intermediate',
    trainingDaysPerWeek: 4,
    trainingLocation: 'gym',
    equipment: ['full-gym'],
    activityLevel: 'lightly-active',
    goalTarget: { targetWeight: { kilograms: 72 } },
    ...overrides,
  };
}
