import { InjectionToken } from '@angular/core';

import { DEFAULT_WORKOUT_CONFIG, WorkoutProgrammingConfig } from '../../domain/workout-programming';

/**
 * Configuration handed to the (framework-free) workout engine. Injectable so
 * it can be swapped in tests or, later, by a remotely managed config.
 */
export const WORKOUT_PROGRAMMING_CONFIG = new InjectionToken<WorkoutProgrammingConfig>('WORKOUT_PROGRAMMING_CONFIG', {
  providedIn: 'root',
  factory: () => DEFAULT_WORKOUT_CONFIG,
});
