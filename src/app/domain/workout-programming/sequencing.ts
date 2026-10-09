import { Exercise } from './exercise.model';
import { ObjectiveRole, SequenceCategory } from './workout-taxonomy';

/**
 * Order category of an exercise in a session:
 *   primary objective compound → primary-compound
 *   secondary objective, bilateral compound → secondary-compound
 *   any other compound → other-compound
 *   elbow flexion/extension → arms
 *   other isolation/accessory → isolation
 *   core → core, conditioning → conditioning
 * The configured `sequencing.order` ranks the categories; within a category
 * the template's objective order decides. Never alphabetical.
 */
export function sequenceCategoryFor(exercise: Exercise, role: ObjectiveRole): SequenceCategory {
  if (role === 'conditioning') {
    return 'conditioning';
  }
  if (role === 'core') {
    return 'core';
  }
  if (exercise.pattern === 'elbow-flexion' || exercise.pattern === 'elbow-extension') {
    return 'arms';
  }
  if (exercise.mechanics === 'isolation') {
    return 'isolation';
  }
  if (role === 'primary') {
    return 'primary-compound';
  }
  if (role === 'secondary' && exercise.laterality === 'bilateral') {
    return 'secondary-compound';
  }
  return 'other-compound';
}
