import { TrainingExperience } from '../fitness-profile';
import { MovementClass, MovementPattern, ObjectiveRole, ProgramStyle, SessionType } from './workout-taxonomy';

/**
 * When an objective is mandatory:
 * - 'always' / 'optional';
 * - or conditional: required for the listed styles and/or from a minimum
 *   experience level (both must match when both are given), optional otherwise.
 */
export type ObjectiveRequirement =
  | 'always'
  | 'optional'
  | { readonly styles?: readonly ProgramStyle[]; readonly minExperience?: TrainingExperience };

/**
 * A training objective: something the session must (or may) train, and which
 * exercises can satisfy it. Required objectives are always filled first and
 * can never be displaced by a higher-scoring exercise for another objective.
 */
export interface TrainingObjective {
  readonly id: string;
  readonly role: ObjectiveRole;
  /** Patterns that satisfy the objective; first = preferred, later = acceptable substitutes. */
  readonly patterns: readonly MovementPattern[];
  /**
   * Exercise classes accepted IN ADDITION to full instances of the pattern,
   * e.g. ['scapular'] lets a pull objective fall back to scapular work when
   * no true pull exists. Such a fill is reported as a substitution.
   */
  readonly substituteClasses?: readonly MovementClass[];
  readonly requirement: ObjectiveRequirement;
  /** Optional objectives fill the remaining budget in priority order (adjusted for weekly volume needs). */
  readonly priority: number;
  /**
   * foundational: repeating the same exercise across the week is intended
   * (skill practice, consistent progression);
   * vary: prefer an exercise not already used this week, when a comparable one exists.
   */
  readonly repetition: 'foundational' | 'vary';
}

export interface SessionTemplate {
  readonly id: string;
  readonly sessionType: SessionType;
  /** In template (training-intent) order; final order is decided by sequencing rules. */
  readonly objectives: readonly TrainingObjective[];
}

const HYPERTROPHY_INTERMEDIATE_PLUS: ObjectiveRequirement = { styles: ['hypertrophy'], minExperience: 'intermediate' };

const objective = (
  id: string,
  role: ObjectiveRole,
  patterns: readonly MovementPattern[],
  requirement: ObjectiveRequirement,
  priority: number,
  repetition: TrainingObjective['repetition'],
  substituteClasses?: readonly MovementClass[],
): TrainingObjective => ({ id, role, patterns, requirement, priority, repetition, ...(substituteClasses ? { substituteClasses } : {}) });

const lowerA = (id: string, sessionType: SessionType): SessionTemplate => ({
  id,
  sessionType,
  objectives: [
    objective('knee-dominant', 'primary', ['squat', 'lunge'], 'always', 100, 'foundational'),
    // Lighter hinge than lower B's main hinge; prefer a different exercise.
    objective('hip-dominant', 'secondary', ['hinge'], 'always', 95, 'vary'),
    objective('unilateral', 'secondary', ['lunge'], 'always', 85, 'vary'),
    objective('knee-flexion', 'accessory', ['knee-flexion'], HYPERTROPHY_INTERMEDIATE_PLUS, 60, 'vary'),
    objective('knee-extension', 'accessory', ['knee-extension'], 'optional', 50, 'vary'),
    objective('calves', 'accessory', ['calf-raise'], 'optional', 45, 'vary'),
    objective('core', 'core', ['anti-extension', 'anti-rotation'], 'optional', 55, 'vary'),
  ],
});

