import { UserFitnessProfile, hasApplicableGoalTargets } from '../../domain/fitness-profile';
import { toGoal } from '../assessment/assessment-view-model';
import { GOAL_OPTIONS, labelFor } from '../onboarding/onboarding-content';

/**
 * Home's goal card: only what the saved profile says (the chosen goal and any
 * applicable target weight). There is no goal-progress tracking yet, so no
 * progress, timeline or "on track" claim is made.
 */
export type HomeGoalView =
  | {
      readonly kind: 'ready';
      /** The assessment's goal label, e.g. "Lose fat". */
      readonly title: string;
      /** The goal's own description from onboarding, e.g. "Reduce body fat while keeping your muscle". */
      readonly description: string;
      /**
       * "target": a saved target weight (the assessment's wording); "none": the goal
       * supports a target but none is set; null: targets don't apply to this goal.
       */
      readonly target:
        | { readonly kind: 'target'; readonly detail: string; readonly change: string }
        | { readonly kind: 'none' }
        | null;
    }
  | { readonly kind: 'no-profile' };

export function toHomeGoal(profile: UserFitnessProfile | null): HomeGoalView {
  if (!profile) {
    return { kind: 'no-profile' };
  }
  const goal = toGoal(profile);
  const option = GOAL_OPTIONS.find((o) => o.value === profile.primaryGoal);
  return {
    kind: 'ready',
    title: goal.label,
    description: option?.description ?? labelFor(GOAL_OPTIONS, profile.primaryGoal),
    target: goal.target
      ? // "Lose 7 kg" is measured from the weight saved in the profile, not a tracked current weight.
        { kind: 'target', detail: goal.target.detail, change: `${goal.target.summary} from your profile weight` }
      : hasApplicableGoalTargets(profile.primaryGoal)
        ? { kind: 'none' }
        : null,
  };
}
