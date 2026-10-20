import { PrimaryGoal, TrainingLocation } from '../../domain/fitness-profile';

/**
 * Photography for onboarding (AI-generated, see scripts/generate-workout-photos.mjs), under
 * `src/assets/images/onboarding/` (served as `assets/images/onboarding/...`). An entry set to null draws the
 * placeholder (an icon on a dark tile, or the welcome screen's dark backdrop). Local files only; never hotlink.
 */
const DIR = 'assets/images/onboarding/';

/** Full-bleed portrait behind the welcome text (dark, subject towards the top). */
export const WELCOME_PHOTO: string | null = `${DIR}welcome.webp`;

/** Small landscape thumbnails (about 4:3) on the goal cards. */
export const GOAL_PHOTOS: Readonly<Record<PrimaryGoal, string | null>> = {
  'lose-fat': `${DIR}goal-lose-fat.webp`,
  'build-muscle': `${DIR}goal-build-muscle.webp`,
  recomposition: `${DIR}goal-recomposition.webp`,
  'get-stronger': `${DIR}goal-get-stronger.webp`,
  'improve-fitness': `${DIR}goal-improve-fitness.webp`,
};

/** Small landscape thumbnails (about 4:3) on the training-location cards. */
export const LOCATION_PHOTOS: Readonly<Record<TrainingLocation, string | null>> = {
  gym: `${DIR}location-gym.webp`,
  home: `${DIR}location-home.webp`,
  both: `${DIR}location-both.webp`,
};
