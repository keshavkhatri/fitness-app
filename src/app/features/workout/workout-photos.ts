import { PlanSession } from '../../domain/workout-programming';

/**
 * Bundled workout photography (AI-generated, see scripts/generate-workout-photos.mjs), served from
 * src/assets/images/workouts/ and so available offline. Sessions get a hero by session type; exercises a photo when
 * one has been generated. Anything without a photo keeps the drawn stand-in (`app-workout-art`).
 */
const DIR = 'assets/images/workouts/';

const SESSION_TYPES_WITH_PHOTOS: ReadonlySet<string> = new Set([
  'full-body',
  'upper',
  'lower',
  'push',
  'pull',
  'legs',
  'light-activity',
  'optional-conditioning',
]);

/** Exercises with a photo at exercises/<id>.webp. */
export const EXERCISE_PHOTO_IDS: ReadonlySet<string> = new Set([
  'ab-wheel-rollout',
  'archer-push-up',
  'assisted-pull-up',
  'back-extension',
  'back-squat',
  'band-assisted-pull-up',
  'band-chest-press',
  'band-curl',
  'band-lateral-raise',
  'band-leg-curl',
  'band-overhead-press',
  'band-pallof-press',
  'band-pull-apart',
  'band-row',
  'band-triceps-extension',
  'barbell-bench-press',
  'barbell-curl',
  'barbell-row',
  'bike-intervals',
  'bird-dog',
  'bodyweight-squat',
  'bulgarian-split-squat',
  'burpees',
  'cable-crunch',
  'cable-curl',
  'cable-lateral-raise',
  'cable-pallof-press',
  'cable-pull-through',
  'calf-raise',
  'chest-supported-row',
  'dead-bug',
  'deadlift',
  'decline-push-up',
  'diamond-push-up',
  'dumbbell-bench-press',
  'dumbbell-curl',
  'dumbbell-lateral-raise',
  'dumbbell-reverse-lunge',
  'dumbbell-romanian-deadlift',
  'dumbbell-shoulder-press',
  'dumbbell-triceps-extension',
  'farmers-carry',
  'front-squat',
  'glute-bridge',
  'goblet-squat',
  'hammer-curl',
  'hanging-knee-raise',
  'hip-thrust',
  'incline-dumbbell-press',
  'incline-push-up',
  'lat-pulldown',
  'leg-curl',
  'leg-extension',
  'leg-press',
  'machine-chest-press',
  'machine-shoulder-press',
  'mountain-climbers',
  'one-arm-dumbbell-row',
  'overhead-press',
  'overhead-triceps-extension',
  'pike-push-up',
  'plank',
  'prone-y-raise',
  'pull-up',
  'push-up',
  'rear-delt-fly',
  'reverse-pec-deck',
  'reverse-snow-angel',
  'romanian-deadlift',
  'rowing-machine-intervals',
  'seated-cable-row',
  'side-plank',
  'single-leg-glute-bridge',
  'split-squat',
  'suitcase-carry',
  'triceps-pushdown',
  'walking-lunge',
]);

/** The hero photo for a session type ("upper", "light-activity", …), or null. */
export function sessionTypePhoto(sessionType: string | null | undefined): string | null {
  return sessionType && SESSION_TYPES_WITH_PHOTOS.has(sessionType) ? `${DIR}session-${sessionType}.webp` : null;
}

/** The hero photo for a plan session (by its type), or null. */
export function sessionPhoto(session: PlanSession | null | undefined): string | null {
  return sessionTypePhoto(session?.sessionType);
}

/** The photo on rest days (a recovery moment: foam rolling), on Home and the Workout tab. */
export const REST_DAY_PHOTO = `${DIR}rest-day.webp`;

/** The workout summary's card photo. */
export const WORKOUT_COMPLETE_PHOTO = `${DIR}workout-complete.webp`;

/** The exercise's photo, or null. */
export function exercisePhoto(exerciseId: string): string | null {
  return EXERCISE_PHOTO_IDS.has(exerciseId) ? `${DIR}exercises/${exerciseId}.webp` : null;
}

/** The hero photo for a plan session id ("day-3-upper" → upper), for views that only carry the id; or null. */
export function sessionIdPhoto(sessionId: string | null | undefined): string | null {
  const type = /^day-\d+-(.+)$/.exec(sessionId ?? '')?.[1];
  return sessionTypePhoto(type);
}
