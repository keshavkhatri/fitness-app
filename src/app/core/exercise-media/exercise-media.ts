import { InjectionToken, inject } from '@angular/core';

import { environment } from '../../../environments/environment';
import { demonstrationFrames, exerciseArtwork } from '../../domain/workout-programming';

/** Where demonstration photos are served from (src/environments); null hides demonstrations. A public URL. */
export const EXERCISE_MEDIA_BASE_URL = new InjectionToken<string | null>('EXERCISE_MEDIA_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.exerciseMediaBaseUrl,
});

/** Which bundled guide sheet an exercise has (the domain mapping by default; overridable in tests). */
export const EXERCISE_ARTWORK_LOOKUP = new InjectionToken<(exerciseId: string) => string | null>('EXERCISE_ARTWORK_LOOKUP', {
  providedIn: 'root',
  factory: () => exerciseArtwork,
});

export interface ExerciseDemonstration {
  /** Start and end position photos, played in turn; or the single instructional guide sheet. */
  readonly frames: readonly [string, string] | readonly [string];
  /** True for a bundled original guide sheet (a static image, nothing to play). */
  readonly artwork: boolean;
  readonly credit: string;
}

export const DEMONSTRATION_CREDIT = 'Photos: free-exercise-db (public domain)';
export const ARTWORK_CREDIT = 'Illustration: StokeForm';
const ARTWORK_DIR = 'assets/exercise-art/';

/** The demonstration for an exercise, or null when there is none (or media is off in this build). Call in an injection context. */
export function injectExerciseDemonstration(): (exerciseId: string) => ExerciseDemonstration | null {
  const base = inject(EXERCISE_MEDIA_BASE_URL);
  const artworkFor = inject(EXERCISE_ARTWORK_LOOKUP);
  return (exerciseId) => {
    // Bundled artwork is local, so it needs no media base URL and works offline.
    const art = artworkFor(exerciseId);
    if (art) {
      return { frames: [ARTWORK_DIR + art], artwork: true, credit: ARTWORK_CREDIT };
    }
    const frames = base === null ? null : demonstrationFrames(exerciseId);
    return frames ? { frames: [base + frames[0], base + frames[1]], artwork: false, credit: DEMONSTRATION_CREDIT } : null;
  };
}
