/**
 * Photography for Home's featured workout card.
 *
 * No exercise photos ship with the app yet. To use one, add the file under
 * `src/assets/images/workouts/` (served as `assets/images/workouts/...`) and
 * set its path here; until then the card draws a generated placeholder
 * (`app-workout-art`). Use a landscape image (about 16:9, at least
 * 1200 px wide) with the subject on the right, where the text doesn't sit.
 */
export const FEATURED_WORKOUT_PHOTO: string | null = null;

/**
 * Photos behind Home's "Mindset for today" and "Track your progress" cards (dark, subject on the right; the text
 * sits on the left over a gradient). The mockup's sunrise photo isn't in the app yet: replace MINDSET_PHOTO when it is.
 */
export const MINDSET_PHOTO = 'assets/images/workouts/rest-day.webp';
export const TRACK_PROGRESS_PHOTO = 'assets/images/onboarding/offer-hero.webp';
