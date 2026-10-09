import { TRAINING_EXPERIENCE_LEVELS } from '../fitness-profile';
import { Exercise, ProgressionChain } from './exercise.model';
import {
  MovementPattern,
  MuscleGroup,
  PROGRAM_STYLES,
  WorkoutLocation,
  isExerciseTier,
  isFatigueCost,
  isMovementClass,
  isMovementPattern,
  isMuscleGroup,
  isWorkoutEquipment,
  isWorkoutLocation,
} from './workout-taxonomy';

/**
 * Curated exercise catalog (v2). Large enough to exercise the programming
 * rules across gym, home and outdoor setups; not the final production
 * exercise database.
 */

const GYM: readonly WorkoutLocation[] = ['gym'];
const GYM_HOME: readonly WorkoutLocation[] = ['gym', 'home'];
const ANYWHERE: readonly WorkoutLocation[] = ['gym', 'home', 'outdoor'];

type ExerciseSpec = Partial<Omit<Exercise, 'id' | 'name' | 'pattern' | 'primaryMuscles'>>;

/**
 * Defaults describe the most common case: a beginner-suited, bilateral,
 * free-weight compound for reps that fully trains its pattern. Isolation
 * exercises default to low fatigue, compounds to moderate.
 */
function exercise(
  id: string,
  name: string,
  pattern: MovementPattern,
  primaryMuscles: readonly MuscleGroup[],
  spec: ExerciseSpec = {},
): Exercise {
  const mechanics = spec.mechanics ?? 'compound';
  return {
    id,
    name,
    pattern,
    movementClass: 'full',
    primaryMuscles,
    secondaryMuscles: [],
    requires: [],
    locations: ANYWHERE,
    difficulty: 'beginner',
    mechanics,
    laterality: 'bilateral',
    measurement: 'reps',
    loadability: 'moderate',
    stability: 'free',
    tier: 'standard',
    fatigue: mechanics === 'compound' ? 'moderate' : 'low',
    preferredFor: [],
    ...spec,
  };
}

const isolation = { mechanics: 'isolation' } as const;
const timed = { measurement: 'time' } as const;
/** Band variants: useful at home/outdoors, but a fallback when real loading is available. */
const band = { requires: ['resistance-band'], loadability: 'low', tier: 'fallback' } as const;

