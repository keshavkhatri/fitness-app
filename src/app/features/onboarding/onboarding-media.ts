import { PrimaryGoal, TrainingLocation } from '../../domain/fitness-profile';

/**
 * Photography for onboarding. None ships with the app yet: every entry is
 * null and the screens draw placeholders (an icon on a dark tile, or the
 * welcome screen's dark backdrop). To use a photo, add the file under
 * `src/assets/images/onboarding/` (served as `assets/images/onboarding/...`)
 * and set its path here. Local files only; never hotlink.
 */

/** Full-bleed portrait behind the welcome text (dark, subject towards the top). */
export const WELCOME_PHOTO: string | null = null;

/** Small landscape thumbnails (about 4:3) on the goal cards. */
export const GOAL_PHOTOS: Readonly<Record<PrimaryGoal, string | null>> = {
  'lose-fat': null,
  'build-muscle': null,
  recomposition: null,
  'get-stronger': null,
  'improve-fitness': null,
};

/** Small landscape thumbnails (about 4:3) on the training-location cards. */
export const LOCATION_PHOTOS: Readonly<Record<TrainingLocation, string | null>> = {
  gym: null,
  home: null,
  both: null,
};
