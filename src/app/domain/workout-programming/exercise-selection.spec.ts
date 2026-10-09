import { PrimaryGoal, TrainingExperience } from '../fitness-profile';
import { EXERCISE_LIBRARY, PROGRESSION_CHAINS } from './exercise-library';
import { Exercise } from './exercise.model';
import {
  ChainLookup,
  SelectionContext,
  SelectionState,
  isExerciseAvailable,
  matchObjective,
  rankCandidates,
  selectForObjective,
} from './exercise-selection';
import { SESSION_TEMPLATES, TrainingObjective } from './session-templates';
import { DEFAULT_WORKOUT_CONFIG as CONFIG } from './workout-config';
import { WorkoutGenerationInput } from './workout-input.model';
import { WORKOUT_EQUIPMENT, WorkoutEquipment, WorkoutLocation } from './workout-taxonomy';

const byId = new Map(EXERCISE_LIBRARY.map((e) => [e.id, e]));
const ex = (id: string) => byId.get(id) as Exercise;

const CHAINS = new Map<string, ChainLookup>();
for (const chain of PROGRESSION_CHAINS) {
  chain.steps.forEach((id, index) => CHAINS.set(id, { chain, index, entryIndex: chain.steps.indexOf(chain.entry) }));
}

function context(
  overrides: Partial<WorkoutGenerationInput> & { goal?: PrimaryGoal; experience?: TrainingExperience } = {},
  catalog: readonly Exercise[] = EXERCISE_LIBRARY,
): SelectionContext {
  const input: WorkoutGenerationInput = {
    goal: 'build-muscle',
    experience: 'intermediate',
    daysPerWeek: 3,
    locations: ['gym'],
    equipment: [...WORKOUT_EQUIPMENT],
    ...overrides,
  };
  return {
    input,
    style: CONFIG.programStyleByGoal[input.goal],
    config: CONFIG,
    pool: catalog.filter((e) => isExerciseAvailable(e, input)),
    chains: CHAINS,
  };
}

const objective = (
  patterns: TrainingObjective['patterns'],
  role: TrainingObjective['role'] = 'primary',
  substituteClasses?: TrainingObjective['substituteClasses'],
): TrainingObjective => ({
  id: 'test',
  role,
  patterns,
  requirement: 'always',
  priority: 100,
  repetition: 'foundational',
  ...(substituteClasses ? { substituteClasses } : {}),
});

const state = (session: Exercise[] = [], week: string[] = [], prefersVariety = false): SelectionState => ({
  session,
  week: new Set(week),
  prefersVariety,
});

const best = (o: TrainingObjective, ctx: SelectionContext, s: SelectionState = state()) => selectForObjective(o, s, ctx);
const bestId = (o: TrainingObjective, ctx: SelectionContext, s: SelectionState = state()) => best(o, ctx, s)?.exercise.id;

