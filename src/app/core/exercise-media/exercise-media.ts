import { InjectionToken, inject } from '@angular/core';

import { environment } from '../../../environments/environment';
import { demonstrationFrames } from '../../domain/workout-programming';

/** Where demonstration photos are served from (src/environments); null hides demonstrations. A public URL. */
export const EXERCISE_MEDIA_BASE_URL = new InjectionToken<string | null>('EXERCISE_MEDIA_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.exerciseMediaBaseUrl,
});

export interface ExerciseDemonstration {
  /** Start and end position photos, played in turn. */
  readonly frames: readonly [string, string];
  readonly credit: string;
}

export const DEMONSTRATION_CREDIT = 'Photos: free-exercise-db (public domain)';

/** The demonstration for an exercise, or null when there is none (or media is off in this build). Call in an injection context. */
export function injectExerciseDemonstration(): (exerciseId: string) => ExerciseDemonstration | null {
  const base = inject(EXERCISE_MEDIA_BASE_URL);
  return (exerciseId) => {
    const frames = base === null ? null : demonstrationFrames(exerciseId);
    return frames ? { frames: [base + frames[0], base + frames[1]], credit: DEMONSTRATION_CREDIT } : null;
  };
}
