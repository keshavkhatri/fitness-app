/** Workout routes, importable without loading the pages themselves (e.g. from Home). */
export const WORKOUT_PATH = '/workout';
export const workoutSessionPath = (sessionId: string) => ['/workout', 'session', sessionId];
export const activeWorkoutPath = (sessionId: string) => ['/workout', 'session', sessionId, 'active'];
export const historyDetailPath = (workoutId: string) => ['/workout', 'history', workoutId];
/** Custom plan editor (full screen) and its exercise picker for one plan session. */
export const CUSTOM_PLAN_EDIT_PATH = '/workout/plan/edit';
export const customPlanPickerPath = (sessionId: string) => ['/workout', 'plan', 'edit', sessionId, 'add'];
/** Exercise library (browse and details; Free). */
export const EXERCISE_LIBRARY_PATH = '/workout/exercises';
