/**
 * Short coaching for each catalog exercise: two to four form cues and a breathing cue, the same words as its
 * instructional guide sheet (scripts/exercise-art-data.mjs). Shown in the exercise details.
 */
export interface ExerciseGuidance {
  readonly cues: readonly string[];
  readonly breathing: string;
}

export const EXERCISE_GUIDANCE: Readonly<Record<string, ExerciseGuidance>> = {
  'dumbbell-lateral-raise': {
    cues: [
      'Lift with control, no swinging',
      'Keep a slight bend in the elbows',
      'Do not shrug your shoulders',
    ],
    breathing: 'Breathe out as you lift, in as you lower',
  },
  'lat-pulldown': {
    cues: [
      'Pull the bar to your upper chest',
      'Drive elbows down and back',
      'Keep your chest up, no swinging',
    ],
    breathing: 'Breathe out as you pull down, in as you return',
  },
  'back-squat': {
    cues: [
      'Brace your core before you descend',
      'Knees track over your toes',
      'Drive up through your whole foot',
    ],
    breathing: 'Breathe in on the way down, out as you stand',
  },
  'barbell-bench-press': {
    cues: [
      'Shoulder blades pinched back',
      'Feet planted, bar over your chest',
      'Control the bar down',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'dumbbell-bench-press': {
    cues: [
      'Shoulder blades pinched back',
      'Lower with control',
      'Press straight up',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'incline-dumbbell-press': {
    cues: [
      'Low incline, about 30 degrees',
      'Keep your back on the pad',
      'Press straight up',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'machine-chest-press': {
    cues: [
      'Handles at mid-chest height',
      'Keep your back on the pad',
      'Press smoothly, return slowly',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'incline-push-up': {
    cues: [
      'Keep your body in one line',
      'Elbows about 45 degrees',
      'Chest to the bench, then press away',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'push-up': {
    cues: [
      'Keep your body in one line',
      'Elbows about 45 degrees',
      'Chest to the floor, then press away',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'decline-push-up': {
    cues: [
      'Brace your core, no sagging hips',
      'Elbows about 45 degrees',
      'Lower with control',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'archer-push-up': {
    cues: [
      'Keep your hips level',
      'Shift your weight over one arm',
      'Press back to the centre',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'band-chest-press': {
    cues: [
      'Anchor the band behind your back',
      'Brace your core',
      'Return slowly, keep tension',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'overhead-press': {
    cues: [
      'Squeeze your glutes and brace',
      'Press the bar in a straight line',
      'Finish with the bar over your mid-foot',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'dumbbell-shoulder-press': {
    cues: [
      'Keep your back supported',
      'Press straight up',
      'Lower to shoulder height',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'machine-shoulder-press': {
    cues: [
      'Seat set to shoulder height',
      'Keep your back on the pad',
      'Lower with control',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'pike-push-up': {
    cues: [
      'Keep your hips high',
      'Head moves between your hands',
      'Press back to the inverted V',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'band-overhead-press': {
    cues: [
      'Stand tall, brace your core',
      'Press straight up',
      'Lower with control',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'cable-lateral-raise': {
    cues: [
      'Lift with control, no swinging',
      'Slight bend in the elbow',
      'Do not shrug',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'band-lateral-raise': {
    cues: ['Lift with control', 'Slight bend in the elbows', 'Do not shrug'],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'rear-delt-fly': {
    cues: [
      'Hinge at the hips, flat back',
      'Lead with your elbows',
      'No swinging',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'reverse-pec-deck': {
    cues: ['Chest against the pad', 'Lead with your elbows', 'Return slowly'],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'band-pull-apart': {
    cues: [
      'Keep your arms straight',
      'Squeeze your shoulder blades',
      'Return slowly',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'reverse-snow-angel': {
    cues: [
      'Keep your neck long',
      'Move slowly with control',
      'Squeeze your shoulder blades',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'pull-up': {
    cues: [
      'Start from a full hang',
      'Drive your elbows down',
      'Lower with control',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'assisted-pull-up': {
    cues: [
      'Start from a full hang',
      'Drive your elbows down',
      'Lower with control',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'band-assisted-pull-up': {
    cues: [
      'Start from a full hang',
      'Drive your elbows down',
      'Lower with control',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'seated-cable-row': {
    cues: [
      'Sit tall, chest up',
      'Pull elbows back, squeeze your shoulder blades',
      'Return with control',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'one-arm-dumbbell-row': {
    cues: [
      'Keep your back flat',
      'Pull your elbow to your hip',
      'Lower with control',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'chest-supported-row': {
    cues: [
      'Chest stays on the pad',
      'Pull your elbows back',
      'Lower with control',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'barbell-row': {
    cues: [
      'Hinge at the hips, flat back',
      'Pull the bar to your lower ribs',
      'Lower with control',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'band-row': {
    cues: ['Sit tall', 'Squeeze your shoulder blades', 'Return slowly'],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'prone-y-raise': {
    cues: [
      'Thumbs up, arms in a Y',
      'Lift from your upper back',
      'Keep your neck long',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'front-squat': {
    cues: [
      'Keep your elbows high',
      'Stay upright',
      'Drive up through your whole foot',
    ],
    breathing: 'Breathe in on the way down, out as you stand',
  },
  'goblet-squat': {
    cues: [
      'Hold the weight at your chest',
      'Knees track over your toes',
      'Drive up through your whole foot',
    ],
    breathing: 'Breathe in on the way down, out as you stand',
  },
  'leg-press': {
    cues: [
      'Keep your lower back on the pad',
      'Knees track over your toes',
      'Do not lock your knees',
    ],
    breathing: 'Breathe in on the way down, out as you press',
  },
  'bodyweight-squat': {
    cues: [
      'Chest up, heels down',
      'Knees track over your toes',
      'Drive up through your whole foot',
    ],
    breathing: 'Breathe in on the way down, out as you stand',
  },
  deadlift: {
    cues: [
      'Bar stays close to your legs',
      'Keep your back flat',
      'Push the floor away',
    ],
    breathing: 'Brace before you pull, breathe out at the top',
  },
  'romanian-deadlift': {
    cues: [
      'Push your hips back',
      'Bar stays close to your legs',
      'Keep your back flat',
    ],
    breathing: 'Breathe in as you lower, out as you stand',
  },
  'dumbbell-romanian-deadlift': {
    cues: [
      'Push your hips back',
      'Dumbbells stay close to your legs',
      'Keep your back flat',
    ],
    breathing: 'Breathe in as you lower, out as you stand',
  },
  'hip-thrust': {
    cues: [
      'Chin tucked, ribs down',
      'Drive through your heels',
      'Squeeze your glutes at the top',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'cable-pull-through': {
    cues: [
      'Push your hips back first',
      'Keep your back flat',
      'Squeeze your glutes at the top',
    ],
    breathing: 'Breathe in as you hinge, out as you stand',
  },
  'back-extension': {
    cues: [
      'Hinge at the hips',
      'Keep your back flat',
      'Stop at a straight line',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'glute-bridge': {
    cues: [
      'Drive through your heels',
      'Squeeze your glutes at the top',
      'Do not arch your lower back',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'single-leg-glute-bridge': {
    cues: [
      'Keep your hips level',
      'Drive through your heel',
      'Squeeze your glutes at the top',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'split-squat': {
    cues: [
      'Torso stays upright',
      'Front knee tracks over the toes',
      'Drive up through your front heel',
    ],
    breathing: 'Breathe in on the way down, out as you rise',
  },
  'walking-lunge': {
    cues: [
      'Take a long step',
      'Torso stays upright',
      'Drive through the front heel',
    ],
    breathing: 'Breathe in as you lower, out as you step up',
  },
  'dumbbell-reverse-lunge': {
    cues: [
      'Step back with control',
      'Torso stays upright',
      'Drive through the front heel',
    ],
    breathing: 'Breathe in as you lower, out as you stand',
  },
  'bulgarian-split-squat': {
    cues: [
      'Torso stays upright',
      'Front knee tracks over the toes',
      'Drive up through your front heel',
    ],
    breathing: 'Breathe in on the way down, out as you rise',
  },
  'leg-curl': {
    cues: ['Keep your hips down', 'Curl smoothly, no jerking', 'Return slowly'],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'band-leg-curl': {
    cues: ['Keep your hips down', 'Curl smoothly', 'Return slowly'],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'leg-extension': {
    cues: [
      'Squeeze your quads at the top',
      'Do not swing the weight',
      'Lower slowly',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'calf-raise': {
    cues: [
      'Full stretch at the bottom',
      'Pause at the top',
      'Keep your knees almost straight',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'barbell-curl': {
    cues: ['Elbows stay at your sides', 'No swinging', 'Lower with control'],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'dumbbell-curl': {
    cues: ['Elbows stay at your sides', 'No swinging', 'Lower with control'],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'hammer-curl': {
    cues: [
      'Palms face each other',
      'Elbows stay at your sides',
      'Lower with control',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'cable-curl': {
    cues: ['Elbows stay at your sides', 'No swinging', 'Lower with control'],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'band-curl': {
    cues: ['Elbows stay at your sides', 'No swinging', 'Lower with control'],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'triceps-pushdown': {
    cues: [
      'Elbows pinned to your sides',
      'Squeeze at the bottom',
      'Return slowly',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'overhead-triceps-extension': {
    cues: [
      'Elbows close to your head',
      'Only your forearms move',
      'Return slowly',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'dumbbell-triceps-extension': {
    cues: [
      'Elbows close to your head',
      'Only your forearms move',
      'Lower slowly',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'band-triceps-extension': {
    cues: [
      'Elbows close to your head',
      'Only your forearms move',
      'Return slowly',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'diamond-push-up': {
    cues: [
      'Hands form a diamond',
      'Elbows tucked close',
      'Keep your body in one line',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'dead-bug': {
    cues: [
      'Keep your lower back pressed down',
      'Move slowly',
      'Opposite arm and leg together',
    ],
    breathing: 'Breathe out as you extend, in as you return',
  },
  plank: {
    cues: [
      'Body in one straight line',
      'Squeeze your abs and glutes',
      'Do not let your hips sag',
    ],
    breathing: 'Breathe steadily and never hold your breath',
  },
  'ab-wheel-rollout': {
    cues: [
      'Brace your core',
      'Do not let your back sag',
      'Roll out only as far as you can control',
    ],
    breathing: 'Breathe out as you roll out, in as you return',
  },
  'hanging-knee-raise': {
    cues: ['No swinging', 'Curl your pelvis up', 'Lower with control'],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'cable-crunch': {
    cues: [
      'Curl your ribs toward your hips',
      'Hips stay still',
      'Return slowly',
    ],
    breathing: 'Breathe out on the effort, in on the return',
  },
  'cable-pallof-press': {
    cues: [
      'Do not let the cable rotate you',
      'Brace your core',
      'Return slowly',
    ],
    breathing: 'Breathe steadily and never hold your breath',
  },
  'band-pallof-press': {
    cues: [
      'Do not let the band rotate you',
      'Brace your core',
      'Return slowly',
    ],
    breathing: 'Breathe steadily and never hold your breath',
  },
  'side-plank': {
    cues: [
      'Body in one straight line',
      'Hips high, no sagging',
      'Elbow under your shoulder',
    ],
    breathing: 'Breathe steadily and never hold your breath',
  },
  'bird-dog': {
    cues: ['Keep your hips level', 'Flat back, neck long', 'Move slowly'],
    breathing: 'Breathe out as you extend, in as you return',
  },
  'farmers-carry': {
    cues: [
      'Stand tall, shoulders back',
      'Grip tight',
      'Short controlled steps',
    ],
    breathing: 'Breathe steadily and never hold your breath',
  },
  'suitcase-carry': {
    cues: [
      'Do not lean to the side',
      'Stand tall, shoulders level',
      'Grip tight',
    ],
    breathing: 'Breathe steadily and never hold your breath',
  },
  'bike-intervals': {
    cues: [
      'Go hard in the work intervals',
      'Recover fully between efforts',
      'Keep a steady cadence',
    ],
    breathing: 'Breathe rhythmically; deep breaths during recovery',
  },
  'rowing-machine-intervals': {
    cues: [
      'Legs, then back, then arms',
      'Arms, back, then legs on the return',
      'Keep your back straight',
    ],
    breathing: 'Breathe out on the drive, in on the recovery',
  },
  'mountain-climbers': {
    cues: [
      'Hips level, core braced',
      'Fast and controlled',
      'Hands under shoulders',
    ],
    breathing: 'Breathe quickly and rhythmically',
  },
  burpees: {
    cues: ['Land softly', 'Keep your core braced', 'Move smoothly'],
    breathing: 'Breathe quickly and rhythmically',
  },
};

/** The exercise's cues, or null when it has none. */
export function exerciseGuidance(exerciseId: string): ExerciseGuidance | null {
  return Object.hasOwn(EXERCISE_GUIDANCE, exerciseId)
    ? EXERCISE_GUIDANCE[exerciseId]
    : null;
}
