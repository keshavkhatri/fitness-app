import { hasApplicableGoalTargets } from '../../../domain/fitness-profile';
import { OnboardingDraft } from './onboarding-draft';

export const ONBOARDING_STEP_IDS = [
  'welcome',
  'report',
  'basics',
  'height',
  'weight',
  'activity',
  'goal',
  'goal-target',
  'experience',
  'frequency',
  'location',
  'equipment',
  'summary',
  'account',
  'finish',
] as const;
export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

export const isOnboardingStepId = (value: unknown): value is OnboardingStepId =>
  (ONBOARDING_STEP_IDS as readonly unknown[]).includes(value);

/**
 * - intro/done: no progress indicator, no back navigation into them.
 * - question: counted in progress, validated before continuing.
 * - review: the summary; its primary action moves on to the account (first run) or saves (profile editor).
 * - account: the account gate. The profile is created only from here, once signed in, so personalised
 *   results and the plan are never shown without an account. Not counted in progress.
 */
export type OnboardingStepKind = 'intro' | 'question' | 'review' | 'account' | 'done';

export interface OnboardingStep {
  readonly id: OnboardingStepId;
  readonly kind: OnboardingStepKind;
  readonly primaryAction: string;
  /** Steps whose answers don't apply to this user are skipped. Defaults to always. */
  readonly isApplicable?: (draft: OnboardingDraft) => boolean;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { id: 'welcome', kind: 'intro', primaryAction: 'Get started' },
  {
    id: 'report',
    kind: 'question',
    primaryAction: 'Read my report',
    // Only for users who chose to upload a report; manual entry never sees it.
    isApplicable: (draft) => draft.setupMethod === 'report',
  },
  // Sex and date of birth (the name comes from the account, after the questionnaire).
  { id: 'basics', kind: 'question', primaryAction: 'Continue' },
  { id: 'height', kind: 'question', primaryAction: 'Continue' },
  { id: 'weight', kind: 'question', primaryAction: 'Continue' },
  { id: 'activity', kind: 'question', primaryAction: 'Continue' },
  { id: 'goal', kind: 'question', primaryAction: 'Continue' },
  {
    id: 'goal-target',
    kind: 'question',
    primaryAction: 'Continue',
    // Counted until a goal is chosen, so the progress total can only shrink, never grow.
    isApplicable: (draft) => draft.primaryGoal === null || hasApplicableGoalTargets(draft.primaryGoal),
  },
  { id: 'experience', kind: 'question', primaryAction: 'Continue' },
  { id: 'frequency', kind: 'question', primaryAction: 'Continue' },
  { id: 'location', kind: 'question', primaryAction: 'Continue' },
  { id: 'equipment', kind: 'question', primaryAction: 'Continue' },
  { id: 'summary', kind: 'review', primaryAction: 'Continue' },
  { id: 'account', kind: 'account', primaryAction: 'Create my profile' },
  { id: 'finish', kind: 'done', primaryAction: 'See my starting point' },
];

export function applicableSteps(draft: OnboardingDraft): readonly OnboardingStep[] {
  return ONBOARDING_STEPS.filter((step) => step.isApplicable?.(draft) ?? true);
}

export function stepById(id: OnboardingStepId): OnboardingStep {
  return ONBOARDING_STEPS.find((step) => step.id === id) ?? ONBOARDING_STEPS[0];
}
