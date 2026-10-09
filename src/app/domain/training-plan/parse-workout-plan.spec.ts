import { PRIMARY_GOALS, TRAINING_EXPERIENCE_LEVELS } from '../fitness-profile';
import {
  EXERCISE_LIBRARY,
  WORKOUT_EQUIPMENT,
  WORKOUT_FREQUENCIES,
  WORKOUT_LOCATIONS,
  WorkoutEquipment,
  WorkoutPlan,
  generateWorkoutPlan,
} from '../workout-programming';
import { parseWorkoutPlan } from './parse-workout-plan';

const EQUIPMENT_SETS: readonly (readonly WorkoutEquipment[])[] = [[], ['dumbbells', 'bench'], ['resistance-band'], [...WORKOUT_EQUIPMENT]];

function* allPlans(): Generator<WorkoutPlan> {
  for (const goal of PRIMARY_GOALS) {
    for (const experience of TRAINING_EXPERIENCE_LEVELS) {
      for (const daysPerWeek of WORKOUT_FREQUENCIES) {
        for (const location of WORKOUT_LOCATIONS) {
          for (const equipment of EQUIPMENT_SETS) {
            const result = generateWorkoutPlan(
              { goal, experience, daysPerWeek, locations: [location], equipment },
              { generatedAt: '2026-10-08', assumptions: ['combined-gym-and-home-equipment'] },
            );
            if (result.ok) {
              yield result.value;
            }
          }
        }
      }
    }
  }
}

const sample = (): WorkoutPlan => {
  const result = generateWorkoutPlan(
    { goal: 'lose-fat', experience: 'beginner', daysPerWeek: 6, locations: ['home'], equipment: [] },
    { generatedAt: '2026-10-08' },
  );
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
};
/** A JSON copy of the sample with one change applied. */
const tampered = (change: (plan: any) => void): unknown => {
  const copy = JSON.parse(JSON.stringify(sample()));
  change(copy);
  return copy;
};

/**
 * Generating and round-tripping all 900 plans is CPU-bound: ~4.3 s alone, and
 * up to ~11.5 s measured when the full suite runs files in parallel. The
 * default 5 s per-test timeout is too tight for this one test only.
 */
const ALL_PLANS_TIMEOUT_MS = 30_000;

describe('parseWorkoutPlan', () => {
  it('round-trips every engine plan (900 combinations) through JSON unchanged', () => {
    let count = 0;
    for (const plan of allPlans()) {
      count++;
      expect(parseWorkoutPlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
    }
    expect(count).toBe(900);
  }, ALL_PLANS_TIMEOUT_MS);

  it('drops unknown extra fields', () => {
    const parsed = parseWorkoutPlan(
      tampered((p) => {
        p.extra = 1;
        p.sessions[0].exercises[0].legacyNote = 'x';
      }),
    );
    expect(parsed).toEqual(sample());
  });

  it.each<[string, (plan: any) => void]>([
    ['unknown programming version', (p) => (p.workoutProgrammingVersion = 'v1')],
    ['malformed generation date', (p) => (p.generatedAt = '08/10/2026')],
    ['unknown goal', (p) => (p.goal = 'get-huge')],
    ['frequency out of range', (p) => (p.daysPerWeek = 7)],
    ['session count ≠ frequency', (p) => p.sessions.pop()],
    ['sessions out of day order', (p) => p.sessions.reverse()],
    ['session type disagrees with the split', (p) => (p.split.sessionTypes[0] = 'push')],
    ['unknown session kind', (p) => (p.sessions[0].kind = 'cardio')],
    ['activity day with exercises', (p) => (p.sessions[1].exercises = [p.sessions[0].exercises[0]])],
    ['resistance session without exercises', (p) => (p.sessions[0].exercises = [])],
    ['exercise not in the catalog', (p) => (p.sessions[0].exercises[0].exerciseId = 'jumping-jack-deluxe')],
    ['chain step not in the catalog', (p) => (p.sessions[0].exercises.find((e: any) => e.progression.chain).progression.chain.progression = 'nope')],
    ['exercises out of order', (p) => (p.sessions[0].exercises[0].order = 3)],
    ['zero sets', (p) => (p.sessions[0].exercises[0].sets = 0)],
    ['fractional sets', (p) => (p.sessions[0].exercises[0].sets = 2.5)],
    ['inverted rep range', (p) => (p.sessions[0].exercises[0].target = { kind: 'reps', min: 12, max: 8 })],
    ['unknown target kind', (p) => (p.sessions[0].exercises[0].target = { kind: 'distance', meters: 100 })],
    ['unknown progression type', (p) => (p.sessions[0].exercises[0].progression.type = 'linear')],
    ['unknown selection reason', (p) => p.sessions[0].exercises[0].selection.reasons.push('vibes')],
    ['unknown coverage status', (p) => (p.sessions[0].objectives[0].status = 'maybe')],
    ['unknown warning', (p) => p.warnings.push({ code: 'mystery' })],
    ['missing weekly volume group', (p) => delete p.explanation.weeklyVolume.chest],
    ['unknown assumption', (p) => p.assumptions.push('free-pizza')],
    ['history-based progression claimed', (p) => (p.progressionStrategy.historyBased = true)],
    ['missing id', (p) => delete p.id],
  ])('rejects %s', (_, change) => {
    expect(parseWorkoutPlan(tampered(change))).toBeNull();
  });

  it.each([null, undefined, 42, 'plan', [], {}])('rejects %p', (value) => {
    expect(parseWorkoutPlan(value)).toBeNull();
  });

  it('checks exercises against the catalog it is given', () => {
    const json = JSON.parse(JSON.stringify(sample()));
    expect(parseWorkoutPlan(json, new Set(EXERCISE_LIBRARY.map((e) => e.id)))).not.toBeNull();
    expect(parseWorkoutPlan(json, new Set(['push-up']))).toBeNull();
  });
});
