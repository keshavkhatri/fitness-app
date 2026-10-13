import { hasApplicableGoalTargets } from '../../../domain/fitness-profile';
import { OnboardingDraft } from './onboarding-draft';

export const ONBOARDING_STEP_IDS = [
  'welcome',
  'name',
  'goal',
  'report',
  'basics',
  'experience',
  'frequency',
  'location',
  'equipment',
  'activity',
  'goal-target',
  'summary',
  'finish',
] as const;
export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

export const isOnboardingStepId = (value: unknown): value is OnboardingStepId =>
  (ONBOARDING_STEP_IDS as readonly unknown[]).includes(value);

/**
 * - intro/done: no progress indicator, no back navigation into them.
 * - question: counted in progress, validated before continuing.
 * - review: the summary; its primary action creates the profile.
 */
export type OnboardingStepKind = 'intro' | 'question' | 'review' | 'done';

export interface OnboardingStep {
  readonly id: OnboardingStepId;
  readonly kind: OnboardingStepKind;
  readonly primaryAction: string;
  /** Steps whose answers don't apply to this user are skipped. Defaults to always. */
  readonly isApplicable?: (draft: OnboardingDraft) => boolean;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { id: 'welcome', kind: 'intro', primaryAction: 'Get Started' },
  // Home greets the user by this name (saved with the profile, not part of it).
  { id: 'name', kind: 'question', primaryAction: 'Continue' },
  { id: 'goal', kind: 'question', primaryAction: 'Continue' },
  {
    id: 'report',
    kind: 'question',
    primaryAction: 'Read my report',
    // Only for users who chose to upload a report; manual entry never sees it.
    isApplicable: (draft) => draft.setupMethod === 'report',
  },
  { id: 'basics', kind: 'question', primaryAction: 'Continue' },
  { id: 'experience', kind: 'question', primaryAction: 'Continue' },
  { id: 'frequency', kind: 'question', primaryAction: 'Continue' },
  { id: 'location', kind: 'question', primaryAction: 'Continue' },
  { id: 'equipment', kind: 'question', primaryAction: 'Continue' },
  { id: 'activity', kind: 'question', primaryAction: 'Continue' },
  {
    id: 'goal-target',
    kind: 'question',
    primaryAction: 'Continue',
    // Counted until a goal is chosen, so the progress total can only shrink, never grow.
    isApplicable: (draft) => draft.primaryGoal === null || hasApplicableGoalTargets(draft.primaryGoal),
  },
  { id: 'summary', kind: 'review', primaryAction: 'Create My Profile' },
  { id: 'finish', kind: 'done', primaryAction: 'See my starting point' },
];

export function applicableSteps(draft: OnboardingDraft): readonly OnboardingStep[] {
  return ONBOARDING_STEPS.filter((step) => step.isApplicable?.(draft) ?? true);
}

export function stepById(id: OnboardingStepId): OnboardingStep {
  return ONBOARDING_STEPS.find((step) => step.id === id) ?? ONBOARDING_STEPS[0];
}
