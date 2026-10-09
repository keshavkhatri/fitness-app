import { EXERCISE_LIBRARY, PROGRESSION_CHAINS } from './exercise-library';
import { Exercise } from './exercise.model';
import { ChainLookup, SelectionContext, isExerciseAvailable } from './exercise-selection';
import { chainPositionFor, prescribe, prescriptionProfileFor, progressionFor } from './prescription';
import { DEFAULT_WORKOUT_CONFIG as CONFIG } from './workout-config';
import { WorkoutGenerationInput } from './workout-input.model';

const byId = new Map(EXERCISE_LIBRARY.map((e) => [e.id, e]));
const ex = (id: string) => byId.get(id) as Exercise;
const CHAINS = new Map<string, ChainLookup>();
for (const chain of PROGRESSION_CHAINS) {
  chain.steps.forEach((id, index) => CHAINS.set(id, { chain, index, entryIndex: chain.steps.indexOf(chain.entry) }));
}

const context = (overrides: Partial<WorkoutGenerationInput> = {}): SelectionContext => {
  const input: WorkoutGenerationInput = {
    goal: 'lose-fat',
    experience: 'beginner',
    daysPerWeek: 3,
    locations: ['home'],
    equipment: [],
    ...overrides,
  };
  return {
    input,
    style: CONFIG.programStyleByGoal[input.goal],
    config: CONFIG,
    pool: EXERCISE_LIBRARY.filter((e) => isExerciseAvailable(e, input)),
    chains: CHAINS,
  };
};

describe('prescription', () => {
  describe('profiles', () => {
    it.each<[string, Parameters<typeof prescriptionProfileFor>[1], string]>([
      ['back-squat', 'primary', 'primary-compound'],
      ['back-squat', 'secondary', 'secondary-compound'],
      ['bulgarian-split-squat', 'secondary', 'unilateral-compound'],
      ['leg-curl', 'accessory', 'accessory'],
      ['leg-press', 'accessory', 'accessory'],
      ['bodyweight-squat', 'primary', 'low-load'],
      ['glute-bridge', 'secondary', 'low-load'],
      ['band-row', 'secondary', 'low-load'],
      ['plank', 'core', 'core'],
      ['burpees', 'conditioning', 'conditioning'],
    ])('%s as %s → %s', (id, role, profile) => {
      expect(prescriptionProfileFor(ex(id), role)).toBe(profile);
    });
  });

  it('low-loadability exercises get higher reps and shorter rest than loaded compounds', () => {
    const squat = prescribe(ex('bodyweight-squat'), 'primary', 'hypertrophy', 'beginner', CONFIG);
    const legPress = prescribe(ex('leg-press'), 'primary', 'hypertrophy', 'beginner', CONFIG);
    expect(squat.profile).toBe('low-load');
    expect(squat.target).toEqual({ kind: 'reps', min: 10, max: 20 });
    expect(squat.restSeconds).toBe(60);
    expect(legPress.target).toEqual({ kind: 'reps', min: 6, max: 10 });
    expect(legPress.restSeconds).toBe(120);
    expect(squat.notes).toContain('bodyweight');
  });

  it('strength: Bulgarian split squats are not programmed like heavy bilateral lifts', () => {
    const bss = prescribe(ex('bulgarian-split-squat'), 'secondary', 'strength', 'intermediate', CONFIG);
    const squat = prescribe(ex('back-squat'), 'primary', 'strength', 'intermediate', CONFIG);
    expect(bss.profile).toBe('unilateral-compound');
    expect(bss.target).toEqual({ kind: 'reps', min: 8, max: 10 });
    expect(bss.restSeconds).toBeLessThan(squat.restSeconds);
    expect(bss.notes).toContain('per-side');
    expect(squat.target).toEqual({ kind: 'reps', min: 4, max: 6 });
  });

  it('timed exercises get a time target', () => {
    const plank = prescribe(ex('plank'), 'core', 'general', 'beginner', CONFIG);
    expect(plank.target.kind).toBe('time');
    expect(plank.notes).toContain('time-based');
  });

  describe('progression chains', () => {
    it('positions an exercise in its chain with performable neighbours', () => {
      expect(chainPositionFor(ex('push-up'), context(), byId)).toEqual({
        chainId: 'push-up',
        regression: 'incline-push-up',
        progression: 'decline-push-up',
      });
    });

    it('skips neighbours the user cannot perform (equipment), but not harder ones above their level', () => {
      // Bulgarian split squat needs a bench: without one there is no next knee-dominant step.
      expect(chainPositionFor(ex('split-squat'), context(), byId)).toEqual({
        chainId: 'bodyweight-knee-dominant',
        regression: 'bodyweight-squat',
        progression: null,
      });
      // Archer push-up is advanced, yet it is where a beginner's progression leads.
      expect(chainPositionFor(ex('decline-push-up'), context(), byId)?.progression).toBe('archer-push-up');
    });

    it('exercises outside any chain have no chain position', () => {
      expect(chainPositionFor(ex('leg-press'), context({ locations: ['gym'] }), byId)).toBeNull();
    });

    it('low-load rep progression carries the chain; loaded exercises use double progression', () => {
      expect(progressionFor(ex('push-up'), { kind: 'reps', min: 10, max: 20 }, context(), byId)).toEqual({
        type: 'rep-progression',
        lowerRepBound: 10,
        upperRepBound: 20,
        advanceWhen: 'all-sets-at-upper-bound',
        thenProgressBy: 'harder-variation',
        chain: { chainId: 'push-up', regression: 'incline-push-up', progression: 'decline-push-up' },
      });
      expect(progressionFor(ex('leg-press'), { kind: 'reps', min: 6, max: 10 }, context({ goal: 'build-muscle', locations: ['gym'] }), byId)).toEqual({
        type: 'double-progression',
        lowerRepBound: 6,
        upperRepBound: 10,
        loadIncreasePercent: 2.5,
        advanceWhen: 'all-sets-at-upper-bound',
      });
    });

    it('timed chain members progress by time, then along the chain', () => {
      const plank = progressionFor(ex('plank'), { kind: 'time', seconds: 30 }, context({ equipment: ['ab-wheel'] }), byId);
      expect(plank).toMatchObject({
        type: 'time-progression',
        chain: { chainId: 'anti-extension', regression: 'dead-bug', progression: 'ab-wheel-rollout' },
      });
    });
  });
});