const lowerB = (id: string, sessionType: SessionType): SessionTemplate => ({
  id,
  sessionType,
  objectives: [
    objective('hip-dominant', 'primary', ['hinge'], 'always', 100, 'foundational'),
    // Lighter knee-dominant work than lower A's main squat; prefer a different exercise.
    objective('knee-dominant', 'secondary', ['squat', 'lunge'], 'always', 95, 'vary'),
    objective('unilateral', 'secondary', ['lunge'], 'always', 85, 'vary'),
    objective('knee-flexion', 'accessory', ['knee-flexion'], HYPERTROPHY_INTERMEDIATE_PLUS, 60, 'vary'),
    objective('calves', 'accessory', ['calf-raise'], 'optional', 50, 'vary'),
    objective('knee-extension', 'accessory', ['knee-extension'], 'optional', 45, 'vary'),
    objective('core', 'core', ['core-flexion', 'anti-rotation', 'anti-extension'], 'optional', 55, 'vary'),
  ],
});

/**
 * v2 session templates. Repeated session types rotate through their templates
 * (full body A/B/C, lower A/B, legs A/B).
 */
export const SESSION_TEMPLATES: readonly SessionTemplate[] = [
  {
    id: 'full-body-a',
    sessionType: 'full-body',
    objectives: [
      objective('knee-dominant', 'primary', ['squat', 'lunge'], 'always', 100, 'foundational'),
      objective('horizontal-push', 'primary', ['horizontal-push', 'vertical-push'], 'always', 95, 'foundational'),
      objective('horizontal-pull', 'secondary', ['horizontal-pull', 'vertical-pull'], 'always', 90, 'foundational', ['scapular']),
      objective('hip-dominant', 'secondary', ['hinge'], 'always', 85, 'vary'),
      objective('shoulders', 'accessory', ['shoulder-abduction', 'vertical-push'], 'optional', 50, 'vary'),
      objective('biceps', 'accessory', ['elbow-flexion'], 'optional', 40, 'vary'),
      objective('core', 'core', ['anti-extension', 'anti-rotation'], 'optional', 60, 'vary'),
    ],
  },
  {
    id: 'full-body-b',
    sessionType: 'full-body',
    objectives: [
      objective('hip-dominant', 'primary', ['hinge'], 'always', 100, 'foundational'),
      objective('vertical-pull', 'primary', ['vertical-pull', 'horizontal-pull'], 'always', 95, 'foundational', ['scapular']),
      objective('vertical-push', 'secondary', ['vertical-push', 'horizontal-push'], 'always', 90, 'vary'),
      objective('unilateral', 'secondary', ['lunge', 'squat'], 'always', 85, 'foundational'),
      objective('hamstrings', 'accessory', ['knee-flexion'], 'optional', 50, 'vary'),
      objective('triceps', 'accessory', ['elbow-extension'], 'optional', 45, 'vary'),
      objective('core', 'core', ['core-flexion', 'anti-rotation', 'anti-extension'], 'optional', 60, 'vary'),
    ],
  },
  {
    id: 'full-body-c',
    sessionType: 'full-body',
    objectives: [
      objective('knee-dominant', 'primary', ['squat', 'lunge'], 'always', 100, 'foundational'),
      objective('horizontal-pull', 'primary', ['horizontal-pull', 'vertical-pull'], 'always', 95, 'foundational', ['scapular']),
      objective('horizontal-push', 'secondary', ['horizontal-push', 'vertical-push'], 'always', 90, 'vary'),
      objective('hip-extension', 'secondary', ['hinge'], 'always', 85, 'vary'),
      objective('delts', 'accessory', ['shoulder-horizontal-abduction', 'shoulder-abduction'], 'optional', 50, 'vary', ['scapular']),
      objective('arms', 'accessory', ['elbow-extension', 'elbow-flexion'], 'optional', 45, 'vary'),
      objective('core', 'core', ['carry', 'anti-rotation', 'anti-extension'], 'optional', 60, 'vary'),
    ],
  },
  {
    id: 'upper',
    sessionType: 'upper',
    objectives: [
      objective('horizontal-push', 'primary', ['horizontal-push'], 'always', 100, 'foundational'),
      objective('horizontal-pull', 'primary', ['horizontal-pull', 'vertical-pull'], 'always', 95, 'foundational'),
      objective('vertical-push', 'secondary', ['vertical-push', 'horizontal-push'], 'always', 90, 'foundational'),
      objective('vertical-pull', 'secondary', ['vertical-pull', 'horizontal-pull'], 'always', 85, 'foundational'),
      objective('shoulder-isolation', 'accessory', ['shoulder-abduction'], HYPERTROPHY_INTERMEDIATE_PLUS, 60, 'vary'),
      objective('elbow-flexion', 'accessory', ['elbow-flexion'], HYPERTROPHY_INTERMEDIATE_PLUS, 55, 'vary'),
      objective('elbow-extension', 'accessory', ['elbow-extension'], HYPERTROPHY_INTERMEDIATE_PLUS, 55, 'vary'),
      objective('rear-delts', 'accessory', ['shoulder-horizontal-abduction'], 'optional', 30, 'vary'),
    ],
  },
  lowerA('lower-a', 'lower'),
  lowerB('lower-b', 'lower'),
  {
    id: 'push',
    sessionType: 'push',
    objectives: [
      objective('horizontal-push', 'primary', ['horizontal-push'], 'always', 100, 'foundational'),
      objective('vertical-push', 'secondary', ['vertical-push'], 'always', 95, 'foundational'),
      objective('second-press', 'secondary', ['horizontal-push', 'vertical-push'], 'always', 85, 'vary'),
      objective('shoulder-isolation', 'accessory', ['shoulder-abduction'], HYPERTROPHY_INTERMEDIATE_PLUS, 60, 'vary'),
      objective('elbow-extension', 'accessory', ['elbow-extension'], HYPERTROPHY_INTERMEDIATE_PLUS, 55, 'vary'),
      objective('core', 'core', ['core-flexion', 'anti-extension'], 'optional', 40, 'vary'),
      objective('elbow-extension-2', 'accessory', ['elbow-extension'], 'optional', 30, 'vary'),
    ],
  },
  {
    id: 'pull',
    sessionType: 'pull',
    objectives: [
      objective('vertical-pull', 'primary', ['vertical-pull', 'horizontal-pull'], 'always', 100, 'foundational'),
      objective('horizontal-pull', 'secondary', ['horizontal-pull'], 'always', 95, 'foundational'),
      objective('second-pull', 'secondary', ['horizontal-pull', 'vertical-pull'], 'always', 85, 'vary'),
      objective('rear-delts', 'accessory', ['shoulder-horizontal-abduction'], HYPERTROPHY_INTERMEDIATE_PLUS, 60, 'vary'),
      objective('elbow-flexion', 'accessory', ['elbow-flexion'], HYPERTROPHY_INTERMEDIATE_PLUS, 55, 'vary'),
      objective('core', 'core', ['anti-rotation', 'carry'], 'optional', 40, 'vary'),
      objective('elbow-flexion-2', 'accessory', ['elbow-flexion'], 'optional', 30, 'vary'),
    ],
  },
  lowerA('legs-a', 'legs'),
  lowerB('legs-b', 'legs'),
];

/** Optional conditioning finisher appended for goals that include conditioning. */
export const CONDITIONING_FINISHER: TrainingObjective = objective(
  'conditioning',
  'conditioning',
  ['conditioning'],
  'optional',
  65,
  'foundational',
);

const EXPERIENCE_ORDER: readonly TrainingExperience[] = ['beginner', 'intermediate', 'advanced'];

/** Whether an objective is required for this style and experience. */
export function isObjectiveRequired(
  objective: TrainingObjective,
  style: ProgramStyle,
  experience: TrainingExperience,
): boolean {
  const rule = objective.requirement;
  if (rule === 'always' || rule === 'optional') {
    return rule === 'always';
  }
  const styleOk = !rule.styles || rule.styles.includes(style);
  const experienceOk =
    !rule.minExperience || EXPERIENCE_ORDER.indexOf(experience) >= EXPERIENCE_ORDER.indexOf(rule.minExperience);
  return styleOk && experienceOk;
}
