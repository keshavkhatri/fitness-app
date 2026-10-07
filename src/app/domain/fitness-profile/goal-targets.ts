import { BodyWeight, EMPTY_GOAL_TARGET, GoalTarget, PrimaryGoal } from './fitness-profile.model';

/**
 * Which goal-target fields apply to each primary goal.
 *
 * Adding a new target kind (e.g. body-fat %, a strength lift target) means:
 * a nullable field on `GoalTarget`, a policy entry here, and a field renderer
 * in the onboarding goal-target step. Goals with no applicable fields skip
 * the target step entirely.
 */
export type TargetFieldPolicy = 'optional' | 'not-applicable';
export type TargetWeightDirection = 'below-current' | 'above-current';

export interface GoalTargetPolicy {
  readonly targetWeight: TargetFieldPolicy;
  /** Sanity check against current weight when a target weight is given. */
  readonly targetWeightDirection?: TargetWeightDirection;
}

export const GOAL_TARGET_POLICIES: Readonly<Record<PrimaryGoal, GoalTargetPolicy>> = {
  'lose-fat': { targetWeight: 'optional', targetWeightDirection: 'below-current' },
  'build-muscle': { targetWeight: 'optional', targetWeightDirection: 'above-current' },
  recomposition: { targetWeight: 'not-applicable' },
  'get-stronger': { targetWeight: 'not-applicable' },
  'improve-fitness': { targetWeight: 'not-applicable' },
};

export function hasApplicableGoalTargets(goal: PrimaryGoal | null): boolean {
  if (!goal) {
    return false;
  }
  const policy = GOAL_TARGET_POLICIES[goal];
  return policy.targetWeight !== 'not-applicable';
}

/** Removes target values that don't apply to the goal (e.g. after changing goal). */
export function normalizeGoalTarget(goal: PrimaryGoal | null, target: GoalTarget): GoalTarget {
  if (!goal || GOAL_TARGET_POLICIES[goal].targetWeight === 'not-applicable') {
    return EMPTY_GOAL_TARGET;
  }
  return target;
}

/** True when a target weight points the right way for the goal (or no check applies). */
export function isTargetWeightDirectionValid(
  goal: PrimaryGoal,
  target: BodyWeight,
  current: BodyWeight,
): boolean {
  switch (GOAL_TARGET_POLICIES[goal].targetWeightDirection) {
    case 'below-current':
      return target.kilograms < current.kilograms;
    case 'above-current':
      return target.kilograms > current.kilograms;
    default:
      return true;
  }
}