export const EXERCISE_LIBRARY: readonly Exercise[] = [
  // --- Horizontal push ---------------------------------------------------------
  exercise('barbell-bench-press', 'Bench Press', 'horizontal-push', ['chest'], {
    secondaryMuscles: ['triceps', 'front-delts'],
    requires: ['barbell', 'bench', 'rack'],
    locations: GYM_HOME,
    difficulty: 'intermediate',
    loadability: 'high',
    tier: 'staple',
    preferredFor: ['strength'],
  }),
  exercise('dumbbell-bench-press', 'Dumbbell Bench Press', 'horizontal-push', ['chest'], {
    secondaryMuscles: ['triceps', 'front-delts'],
    requires: ['dumbbells', 'bench'],
    locations: GYM_HOME,
  }),
  exercise('incline-dumbbell-press', 'Incline Dumbbell Press', 'horizontal-push', ['chest', 'front-delts'], {
    secondaryMuscles: ['triceps'],
    requires: ['dumbbells', 'bench'],
    locations: GYM_HOME,
  }),
  exercise('machine-chest-press', 'Machine Chest Press', 'horizontal-push', ['chest'], {
    secondaryMuscles: ['triceps', 'front-delts'],
    requires: ['machine'],
    locations: GYM,
    loadability: 'high',
    stability: 'supported',
  }),
  exercise('incline-push-up', 'Incline Push-Up', 'horizontal-push', ['chest'], {
    secondaryMuscles: ['triceps', 'front-delts'],
    loadability: 'low',
  }),
  exercise('push-up', 'Push-Up', 'horizontal-push', ['chest'], {
    secondaryMuscles: ['triceps', 'front-delts', 'abs'],
    loadability: 'low',
    tier: 'staple',
  }),
  exercise('decline-push-up', 'Decline Push-Up', 'horizontal-push', ['chest', 'front-delts'], {
    secondaryMuscles: ['triceps'],
    difficulty: 'intermediate',
    loadability: 'low',
  }),
  exercise('archer-push-up', 'Archer Push-Up', 'horizontal-push', ['chest'], {
    secondaryMuscles: ['triceps', 'front-delts'],
    difficulty: 'advanced',
    laterality: 'unilateral',
    loadability: 'low',
  }),
  exercise('band-chest-press', 'Band Chest Press', 'horizontal-push', ['chest'], { ...band, secondaryMuscles: ['triceps'] }),

  // --- Vertical push -----------------------------------------------------------
  exercise('overhead-press', 'Overhead Press', 'vertical-push', ['front-delts'], {
    secondaryMuscles: ['triceps', 'side-delts'],
    requires: ['barbell', 'rack'],
    locations: GYM_HOME,
    difficulty: 'intermediate',
    loadability: 'high',
    tier: 'staple',
    preferredFor: ['strength'],
  }),
  exercise('dumbbell-shoulder-press', 'Dumbbell Shoulder Press', 'vertical-push', ['front-delts'], {
    secondaryMuscles: ['triceps', 'side-delts'],
    requires: ['dumbbells'],
    locations: GYM_HOME,
  }),
  exercise('machine-shoulder-press', 'Machine Shoulder Press', 'vertical-push', ['front-delts'], {
    secondaryMuscles: ['triceps'],
    requires: ['machine'],
    locations: GYM,
    loadability: 'high',
    stability: 'supported',
  }),
  exercise('pike-push-up', 'Pike Push-Up', 'vertical-push', ['front-delts'], {
    secondaryMuscles: ['triceps'],
    difficulty: 'intermediate',
    loadability: 'low',
  }),
  exercise('band-overhead-press', 'Band Overhead Press', 'vertical-push', ['front-delts'], { ...band, secondaryMuscles: ['triceps'] }),

  // --- Shoulder abduction / rear delts -----------------------------------------
  exercise('dumbbell-lateral-raise', 'Lateral Raise', 'shoulder-abduction', ['side-delts'], {
    ...isolation,
    requires: ['dumbbells'],
    locations: GYM_HOME,
  }),
  exercise('cable-lateral-raise', 'Cable Lateral Raise', 'shoulder-abduction', ['side-delts'], {
    ...isolation,
    requires: ['cable'],
    locations: GYM,
    laterality: 'unilateral',
    stability: 'supported',
    difficulty: 'intermediate',
  }),
  exercise('band-lateral-raise', 'Band Lateral Raise', 'shoulder-abduction', ['side-delts'], { ...isolation, ...band }),
  exercise('rear-delt-fly', 'Rear Delt Fly', 'shoulder-horizontal-abduction', ['rear-delts'], {
    ...isolation,
    secondaryMuscles: ['upper-back'],
    requires: ['dumbbells'],
    locations: GYM_HOME,
  }),
  exercise('reverse-pec-deck', 'Reverse Pec Deck', 'shoulder-horizontal-abduction', ['rear-delts'], {
    ...isolation,
    secondaryMuscles: ['upper-back'],
    requires: ['machine'],
    locations: GYM,
    loadability: 'high',
    stability: 'supported',
  }),
  exercise('band-pull-apart', 'Band Pull-Apart', 'shoulder-horizontal-abduction', ['rear-delts'], {
    ...isolation,
    ...band,
    secondaryMuscles: ['upper-back'],
  }),
  exercise('reverse-snow-angel', 'Reverse Snow Angel', 'shoulder-horizontal-abduction', ['rear-delts', 'upper-back'], {
    ...isolation,
    movementClass: 'scapular',
    loadability: 'low',
  }),

  // --- Vertical pull -----------------------------------------------------------
  exercise('lat-pulldown', 'Lat Pulldown', 'vertical-pull', ['lats'], {
    secondaryMuscles: ['biceps', 'upper-back'],
    requires: ['cable'],
    locations: GYM,
    loadability: 'high',
    stability: 'supported',
    tier: 'staple',
  }),
  exercise('pull-up', 'Pull-Up', 'vertical-pull', ['lats'], {
    secondaryMuscles: ['biceps', 'upper-back'],
    requires: ['pull-up-bar'],
    difficulty: 'intermediate',
    tier: 'staple',
    preferredFor: ['strength'],
  }),
  exercise('assisted-pull-up', 'Assisted Pull-Up', 'vertical-pull', ['lats'], {
    secondaryMuscles: ['biceps'],
    requires: ['machine'],
    locations: GYM,
    stability: 'supported',
  }),
  exercise('band-assisted-pull-up', 'Band-Assisted Pull-Up', 'vertical-pull', ['lats'], {
    secondaryMuscles: ['biceps'],
    requires: ['pull-up-bar', 'resistance-band'],
    loadability: 'low',
  }),

  // --- Horizontal pull ---------------------------------------------------------
  exercise('seated-cable-row', 'Seated Cable Row', 'horizontal-pull', ['upper-back', 'lats'], {
    secondaryMuscles: ['biceps', 'rear-delts'],
    requires: ['cable'],
    locations: GYM,
    loadability: 'high',
    stability: 'supported',
  }),
  exercise('one-arm-dumbbell-row', 'One-Arm Dumbbell Row', 'horizontal-pull', ['lats', 'upper-back'], {
    secondaryMuscles: ['biceps'],
    requires: ['dumbbells', 'bench'],
    locations: GYM_HOME,
    laterality: 'unilateral',
  }),
  exercise('chest-supported-row', 'Chest-Supported Row', 'horizontal-pull', ['upper-back', 'lats'], {
    secondaryMuscles: ['biceps', 'rear-delts'],
    requires: ['dumbbells', 'bench'],
    locations: GYM_HOME,
    stability: 'supported',
  }),
  exercise('barbell-row', 'Barbell Row', 'horizontal-pull', ['upper-back', 'lats'], {
    secondaryMuscles: ['biceps', 'lower-back'],
    requires: ['barbell'],
    locations: GYM_HOME,
    difficulty: 'intermediate',
    loadability: 'high',
    preferredFor: ['strength'],
  }),
  exercise('band-row', 'Band Row', 'horizontal-pull', ['upper-back', 'lats'], { ...band, secondaryMuscles: ['biceps'] }),
  // Scapular work only: never a full replacement for a row or pull-up.
  exercise('prone-y-raise', 'Prone Y Raise', 'horizontal-pull', ['upper-back'], {
    ...isolation,
    movementClass: 'scapular',
    secondaryMuscles: ['rear-delts'],
    loadability: 'low',
  }),

  // --- Squat (knee-dominant) ---------------------------------------------------
  exercise('back-squat', 'Back Squat', 'squat', ['quads', 'glutes'], {
    secondaryMuscles: ['adductors', 'lower-back'],
    requires: ['barbell', 'rack'],
    locations: GYM_HOME,
    difficulty: 'intermediate',
    loadability: 'high',
    tier: 'staple',
    fatigue: 'high',
    preferredFor: ['strength'],
  }),
  exercise('front-squat', 'Front Squat', 'squat', ['quads'], {
    secondaryMuscles: ['glutes', 'abs'],
    requires: ['barbell', 'rack'],
    locations: GYM_HOME,
    difficulty: 'advanced',
    loadability: 'high',
    fatigue: 'high',
  }),
  exercise('goblet-squat', 'Goblet Squat', 'squat', ['quads', 'glutes'], {
    secondaryMuscles: ['abs'],
    requires: ['dumbbells'],
    locations: GYM_HOME,
  }),
  exercise('leg-press', 'Leg Press', 'squat', ['quads', 'glutes'], {
    requires: ['machine'],
    locations: GYM,
    loadability: 'high',
    stability: 'supported',
    preferredFor: ['hypertrophy'],
  }),
  exercise('bodyweight-squat', 'Bodyweight Squat', 'squat', ['quads', 'glutes'], { loadability: 'low' }),

  // --- Hinge (hip-dominant) ----------------------------------------------------
  exercise('deadlift', 'Deadlift', 'hinge', ['hamstrings', 'glutes', 'lower-back'], {
    secondaryMuscles: ['upper-back', 'forearms'],
    requires: ['barbell'],
    locations: GYM_HOME,
    difficulty: 'intermediate',
    loadability: 'high',
    tier: 'staple',
    fatigue: 'high',
    preferredFor: ['strength'],
  }),
  exercise('romanian-deadlift', 'Romanian Deadlift', 'hinge', ['hamstrings', 'glutes'], {
    secondaryMuscles: ['lower-back'],
    requires: ['barbell'],
    locations: GYM_HOME,
    difficulty: 'intermediate',
    loadability: 'high',
    tier: 'staple',
    preferredFor: ['hypertrophy', 'general'],
  }),
  exercise('dumbbell-romanian-deadlift', 'Dumbbell Romanian Deadlift', 'hinge', ['hamstrings', 'glutes'], {
    secondaryMuscles: ['lower-back'],
    requires: ['dumbbells'],
    locations: GYM_HOME,
    tier: 'staple',
  }),
  exercise('hip-thrust', 'Hip Thrust', 'hinge', ['glutes'], {
    secondaryMuscles: ['hamstrings'],
    requires: ['barbell', 'bench'],
    locations: GYM_HOME,
    difficulty: 'intermediate',
    loadability: 'high',
  }),
  exercise('cable-pull-through', 'Cable Pull-Through', 'hinge', ['glutes', 'hamstrings'], {
    requires: ['cable'],
    locations: GYM,
  }),
  exercise('back-extension', '45° Back Extension', 'hinge', ['glutes', 'hamstrings'], {
    ...isolation,
    secondaryMuscles: ['lower-back'],
    requires: ['machine'],
    locations: GYM,
    stability: 'supported',
  }),
  exercise('glute-bridge', 'Glute Bridge', 'hinge', ['glutes'], {
    secondaryMuscles: ['hamstrings'],
    loadability: 'low',
  }),
  exercise('single-leg-glute-bridge', 'Single-Leg Glute Bridge', 'hinge', ['glutes'], {
    secondaryMuscles: ['hamstrings'],
    difficulty: 'intermediate',
    laterality: 'unilateral',
    loadability: 'low',
  }),

  // --- Lunge (unilateral) ------------------------------------------------------
  exercise('split-squat', 'Split Squat', 'lunge', ['quads', 'glutes'], {
    secondaryMuscles: ['adductors'],
    laterality: 'unilateral',
    loadability: 'low',
  }),
  exercise('walking-lunge', 'Walking Lunge', 'lunge', ['quads', 'glutes'], {
    secondaryMuscles: ['adductors'],
    laterality: 'unilateral',
    loadability: 'low',
  }),
  exercise('dumbbell-reverse-lunge', 'Dumbbell Reverse Lunge', 'lunge', ['quads', 'glutes'], {
    secondaryMuscles: ['adductors'],
    requires: ['dumbbells'],
    locations: GYM_HOME,
    laterality: 'unilateral',
  }),
  exercise('bulgarian-split-squat', 'Bulgarian Split Squat', 'lunge', ['quads', 'glutes'], {
    secondaryMuscles: ['adductors'],
    requires: ['bench'],
    locations: GYM_HOME,
    difficulty: 'intermediate',
    laterality: 'unilateral',
  }),

  // --- Knee flexion / extension, calves ------------------------------------------
  exercise('leg-curl', 'Leg Curl', 'knee-flexion', ['hamstrings'], {
    ...isolation,
    requires: ['machine'],
    locations: GYM,
    loadability: 'high',
    stability: 'supported',
  }),
  exercise('band-leg-curl', 'Band Leg Curl', 'knee-flexion', ['hamstrings'], { ...isolation, ...band }),
  exercise('leg-extension', 'Leg Extension', 'knee-extension', ['quads'], {
    ...isolation,
    requires: ['machine'],
    locations: GYM,
    loadability: 'high',
    stability: 'supported',
  }),
  exercise('calf-raise', 'Calf Raise', 'calf-raise', ['calves'], { ...isolation, loadability: 'low' }),

  // --- Elbow flexion -------------------------------------------------------------
  exercise('barbell-curl', 'Barbell Curl', 'elbow-flexion', ['biceps'], {
    ...isolation,
    secondaryMuscles: ['forearms'],
    requires: ['barbell'],
    locations: GYM_HOME,
  }),
  exercise('dumbbell-curl', 'Dumbbell Curl', 'elbow-flexion', ['biceps'], {
    ...isolation,
    secondaryMuscles: ['forearms'],
    requires: ['dumbbells'],
    locations: GYM_HOME,
  }),
  exercise('hammer-curl', 'Hammer Curl', 'elbow-flexion', ['biceps', 'forearms'], {
    ...isolation,
    requires: ['dumbbells'],
    locations: GYM_HOME,
  }),
  exercise('cable-curl', 'Cable Curl', 'elbow-flexion', ['biceps'], {
    ...isolation,
    requires: ['cable'],
    locations: GYM,
    stability: 'supported',
  }),
  exercise('band-curl', 'Band Curl', 'elbow-flexion', ['biceps'], { ...isolation, ...band }),

  // --- Elbow extension -----------------------------------------------------------
  exercise('triceps-pushdown', 'Triceps Pushdown', 'elbow-extension', ['triceps'], {
    ...isolation,
    requires: ['cable'],
    locations: GYM,
    stability: 'supported',
  }),
  exercise('overhead-triceps-extension', 'Overhead Triceps Extension', 'elbow-extension', ['triceps'], {
    ...isolation,
    requires: ['cable'],
    locations: GYM,
    stability: 'supported',
  }),
  exercise('dumbbell-triceps-extension', 'Dumbbell Triceps Extension', 'elbow-extension', ['triceps'], {
    ...isolation,
    requires: ['dumbbells'],
    locations: GYM_HOME,
  }),
  exercise('band-triceps-extension', 'Band Triceps Extension', 'elbow-extension', ['triceps'], { ...isolation, ...band }),
  exercise('diamond-push-up', 'Diamond Push-Up', 'elbow-extension', ['triceps'], {
    secondaryMuscles: ['chest'],
    difficulty: 'intermediate',
    loadability: 'low',
  }),

  // --- Core ----------------------------------------------------------------------
  exercise('dead-bug', 'Dead Bug', 'anti-extension', ['abs'], { ...isolation, laterality: 'unilateral', loadability: 'low' }),
  exercise('plank', 'Plank', 'anti-extension', ['abs'], { ...isolation, ...timed, loadability: 'low' }),
  exercise('ab-wheel-rollout', 'Ab Wheel', 'anti-extension', ['abs'], {
    ...isolation,
    requires: ['ab-wheel'],
    locations: GYM_HOME,
    difficulty: 'advanced',
    loadability: 'low',
  }),
  exercise('hanging-knee-raise', 'Hanging Knee Raise', 'core-flexion', ['abs'], {
    ...isolation,
    secondaryMuscles: ['forearms'],
    requires: ['pull-up-bar'],
    difficulty: 'intermediate',
    loadability: 'low',
  }),
  exercise('cable-crunch', 'Cable Crunch', 'core-flexion', ['abs'], {
    ...isolation,
    requires: ['cable'],
    locations: GYM,
    stability: 'supported',
  }),
  exercise('cable-pallof-press', 'Pallof Press', 'anti-rotation', ['obliques', 'abs'], {
    ...isolation,
    requires: ['cable'],
    locations: GYM,
    laterality: 'unilateral',
    stability: 'supported',
  }),
  exercise('band-pallof-press', 'Band Pallof Press', 'anti-rotation', ['obliques', 'abs'], {
    ...isolation,
    ...band,
    laterality: 'unilateral',
  }),
  exercise('side-plank', 'Side Plank', 'anti-rotation', ['obliques'], {
    ...isolation,
    ...timed,
    laterality: 'unilateral',
    loadability: 'low',
  }),
  exercise('bird-dog', 'Bird Dog', 'anti-rotation', ['abs', 'lower-back'], {
    ...isolation,
    laterality: 'unilateral',
    loadability: 'low',
  }),

  // --- Carries -----------------------------------------------------------------
  exercise('farmers-carry', "Farmer's Carry", 'carry', ['forearms', 'upper-back'], {
    ...timed,
    secondaryMuscles: ['abs', 'glutes'],
    requires: ['dumbbells'],
    locations: GYM_HOME,
  }),
  exercise('suitcase-carry', 'Suitcase Carry', 'carry', ['obliques', 'forearms'], {
    ...timed,
    requires: ['dumbbells'],
    locations: GYM_HOME,
    laterality: 'unilateral',
    difficulty: 'intermediate',
  }),

  // --- Conditioning ------------------------------------------------------------
  exercise('bike-intervals', 'Bike Intervals', 'conditioning', ['cardiovascular'], {
    ...timed,
    secondaryMuscles: ['quads'],
    requires: ['machine'],
    locations: GYM,
    loadability: 'low',
    stability: 'supported',
  }),
  exercise('rowing-machine-intervals', 'Rowing Machine Intervals', 'conditioning', ['cardiovascular'], {
    ...timed,
    secondaryMuscles: ['upper-back', 'quads'],
    requires: ['machine'],
    locations: GYM,
    difficulty: 'intermediate',
    loadability: 'low',
    stability: 'supported',
  }),
  exercise('mountain-climbers', 'Mountain Climbers', 'conditioning', ['cardiovascular'], {
    ...timed,
    secondaryMuscles: ['abs'],
    loadability: 'low',
  }),
  exercise('burpees', 'Burpees', 'conditioning', ['cardiovascular'], {
    ...timed,
    secondaryMuscles: ['chest', 'quads'],
    difficulty: 'intermediate',
    loadability: 'low',
  }),
];

