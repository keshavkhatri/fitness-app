import { TrainingExperience } from '../fitness-profile';
import { Exercise } from './exercise.model';
import { SelectionContext, isPerformable } from './exercise-selection';
import { WorkoutProgrammingConfig } from './workout-config';
import {
  ChainPosition,
  ExerciseTarget,
  PrescriptionNote,
  ProgressionRule,
  ProgressionStrategy,
} from './workout-plan.model';
import { ObjectiveRole, PrescriptionProfile, ProgramStyle } from './workout-taxonomy';

/**
 * Prescription profile for an exercise in an objective role. Rules, in order:
 *   conditioning role → conditioning
 *   core role → core
 *   low loadability (bodyweight/band) → low-load (higher reps, shorter rest)
 *   isolation or accessory role → accessory
 *   unilateral compound → unilateral-compound (per side, moderate rest)
 *   primary role → primary-compound
 *   otherwise → secondary-compound
 */
export function prescriptionProfileFor(exercise: Exercise, role: ObjectiveRole): PrescriptionProfile {
  if (role === 'conditioning') {
    return 'conditioning';
  }
  if (role === 'core') {
    return 'core';
  }
  if (exercise.loadability === 'low') {
    return 'low-load';
  }
  if (exercise.mechanics === 'isolation' || role === 'accessory') {
    return 'accessory';
  }
  if (exercise.laterality === 'unilateral') {
    return 'unilateral-compound';
  }
  return role === 'primary' ? 'primary-compound' : 'secondary-compound';
}

export interface Prescription {
  readonly profile: PrescriptionProfile;
  readonly sets: number;
  readonly target: ExerciseTarget;
  readonly restSeconds: number;
  readonly notes: readonly PrescriptionNote[];
}

/** Default sets, rep range or work time, and rest from the exercise's profile. */
export function prescribe(
  exercise: Exercise,
  role: ObjectiveRole,
  style: ProgramStyle,
  experience: TrainingExperience,
  config: WorkoutProgrammingConfig,
): Prescription {
  const profile = prescriptionProfileFor(exercise, role);
  const p = config.prescriptions[style][profile];
  const notes: PrescriptionNote[] = [];
  if (exercise.laterality === 'unilateral') {
    notes.push('per-side');
  }
  if (exercise.measurement === 'time') {
    notes.push('time-based');
  }
  if (exercise.requires.length === 0) {
    notes.push('bodyweight');
  }
  return {
    profile,
    sets: p.sets[experience],
    target:
      exercise.measurement === 'time'
        ? { kind: 'time', seconds: p.timeSeconds }
        : { kind: 'reps', min: p.reps.min, max: p.reps.max },
    restSeconds: p.restSeconds,
    notes,
  };
}

/** Load increment for this user (beginners progress conservatively). */
export function loadIncreasePercentFor(
  style: ProgramStyle,
  experience: TrainingExperience,
  config: WorkoutProgrammingConfig,
): number {
  const base = config.progression.loadIncreasePercent[style];
  return experience === 'beginner' ? Math.min(base, config.progression.beginnerMaxLoadIncreasePercent) : base;
}

/**
 * Neighbouring chain steps the user can actually perform (location and
 * equipment). Harder steps may be above the user's current level: that is
 * where progression leads.
 */
export function chainPositionFor(exercise: Exercise, context: SelectionContext, catalog: ReadonlyMap<string, Exercise>): ChainPosition | null {
  const lookup = context.chains.get(exercise.id);
  if (!lookup) {
    return null;
  }
  const performable = (id: string) => {
    const step = catalog.get(id);
    return !!step && isPerformable(step, context.input);
  };
  const steps = lookup.chain.steps;
  const regression = [...steps.slice(0, lookup.index)].reverse().find(performable) ?? null;
  const progression = steps.slice(lookup.index + 1).find(performable) ?? null;
  return { chainId: lookup.chain.id, regression, progression };
}

/**
 * Progression rule by how the exercise can be progressed:
 * timed → add seconds (then next chain step); low loadability → add reps
 * then the next chain step; otherwise double progression (reps, then load).
 */
export function progressionFor(
  exercise: Exercise,
  target: ExerciseTarget,
  context: SelectionContext,
  catalog: ReadonlyMap<string, Exercise>,
): ProgressionRule {
  const { config, style, input } = context;
  if (target.kind === 'time') {
    return {
      type: 'time-progression',
      startSeconds: target.seconds,
      incrementSeconds: config.progression.timeIncrementSeconds,
      maxSeconds: Math.max(config.progression.maxTimeSeconds, target.seconds),
      chain: chainPositionFor(exercise, context, catalog),
    };
  }
  if (exercise.loadability === 'low') {
    return {
      type: 'rep-progression',
      lowerRepBound: target.min,
      upperRepBound: target.max,
      advanceWhen: 'all-sets-at-upper-bound',
      thenProgressBy: 'harder-variation',
      chain: chainPositionFor(exercise, context, catalog),
    };
  }
  return {
    type: 'double-progression',
    lowerRepBound: target.min,
    upperRepBound: target.max,
    loadIncreasePercent: loadIncreasePercentFor(style, input.experience, config),
    advanceWhen: 'all-sets-at-upper-bound',
  };
}

export function progressionStrategyFor(
  style: ProgramStyle,
  experience: TrainingExperience,
  config: WorkoutProgrammingConfig,
): ProgressionStrategy {
  return {
    loadedExercises: 'double-progression',
    bodyweightExercises: 'rep-progression',
    timedExercises: 'time-progression',
    loadIncreasePercent: loadIncreasePercentFor(style, experience, config),
    timeIncrementSeconds: config.progression.timeIncrementSeconds,
    maxTimeSeconds: config.progression.maxTimeSeconds,
    historyBased: false,
  };
}
