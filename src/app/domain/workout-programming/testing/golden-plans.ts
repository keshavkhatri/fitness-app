import { WorkoutGenerationInput } from '../workout-input.model';
import { WORKOUT_EQUIPMENT } from '../workout-taxonomy';

/**
 * Golden fixtures: representative plans pinned exactly (ids, split, session
 * names, duration estimates, exercise order and sets). Any change to
 * programming rules, configuration or the catalog that alters these plans
 * fails loudly, which is the point: such a change needs a deliberate fixture
 * update (and a new workoutProgrammingVersion once plans are persisted).
 *
 * A–G are the representative plans reviewed in the v2 programming quality pass.
 */
export interface GoldenPlan {
  readonly name: string;
  readonly input: WorkoutGenerationInput;
  readonly expected: {
    readonly id: string;
    readonly split: string;
    readonly sessions: readonly {
      readonly name: string;
      readonly minutes: number;
      readonly exercises: readonly string[];
      readonly sets: readonly number[];
    }[];
  };
}

const FULL_GYM = [...WORKOUT_EQUIPMENT];

export const GOLDEN_GENERATED_AT = '2026-10-08';

export const GOLDEN_PLANS: readonly GoldenPlan[] = [
  {
    name: 'A-beginner-home-no-equipment-fat-loss-3-days',
    input: { goal: 'lose-fat', experience: 'beginner', daysPerWeek: 3, locations: ['home'], equipment: [] },
    expected: {
      id: 'wp-v2-4ea7ce3f',
      split: 'full-body',
      sessions: [
        { name: 'Full Body A', minutes: 35, exercises: ['bodyweight-squat', 'push-up', 'glute-bridge', 'prone-y-raise', 'mountain-climbers'], sets: [3, 3, 3, 3, 3] },
        { name: 'Full Body B', minutes: 35, exercises: ['glute-bridge', 'push-up', 'split-squat', 'prone-y-raise', 'mountain-climbers'], sets: [3, 3, 2, 3, 3] },
        { name: 'Full Body C', minutes: 35, exercises: ['bodyweight-squat', 'push-up', 'glute-bridge', 'prone-y-raise', 'mountain-climbers'], sets: [3, 3, 2, 4, 3] },
      ],
    },
  },
  {
    name: 'B-beginner-gym-muscle-3-days',
    input: { goal: 'build-muscle', experience: 'beginner', daysPerWeek: 3, locations: ['gym'], equipment: FULL_GYM },
    expected: {
      id: 'wp-v2-48c51aa4',
      split: 'full-body',
      sessions: [
        { name: 'Full Body A', minutes: 35, exercises: ['leg-press', 'machine-chest-press', 'seated-cable-row', 'cable-pull-through', 'cable-pallof-press'], sets: [3, 3, 3, 3, 2] },
        { name: 'Full Body B', minutes: 35, exercises: ['dumbbell-romanian-deadlift', 'lat-pulldown', 'machine-shoulder-press', 'dumbbell-reverse-lunge', 'cable-crunch'], sets: [3, 4, 3, 2, 2] },
        { name: 'Full Body C', minutes: 35, exercises: ['leg-press', 'seated-cable-row', 'dumbbell-bench-press', 'dumbbell-romanian-deadlift', 'farmers-carry'], sets: [3, 4, 3, 2, 2] },
      ],
    },
  },
  {
    name: 'C-intermediate-gym-muscle-4-days',
    input: { goal: 'build-muscle', experience: 'intermediate', daysPerWeek: 4, locations: ['gym'], equipment: FULL_GYM },
    expected: {
      id: 'wp-v2-67450114',
      split: 'upper-lower',
      sessions: [
        { name: 'Upper A', minutes: 50, exercises: ['barbell-bench-press', 'barbell-row', 'overhead-press', 'pull-up', 'cable-lateral-raise', 'barbell-curl', 'dumbbell-triceps-extension'], sets: [4, 3, 3, 3, 3, 3, 3] },
        { name: 'Lower A', minutes: 45, exercises: ['back-squat', 'dumbbell-romanian-deadlift', 'bulgarian-split-squat', 'leg-curl', 'leg-extension', 'calf-raise', 'dead-bug'], sets: [3, 3, 3, 3, 2, 3, 2] },
        { name: 'Upper B', minutes: 50, exercises: ['barbell-bench-press', 'barbell-row', 'overhead-press', 'pull-up', 'dumbbell-lateral-raise', 'cable-curl', 'overhead-triceps-extension'], sets: [4, 3, 3, 3, 3, 3, 3] },
        { name: 'Lower B', minutes: 40, exercises: ['romanian-deadlift', 'leg-press', 'dumbbell-reverse-lunge', 'leg-curl', 'calf-raise', 'leg-extension', 'cable-crunch'], sets: [3, 3, 3, 3, 3, 2, 2] },
      ],
    },
  },
  {
    name: 'D-intermediate-gym-strength-4-days',
    input: { goal: 'get-stronger', experience: 'intermediate', daysPerWeek: 4, locations: ['gym'], equipment: FULL_GYM },
    expected: {
      id: 'wp-v2-a8e6909f',
      split: 'upper-lower',
      sessions: [
        { name: 'Upper A', minutes: 50, exercises: ['barbell-bench-press', 'barbell-row', 'overhead-press', 'pull-up', 'cable-lateral-raise', 'barbell-curl'], sets: [4, 4, 3, 3, 2, 2] },
        { name: 'Lower A', minutes: 40, exercises: ['back-squat', 'romanian-deadlift', 'bulgarian-split-squat', 'leg-curl', 'leg-extension', 'dead-bug'], sets: [4, 3, 3, 2, 2, 2] },
        { name: 'Upper B', minutes: 50, exercises: ['barbell-bench-press', 'barbell-row', 'overhead-press', 'pull-up', 'dumbbell-lateral-raise', 'cable-curl'], sets: [4, 4, 3, 3, 2, 2] },
        { name: 'Lower B', minutes: 45, exercises: ['deadlift', 'leg-press', 'dumbbell-reverse-lunge', 'leg-curl', 'calf-raise', 'cable-crunch'], sets: [4, 3, 3, 2, 3, 2] },
      ],
    },
  },
  {
    name: 'E-advanced-gym-muscle-6-days',
    input: { goal: 'build-muscle', experience: 'advanced', daysPerWeek: 6, locations: ['gym'], equipment: FULL_GYM },
    expected: {
      id: 'wp-v2-f414aced',
      split: 'push-pull-legs',
      sessions: [
        { name: 'Push A', minutes: 50, exercises: ['barbell-bench-press', 'overhead-press', 'dumbbell-bench-press', 'dumbbell-lateral-raise', 'dumbbell-triceps-extension', 'triceps-pushdown', 'cable-crunch'], sets: [4, 3, 3, 4, 3, 3, 3] },
        { name: 'Pull A', minutes: 50, exercises: ['pull-up', 'barbell-row', 'seated-cable-row', 'rear-delt-fly', 'barbell-curl', 'hammer-curl', 'cable-pallof-press'], sets: [4, 3, 3, 3, 3, 3, 3] },
        { name: 'Legs A', minutes: 45, exercises: ['back-squat', 'dumbbell-romanian-deadlift', 'bulgarian-split-squat', 'leg-curl', 'leg-extension', 'calf-raise', 'ab-wheel-rollout'], sets: [4, 3, 3, 3, 3, 3, 3] },
        { name: 'Push B', minutes: 50, exercises: ['barbell-bench-press', 'dumbbell-shoulder-press', 'machine-chest-press', 'cable-lateral-raise', 'overhead-triceps-extension', 'dumbbell-triceps-extension', 'cable-crunch'], sets: [4, 3, 3, 4, 3, 3, 3] },
        { name: 'Pull B', minutes: 50, exercises: ['pull-up', 'chest-supported-row', 'one-arm-dumbbell-row', 'reverse-pec-deck', 'dumbbell-curl', 'cable-curl', 'cable-pallof-press'], sets: [4, 3, 3, 3, 3, 3, 3] },
        { name: 'Legs B', minutes: 45, exercises: ['romanian-deadlift', 'front-squat', 'dumbbell-reverse-lunge', 'leg-curl', 'calf-raise', 'leg-extension', 'cable-crunch'], sets: [4, 3, 3, 3, 3, 2, 3] },
      ],
    },
  },
  {
    name: 'F-beginner-gym-muscle-6-days-with-recovery',
    input: { goal: 'build-muscle', experience: 'beginner', daysPerWeek: 6, locations: ['gym'], equipment: FULL_GYM },
    expected: {
      id: 'wp-v2-6f24b351',
      split: 'full-body-with-recovery',
      sessions: [
        { name: 'Full Body A', minutes: 35, exercises: ['leg-press', 'machine-chest-press', 'seated-cable-row', 'cable-pull-through', 'cable-pallof-press'], sets: [3, 3, 3, 3, 2] },
        { name: 'Light Activity', minutes: 30, exercises: [], sets: [] },
        { name: 'Full Body B', minutes: 35, exercises: ['dumbbell-romanian-deadlift', 'lat-pulldown', 'machine-shoulder-press', 'dumbbell-reverse-lunge', 'cable-crunch'], sets: [3, 4, 3, 2, 2] },
        { name: 'Light Activity', minutes: 30, exercises: [], sets: [] },
        { name: 'Full Body C', minutes: 35, exercises: ['leg-press', 'seated-cable-row', 'dumbbell-bench-press', 'dumbbell-romanian-deadlift', 'farmers-carry'], sets: [3, 4, 3, 2, 2] },
        { name: 'Optional Conditioning', minutes: 20, exercises: [], sets: [] },
      ],
    },
  },
  {
    name: 'G-beginner-gym-muscle-5-days-with-recovery',
    input: { goal: 'build-muscle', experience: 'beginner', daysPerWeek: 5, locations: ['gym'], equipment: FULL_GYM },
    expected: {
      id: 'wp-v2-ca90e0d6',
      split: 'full-body-with-recovery',
      sessions: [
        { name: 'Full Body A', minutes: 35, exercises: ['leg-press', 'machine-chest-press', 'seated-cable-row', 'cable-pull-through', 'cable-pallof-press'], sets: [3, 3, 3, 3, 2] },
        { name: 'Light Activity', minutes: 30, exercises: [], sets: [] },
        { name: 'Full Body B', minutes: 35, exercises: ['dumbbell-romanian-deadlift', 'lat-pulldown', 'machine-shoulder-press', 'dumbbell-reverse-lunge', 'cable-crunch'], sets: [3, 4, 3, 2, 2] },
        { name: 'Light Activity', minutes: 30, exercises: [], sets: [] },
        { name: 'Full Body C', minutes: 35, exercises: ['leg-press', 'seated-cable-row', 'dumbbell-bench-press', 'dumbbell-romanian-deadlift', 'farmers-carry'], sets: [3, 4, 3, 2, 2] },
      ],
    },
  },
  {
    name: 'intermediate-gym-recomposition-4-days',
    input: { goal: 'recomposition', experience: 'intermediate', daysPerWeek: 4, locations: ['gym'], equipment: FULL_GYM },
    expected: {
      id: 'wp-v2-eedafcbf',
      split: 'upper-lower',
      sessions: [
        { name: 'Upper A', minutes: 50, exercises: ['barbell-bench-press', 'barbell-row', 'overhead-press', 'pull-up', 'cable-lateral-raise', 'barbell-curl', 'dumbbell-triceps-extension'], sets: [4, 3, 3, 3, 3, 3, 3] },
        { name: 'Lower A', minutes: 45, exercises: ['back-squat', 'dumbbell-romanian-deadlift', 'bulgarian-split-squat', 'leg-curl', 'leg-extension', 'calf-raise', 'dead-bug'], sets: [3, 3, 3, 3, 2, 3, 2] },
        { name: 'Upper B', minutes: 50, exercises: ['barbell-bench-press', 'barbell-row', 'overhead-press', 'pull-up', 'dumbbell-lateral-raise', 'cable-curl', 'overhead-triceps-extension'], sets: [4, 3, 3, 3, 3, 3, 3] },
        { name: 'Lower B', minutes: 40, exercises: ['romanian-deadlift', 'leg-press', 'dumbbell-reverse-lunge', 'leg-curl', 'calf-raise', 'leg-extension', 'cable-crunch'], sets: [3, 3, 3, 3, 3, 2, 2] },
      ],
    },
  },
  {
    name: 'intermediate-gym-strength-5-days',
    input: { goal: 'get-stronger', experience: 'intermediate', daysPerWeek: 5, locations: ['gym'], equipment: FULL_GYM },
    expected: {
      id: 'wp-v2-116f82ee',
      split: 'upper-lower-push-pull-legs',
      sessions: [
        { name: 'Upper', minutes: 50, exercises: ['barbell-bench-press', 'barbell-row', 'overhead-press', 'pull-up', 'cable-lateral-raise', 'barbell-curl'], sets: [4, 4, 3, 3, 2, 2] },
        { name: 'Lower', minutes: 40, exercises: ['back-squat', 'romanian-deadlift', 'bulgarian-split-squat', 'leg-curl', 'leg-extension', 'dead-bug'], sets: [4, 3, 2, 2, 2, 2] },
        { name: 'Push', minutes: 40, exercises: ['barbell-bench-press', 'overhead-press', 'machine-chest-press', 'dumbbell-lateral-raise', 'dumbbell-triceps-extension', 'cable-crunch'], sets: [4, 3, 3, 2, 2, 2] },
        { name: 'Pull', minutes: 40, exercises: ['pull-up', 'barbell-row', 'seated-cable-row', 'reverse-pec-deck', 'cable-curl', 'cable-pallof-press'], sets: [4, 3, 2, 2, 2, 2] },
        { name: 'Legs', minutes: 40, exercises: ['back-squat', 'hip-thrust', 'dumbbell-reverse-lunge', 'leg-curl', 'leg-extension', 'plank'], sets: [4, 3, 2, 2, 2, 2] },
      ],
    },
  },
  {
    name: 'advanced-gym-general-fitness-6-days',
    input: { goal: 'improve-fitness', experience: 'advanced', daysPerWeek: 6, locations: ['gym'], equipment: FULL_GYM },
    expected: {
      id: 'wp-v2-76069580',
      split: 'push-pull-legs',
      sessions: [
        { name: 'Push A', minutes: 45, exercises: ['barbell-bench-press', 'overhead-press', 'dumbbell-bench-press', 'dumbbell-lateral-raise', 'dumbbell-triceps-extension', 'cable-crunch', 'bike-intervals'], sets: [3, 3, 3, 3, 3, 3, 4] },
        { name: 'Pull A', minutes: 45, exercises: ['pull-up', 'seated-cable-row', 'one-arm-dumbbell-row', 'rear-delt-fly', 'barbell-curl', 'cable-pallof-press', 'bike-intervals'], sets: [3, 2, 2, 3, 3, 3, 4] },
        { name: 'Legs A', minutes: 45, exercises: ['back-squat', 'dumbbell-romanian-deadlift', 'bulgarian-split-squat', 'leg-curl', 'leg-extension', 'ab-wheel-rollout', 'bike-intervals'], sets: [3, 3, 3, 3, 2, 3, 4] },
        { name: 'Push B', minutes: 50, exercises: ['barbell-bench-press', 'dumbbell-shoulder-press', 'archer-push-up', 'cable-lateral-raise', 'overhead-triceps-extension', 'hanging-knee-raise', 'bike-intervals'], sets: [3, 3, 3, 3, 3, 3, 4] },
        { name: 'Pull B', minutes: 40, exercises: ['pull-up', 'barbell-row', 'chest-supported-row', 'reverse-pec-deck', 'dumbbell-curl', 'bird-dog', 'bike-intervals'], sets: [3, 2, 2, 3, 3, 3, 4] },
        { name: 'Legs B', minutes: 45, exercises: ['romanian-deadlift', 'front-squat', 'dumbbell-reverse-lunge', 'leg-curl', 'calf-raise', 'cable-crunch', 'bike-intervals'], sets: [3, 3, 3, 3, 3, 3, 4] },
      ],
    },
  },
];
