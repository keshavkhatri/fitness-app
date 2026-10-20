// Public API of the workout programming engine. Framework-free and
// deterministic; consumers should call `generateWorkoutPlan`.
export * from './workout-taxonomy';
export * from './exercise.model';
export * from './exercise-library';
export * from './exercise-demonstrations';
export * from './exercise-guidance';
export * from './workout-input.model';
export * from './session-templates';
export * from './workout-config';
export * from './workout-plan.model';
export * from './errors';
export * from './generate-workout-plan';
export * from './profile-adapter';
export * from './split-selection';
export { isExerciseAvailable, isPerformable, matchObjective, rankCandidates, scoreExercise, selectForObjective } from './exercise-selection';
export type { ChainLookup, SelectionContext, SelectionState } from './exercise-selection';
export { prescriptionProfileFor } from './prescription';
export { sequenceCategoryFor } from './sequencing';
export { volumeGroupsOf } from './weekly-volume';