describe('exercise selection', () => {
  describe('availability (hard filters)', () => {
    const home = (equipment: WorkoutEquipment[], locations: WorkoutLocation[] = ['home']) =>
      ({ goal: 'lose-fat', experience: 'advanced', daysPerWeek: 3, locations, equipment }) as WorkoutGenerationInput;

    it('home with no equipment never allows barbell, cable or machine exercises', () => {
      for (const id of ['back-squat', 'seated-cable-row', 'machine-chest-press', 'lat-pulldown', 'leg-press']) {
        expect(isExerciseAvailable(ex(id), home([])), id).toBe(false);
      }
      expect(isExerciseAvailable(ex('push-up'), home([]))).toBe(true);
    });

    it('requires ALL listed equipment', () => {
      expect(isExerciseAvailable(ex('dumbbell-bench-press'), home(['dumbbells']))).toBe(false);
      expect(isExerciseAvailable(ex('dumbbell-bench-press'), home(['dumbbells', 'bench']))).toBe(true);
      expect(isExerciseAvailable(ex('back-squat'), home(['barbell']))).toBe(false); // no rack
    });

    it('respects location even when equipment is present', () => {
      expect(isExerciseAvailable(ex('leg-press'), home(['machine'], ['home']))).toBe(false);
      expect(isExerciseAvailable(ex('leg-press'), home(['machine'], ['gym', 'home']))).toBe(true);
      expect(isExerciseAvailable(ex('goblet-squat'), home(['dumbbells'], ['outdoor']))).toBe(false);
    });

    it('does not offer exercises above the user’s experience', () => {
      const input = (experience: TrainingExperience) =>
        ({ ...home([...WORKOUT_EQUIPMENT], ['gym']), experience }) as WorkoutGenerationInput;
      expect(isExerciseAvailable(ex('back-squat'), input('beginner'))).toBe(false);
      expect(isExerciseAvailable(ex('back-squat'), input('intermediate'))).toBe(true);
      expect(isExerciseAvailable(ex('front-squat'), input('intermediate'))).toBe(false);
      expect(isExerciseAvailable(ex('front-squat'), input('advanced'))).toBe(true);
    });
  });

  describe('objective matching: honest movement classes', () => {
    const pull = objective(['horizontal-pull', 'vertical-pull']);

    it('a full pull satisfies a pull objective directly', () => {
      expect(matchObjective(ex('seated-cable-row'), pull)).toEqual({ patternIndex: 0, substitute: false });
      expect(matchObjective(ex('pull-up'), pull)).toEqual({ patternIndex: 1, substitute: false });
    });

    it('scapular work is NOT a pull unless the objective allows it, and then only as a substitute', () => {
      expect(ex('prone-y-raise').movementClass).toBe('scapular');
      expect(matchObjective(ex('prone-y-raise'), pull)).toBeNull();
      expect(matchObjective(ex('prone-y-raise'), objective(['horizontal-pull'], 'primary', ['scapular']))).toEqual({
        patternIndex: 0,
        substitute: true,
      });
    });

    it('postural work is not accepted where only scapular substitutes are allowed', () => {
      const postural: Exercise = { ...ex('prone-y-raise'), id: 'postural-test', movementClass: 'postural' };
      expect(matchObjective(postural, objective(['horizontal-pull'], 'primary', ['scapular']))).toBeNull();
      expect(matchObjective(postural, objective(['horizontal-pull'], 'primary', ['postural']))?.substitute).toBe(true);
    });

    it('ignores exercises outside the objective’s patterns', () => {
      expect(matchObjective(ex('push-up'), pull)).toBeNull();
    });

    it('home without equipment: the pull objective is filled by flagged scapular work, never silently', () => {
      const ctx = context({ locations: ['home'], equipment: [], experience: 'beginner', goal: 'lose-fat' });
      expect(best(pull, ctx)).toBeNull();
      const pick = best(objective(['horizontal-pull', 'vertical-pull'], 'secondary', ['scapular']), ctx);
      expect(pick?.exercise.movementClass).toBe('scapular');
      expect(pick?.substitute).toBe(true);
      expect(pick?.reasons).toContain('substitute-class');
    });

    it('prefers a true pull over a substitute whenever one exists', () => {
      const ctx = context({ locations: ['home'], equipment: ['dumbbells', 'bench'] });
      const pick = best(objective(['horizontal-pull', 'vertical-pull'], 'primary', ['scapular']), ctx);
      expect(pick?.exercise.movementClass).toBe('full');
      expect(pick?.substitute).toBe(false);
    });
  });

  describe('scoring hierarchy', () => {
    it('beginner gym user: supported machine press', () => {
      expect(bestId(objective(['horizontal-push']), context({ experience: 'beginner' }))).toBe('machine-chest-press');
    });

    it('strength: barbell main lifts when available', () => {
      const ctx = context({ goal: 'get-stronger' });
      expect(bestId(objective(['horizontal-push']), ctx)).toBe('barbell-bench-press');
      expect(bestId(objective(['squat']), ctx)).toBe('back-squat');
      expect(bestId(objective(['hinge']), ctx)).toBe('deadlift');
    });

    it('home with no equipment: push-up', () => {
      const ctx = context({ locations: ['home'], equipment: [], experience: 'beginner' });
      expect(bestId(objective(['horizontal-push']), ctx)).toBe('push-up');
    });

    it('prefers the objective’s first pattern, falling back only when needed', () => {
      const pick = best(objective(['vertical-pull', 'horizontal-pull']), context());
      expect(pick?.exercise.pattern).toBe('vertical-pull');
      expect(pick?.reasons).toContain('preferred-pattern');

      const noBar = context({ locations: ['home'], equipment: ['dumbbells', 'bench'] });
      const fallback = best(objective(['vertical-pull', 'horizontal-pull']), noBar);
      expect(fallback?.exercise.pattern).toBe('horizontal-pull');
      expect(fallback?.reasons).toContain('fallback-pattern');
    });

    it('penalises isolation exercises in main (compound) objectives', () => {
      const ranked = rankCandidates(objective(['hinge']), state(), context());
      const backExtension = ranked.find((r) => r.exercise.id === 'back-extension');
      expect(backExtension?.reasons).toContain('isolation-in-main-objective');
      expect(ranked[0].exercise.mechanics).toBe('compound');
    });

    it('in a full gym, a band (fallback tier) exercise never wins any template objective', () => {
      for (const experience of ['beginner', 'intermediate', 'advanced'] as const) {
        for (const goal of ['build-muscle', 'get-stronger', 'improve-fitness'] as const) {
          const ctx = context({ experience, goal });
          for (const o of SESSION_TEMPLATES.flatMap((t) => t.objectives)) {
            const pick = best(o, ctx);
            expect(pick?.exercise.tier, `${experience}/${goal}/${o.id}: ${pick?.exercise.id}`).not.toBe('fallback');
          }
        }
      }
    });

    it('bands are still used when they are the only option', () => {
      const ctx = context({ locations: ['outdoor'], equipment: ['resistance-band'] });
      const pick = best(objective(['horizontal-pull']), ctx);
      expect(pick?.exercise.requires).toEqual(['resistance-band']);
      expect(pick?.reasons).toContain('fallback-exercise');
    });

    it('loadable gym exercises beat bodyweight variations for hypertrophy', () => {
      const ctx = context({ experience: 'beginner' });
      expect(ex(bestId(objective(['horizontal-push'], 'secondary'), ctx, state([], ['machine-chest-press'], true))!).loadability).not.toBe(
        'low',
      );
      expect(bestId(objective(['elbow-extension'], 'accessory'), context({ experience: 'intermediate' }))).not.toBe('diamond-push-up');
    });

    it('the experience-match bonus only applies to progression-chain steps', () => {
      const diamond = rankCandidates(objective(['elbow-extension'], 'accessory'), state(), context()).find(
        (r) => r.exercise.id === 'diamond-push-up',
      );
      expect(diamond?.reasons).not.toContain('experience-match');
      const ctx = context({ locations: ['home'], equipment: [], experience: 'intermediate' });
      const decline = rankCandidates(objective(['horizontal-push']), state(), ctx).find((r) => r.exercise.id === 'decline-push-up');
      expect(decline?.reasons).toContain('experience-match');
    });

    it('does not regress below a chain’s entry step', () => {
      const ctx = context({ locations: ['home'], equipment: [], experience: 'beginner' });
      const ranked = rankCandidates(objective(['horizontal-push']), state(), ctx);
      expect(ranked[0].exercise.id).toBe('push-up');
      expect(ranked.find((r) => r.exercise.id === 'incline-push-up')?.reasons).toContain('regression-step');
    });
  });

  describe('session and weekly balance', () => {
    it('never picks an exercise already in the session', () => {
      const ctx = context();
      const first = bestId(objective(['horizontal-push']), ctx);
      const second = bestId(objective(['horizontal-push']), ctx, state([ex(first!)]));
      expect(second).toBeDefined();
      expect(second).not.toBe(first);
    });

    it('strength: no second high-fatigue barbell lift in the same session', () => {
      const ctx = context({ goal: 'get-stronger' });
      const pick = best(objective(['hinge'], 'secondary'), ctx, state([ex('back-squat')]));
      expect(pick?.exercise.fatigue).not.toBe('high');
      const deadlift = rankCandidates(objective(['hinge'], 'secondary'), state([ex('back-squat')]), ctx).find(
        (r) => r.exercise.id === 'deadlift',
      );
      expect(deadlift?.reasons).toContain('excess-fatigue-penalty');
    });

    it('"vary" objectives prefer an exercise not already used this week; foundational ones repeat', () => {
      const ctx = context();
      const o = objective(['shoulder-abduction'], 'accessory');
      const first = bestId(o, ctx)!;
      expect(bestId(o, ctx, state([], [first], true))).not.toBe(first);
      expect(bestId(o, ctx, state([], [first], false))).toBe(first);
    });

    it('breaks score ties by exercise id and says so', () => {
      const ranked = rankCandidates(objective(['elbow-flexion'], 'accessory'), state(), context({ goal: 'get-stronger' }));
      for (let i = 1; i < ranked.length; i++) {
        if (ranked[i].score === ranked[i - 1].score) {
          expect(ranked[i - 1].exercise.id < ranked[i].exercise.id).toBe(true);
        }
      }
      const tied = ranked.length > 1 && ranked[0].score === ranked[1].score;
      expect(best(objective(['elbow-flexion'], 'accessory'), context({ goal: 'get-stronger' }))?.reasons.includes('tie-broken-by-id')).toBe(
        tied,
      );
    });

    it('is deterministic', () => {
      const ctx = context({ goal: 'improve-fitness', experience: 'advanced' });
      const o = objective(['squat', 'lunge']);
      expect(rankCandidates(o, state(), ctx)).toEqual(rankCandidates(o, state(), ctx));
    });
  });
});
