/**
 * Exercise demonstrations: catalog exercise → the matching entry of
 * free-exercise-db (github.com/yuhonas/free-exercise-db, The Unlicense:
 * public domain), whose photos show the start and end positions of each
 * exercise. Played in turn, they demonstrate the movement.
 *
 * Only faithful matches are listed: the same movement with the same kind of
 * equipment. An exercise without one has no demonstration rather than a
 * different exercise's photos (e.g. Archer Push-Up, Burpees, band variants
 * the source doesn't have).
 */
export const EXERCISE_DEMONSTRATION_SOURCES: Readonly<Record<string, string>> = {
  'barbell-bench-press': 'Barbell_Bench_Press_-_Medium_Grip',
  'dumbbell-bench-press': 'Dumbbell_Bench_Press',
  'incline-dumbbell-press': 'Incline_Dumbbell_Press',
  'machine-chest-press': 'Machine_Bench_Press',
  'incline-push-up': 'Incline_Push-Up',
  'push-up': 'Pushups',
  'decline-push-up': 'Decline_Push-Up',
  'diamond-push-up': 'Push-Ups_-_Close_Triceps_Position',
  'overhead-press': 'Standing_Military_Press',
  'dumbbell-shoulder-press': 'Dumbbell_Shoulder_Press',
  'machine-shoulder-press': 'Machine_Shoulder_Military_Press',
  'dumbbell-lateral-raise': 'Side_Lateral_Raise',
  'cable-lateral-raise': 'Cable_Seated_Lateral_Raise',
  'band-lateral-raise': 'Lateral_Raise_-_With_Bands',
  'rear-delt-fly': 'Seated_Bent-Over_Rear_Delt_Raise',
  'reverse-pec-deck': 'Reverse_Machine_Flyes',
  'band-pull-apart': 'Band_Pull_Apart',
  'lat-pulldown': 'Wide-Grip_Lat_Pulldown',
  'pull-up': 'Pullups',
  'band-assisted-pull-up': 'Band_Assisted_Pull-Up',
  'seated-cable-row': 'Seated_Cable_Rows',
  'one-arm-dumbbell-row': 'One-Arm_Dumbbell_Row',
  'chest-supported-row': 'Dumbbell_Incline_Row',
  'barbell-row': 'Bent_Over_Barbell_Row',
  'back-squat': 'Barbell_Squat',
  'front-squat': 'Front_Barbell_Squat',
  'goblet-squat': 'Goblet_Squat',
  'leg-press': 'Leg_Press',
  'bodyweight-squat': 'Bodyweight_Squat',
  deadlift: 'Barbell_Deadlift',
  'romanian-deadlift': 'Romanian_Deadlift',
  'hip-thrust': 'Barbell_Hip_Thrust',
  'cable-pull-through': 'Pull_Through',
  'back-extension': 'Hyperextensions_Back_Extensions',
  'glute-bridge': 'Butt_Lift_Bridge',
  'single-leg-glute-bridge': 'Single_Leg_Glute_Bridge',
  'walking-lunge': 'Bodyweight_Walking_Lunge',
  'dumbbell-reverse-lunge': 'Dumbbell_Rear_Lunge',
  'bulgarian-split-squat': 'Split_Squat_with_Dumbbells',
  'leg-curl': 'Lying_Leg_Curls',
  'leg-extension': 'Leg_Extensions',
  'calf-raise': 'Standing_Calf_Raises',
  'barbell-curl': 'Barbell_Curl',
  'dumbbell-curl': 'Dumbbell_Bicep_Curl',
  'hammer-curl': 'Hammer_Curls',
  'cable-curl': 'Standing_Biceps_Cable_Curl',
  'triceps-pushdown': 'Triceps_Pushdown',
  'overhead-triceps-extension': 'Cable_Rope_Overhead_Triceps_Extension',
  'dumbbell-triceps-extension': 'Standing_Dumbbell_Triceps_Extension',
  'dead-bug': 'Dead_Bug',
  plank: 'Plank',
  'ab-wheel-rollout': 'Ab_Roller',
  'cable-crunch': 'Cable_Crunch',
  'cable-pallof-press': 'Pallof_Press',
  'side-plank': 'Side_Bridge',
  'bike-intervals': 'Bicycling_Stationary',
  'rowing-machine-intervals': 'Rowing_Stationary',
  'mountain-climbers': 'Mountain_Climbers',
};

/** The source's two frames (start, end), relative to its `exercises/` folder; null without a demonstration. */
export function demonstrationFrames(exerciseId: string): readonly [string, string] | null {
  const source = Object.hasOwn(EXERCISE_DEMONSTRATION_SOURCES, exerciseId) ? EXERCISE_DEMONSTRATION_SOURCES[exerciseId] : null;
  return source ? [`${source}/0.jpg`, `${source}/1.jpg`] : null;
}