/**
 * Progression chains for exercises progressed by variation rather than load.
 * Small on purpose: only realistic, well-known progressions.
 */
export const PROGRESSION_CHAINS: readonly ProgressionChain[] = [
  { id: 'push-up', steps: ['incline-push-up', 'push-up', 'decline-push-up', 'archer-push-up'], entry: 'push-up' },
  { id: 'bodyweight-knee-dominant', steps: ['bodyweight-squat', 'split-squat', 'bulgarian-split-squat'], entry: 'bodyweight-squat' },
  { id: 'glute-bridge', steps: ['glute-bridge', 'single-leg-glute-bridge'], entry: 'glute-bridge' },
  { id: 'pull-up', steps: ['band-assisted-pull-up', 'pull-up'], entry: 'band-assisted-pull-up' },
  { id: 'anti-extension', steps: ['dead-bug', 'plank', 'ab-wheel-rollout'], entry: 'dead-bug' },
];

/** Structural checks for a catalog. Returns developer-facing problems; empty when valid. */
export function validateExerciseCatalog(catalog: readonly Exercise[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  if (catalog.length === 0) {
    problems.push('Catalog is empty.');
  }
  for (const e of catalog) {
    const where = `Exercise "${e.id}"`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id)) {
      problems.push(`${where}: id must be kebab-case.`);
    }
    if (seen.has(e.id)) {
      problems.push(`${where}: duplicate id.`);
    }
    seen.add(e.id);
    if (!e.name.trim()) {
      problems.push(`${where}: missing name.`);
    }
    if (!isMovementPattern(e.pattern) || !isMovementClass(e.movementClass)) {
      problems.push(`${where}: unknown movement pattern or class.`);
    }
    if (e.primaryMuscles.length === 0 || ![...e.primaryMuscles, ...e.secondaryMuscles].every(isMuscleGroup)) {
      problems.push(`${where}: needs at least one primary muscle and only known muscles.`);
    }
    if (!e.requires.every(isWorkoutEquipment)) {
      problems.push(`${where}: unknown equipment.`);
    }
    if (e.locations.length === 0 || !e.locations.every(isWorkoutLocation)) {
      problems.push(`${where}: needs at least one known location.`);
    }
    if (!(TRAINING_EXPERIENCE_LEVELS as readonly string[]).includes(e.difficulty)) {
      problems.push(`${where}: unknown difficulty.`);
    }
    if (!isExerciseTier(e.tier) || !isFatigueCost(e.fatigue)) {
      problems.push(`${where}: unknown tier or fatigue cost.`);
    }
    if (!e.preferredFor.every((style) => (PROGRAM_STYLES as readonly string[]).includes(style))) {
      problems.push(`${where}: unknown program style in preferredFor.`);
    }
  }
  return problems;
}

/** Chains must reference catalog exercises, include their entry, and not overlap. */
export function validateProgressionChains(chains: readonly ProgressionChain[], catalog: readonly Exercise[]): string[] {
  const problems: string[] = [];
  const ids = new Set(catalog.map((e) => e.id));
  const used = new Set<string>();
  for (const chain of chains) {
    if (chain.steps.length < 2) {
      problems.push(`Chain "${chain.id}" needs at least two steps.`);
    }
    if (!chain.steps.includes(chain.entry)) {
      problems.push(`Chain "${chain.id}" entry is not one of its steps.`);
    }
    for (const step of chain.steps) {
      if (!ids.has(step)) {
        problems.push(`Chain "${chain.id}" references unknown exercise "${step}".`);
      }
      if (used.has(step)) {
        problems.push(`Exercise "${step}" appears in more than one chain.`);
      }
      used.add(step);
    }
  }
  return problems;
}
