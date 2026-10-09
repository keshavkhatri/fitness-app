import { EXERCISE_LIBRARY, PROGRESSION_CHAINS, validateExerciseCatalog, validateProgressionChains } from './exercise-library';
import { Exercise, ProgressionChain } from './exercise.model';
import { SESSION_TEMPLATES } from './session-templates';
import { MOVEMENT_PATTERNS } from './workout-taxonomy';

const byId = new Map(EXERCISE_LIBRARY.map((e) => [e.id, e]));

describe('exercise library', () => {
  it('is structurally valid', () => {
    expect(validateExerciseCatalog(EXERCISE_LIBRARY)).toEqual([]);
  });

  it('contains the core exercises the programming relies on', () => {
    for (const id of [
      'barbell-bench-press',
      'dumbbell-bench-press',
      'push-up',
      'incline-dumbbell-press',
      'machine-chest-press',
      'lat-pulldown',
      'pull-up',
      'assisted-pull-up',
      'seated-cable-row',
      'one-arm-dumbbell-row',
      'chest-supported-row',
      'overhead-press',
      'dumbbell-shoulder-press',
      'dumbbell-lateral-raise',
      'rear-delt-fly',
      'back-squat',
      'goblet-squat',
      'leg-press',
      'romanian-deadlift',
      'deadlift',
      'hip-thrust',
      'leg-curl',
      'leg-extension',
      'walking-lunge',
      'bulgarian-split-squat',
      'calf-raise',
      'barbell-curl',
      'dumbbell-curl',
      'hammer-curl',
      'cable-curl',
      'triceps-pushdown',
      'overhead-triceps-extension',
      'dumbbell-triceps-extension',
      'plank',
      'dead-bug',
      'hanging-knee-raise',
      'cable-crunch',
      'cable-pallof-press',
      'ab-wheel-rollout',
    ]) {
      expect(byId.has(id), id).toBe(true);
    }
  });

  it('covers every movement pattern', () => {
    for (const pattern of MOVEMENT_PATTERNS) {
      expect(EXERCISE_LIBRARY.some((e) => e.pattern === pattern), pattern).toBe(true);
    }
  });

  it('marks gym equipment correctly (spot checks)', () => {
    expect(byId.get('back-squat')?.requires).toEqual(['barbell', 'rack']);
    expect(byId.get('seated-cable-row')?.requires).toEqual(['cable']);
    expect(byId.get('machine-chest-press')?.locations).toEqual(['gym']);
    expect(byId.get('push-up')?.requires).toEqual([]);
  });

  describe('programming metadata', () => {
    it('distinguishes true pulls from scapular work', () => {
      for (const id of ['seated-cable-row', 'barbell-row', 'pull-up', 'lat-pulldown', 'band-row', 'one-arm-dumbbell-row']) {
        expect(byId.get(id)?.movementClass, id).toBe('full');
      }
      for (const id of ['prone-y-raise', 'reverse-snow-angel']) {
        expect(byId.get(id)?.movementClass, id).toBe('scapular');
      }
    });

    it('has no true bodyweight pull: no-equipment pulling is honestly scapular only', () => {
      const pulls = EXERCISE_LIBRARY.filter((e) => e.pattern.endsWith('-pull') && e.requires.length === 0);
      expect(pulls.length).toBeGreaterThan(0);
      expect(pulls.every((e) => e.movementClass !== 'full')).toBe(true);
    });

    it('marks every band-only exercise as a low-loadability fallback', () => {
      const bands = EXERCISE_LIBRARY.filter((e) => e.requires.length === 1 && e.requires[0] === 'resistance-band');
      expect(bands.length).toBeGreaterThan(0);
      for (const e of bands) {
        expect(e.tier, e.id).toBe('fallback');
        expect(e.loadability, e.id).toBe('low');
      }
    });

    it('marks the heavy barbell lifts as high fatigue', () => {
      for (const id of ['back-squat', 'front-squat', 'deadlift']) {
        expect(byId.get(id)?.fatigue, id).toBe('high');
      }
      expect(EXERCISE_LIBRARY.filter((e) => e.fatigue === 'high').every((e) => e.requires.includes('barbell'))).toBe(true);
    });

    it('isolation exercises are never high fatigue', () => {
      expect(EXERCISE_LIBRARY.filter((e) => e.mechanics === 'isolation').every((e) => e.fatigue === 'low')).toBe(true);
    });
  });

  describe('progression chains', () => {
    const chain = (id: string) => PROGRESSION_CHAINS.find((c) => c.id === id) as ProgressionChain;

    it('are valid against the catalog', () => {
      expect(validateProgressionChains(PROGRESSION_CHAINS, EXERCISE_LIBRARY)).toEqual([]);
    });

    it('push-up chain: incline (regression) → push-up (entry) → decline → archer', () => {
      expect(chain('push-up')).toEqual({
        id: 'push-up',
        steps: ['incline-push-up', 'push-up', 'decline-push-up', 'archer-push-up'],
        entry: 'push-up',
      });
    });

    it('every step of a chain can fill the same training objective, and steps never get easier', () => {
      const rank = { beginner: 0, intermediate: 1, advanced: 2 } as const;
      const objectives = SESSION_TEMPLATES.flatMap((t) => t.objectives);
      for (const c of PROGRESSION_CHAINS) {
        const steps = c.steps.map((id) => byId.get(id) as Exercise);
        expect(objectives.some((o) => steps.every((s) => o.patterns.includes(s.pattern))), c.id).toBe(true);
        for (let i = 1; i < steps.length; i++) {
          expect(rank[steps[i].difficulty] >= rank[steps[i - 1].difficulty], `${c.id}: ${steps[i].id}`).toBe(true);
        }
      }
    });

    it.each<[string, ProgressionChain[]]>([
      ['single step', [{ id: 'x', steps: ['push-up'], entry: 'push-up' }]],
      ['entry outside the chain', [{ id: 'x', steps: ['incline-push-up', 'push-up'], entry: 'plank' }]],
      ['unknown exercise', [{ id: 'x', steps: ['push-up', 'one-arm-push-up'], entry: 'push-up' }]],
      ['exercise in two chains', [
        { id: 'x', steps: ['incline-push-up', 'push-up'], entry: 'push-up' },
        { id: 'y', steps: ['push-up', 'decline-push-up'], entry: 'push-up' },
      ]],
    ])('rejects %s', (_, chains) => {
      expect(validateProgressionChains(chains, EXERCISE_LIBRARY)).not.toEqual([]);
    });
  });

  describe('validation catches broken entries', () => {
    const base = byId.get('push-up') as Exercise;
    it.each([
      ['duplicate id', [base, base]],
      ['non-kebab id', [{ ...base, id: 'Push Up' }]],
      ['unknown pattern', [{ ...base, pattern: 'jumping' as never }]],
      ['no primary muscles', [{ ...base, primaryMuscles: [] }]],
      ['unknown equipment', [{ ...base, requires: ['kettlebell' as never] }]],
      ['no locations', [{ ...base, locations: [] }]],
      ['unknown movement class', [{ ...base, movementClass: 'wobbly' as never }]],
      ['unknown tier', [{ ...base, tier: 'legendary' as never }]],
      ['unknown fatigue cost', [{ ...base, fatigue: 'extreme' as never }]],
      ['empty catalog', []],
    ] as [string, Exercise[]][])('%s', (_, catalog) => {
      expect(validateExerciseCatalog(catalog)).not.toEqual([]);
    });
  });
});
