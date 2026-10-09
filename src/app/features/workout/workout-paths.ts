/** Workout routes, importable without loading the pages themselves (e.g. from Home). */
export const WORKOUT_PATH = '/workout';
export const workoutSessionPath = (sessionId: string) => ['/workout', 'session', sessionId];
export const activeWorkoutPath = (sessionId: string) => ['/workout', 'session', sessionId, 'active'];
export const historyDetailPath = (workoutId: string) => ['/workout', 'history', workoutId];
