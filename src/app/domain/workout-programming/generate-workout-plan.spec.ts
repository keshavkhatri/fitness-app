import { PRIMARY_GOALS, PrimaryGoal, TRAINING_EXPERIENCE_LEVELS, TrainingExperience } from '../fitness-profile';
import { EXERCISE_LIBRARY } from './exercise-library';
import { Exercise } from './exercise.model';
import { GenerationOptions, generateWorkoutPlan } from './generate-workout-plan';
import { GOLDEN_GENERATED_AT, GOLDEN_PLANS } from './testing/golden-plans';
import { DEFAULT_WORKOUT_CONFIG as CONFIG, WORKOUT_CONFIG_LIMITS } from './workout-config';
import { WorkoutGenerationInput } from './workout-input.model';
import { PlanSession, WorkoutPlan, WorkoutSession } from './workout-plan.model';
import {
  MovementPattern,
  VOLUME_GROUPS,
  WORKOUT_EQUIPMENT,
  WORKOUT_FREQUENCIES,
  WORKOUT_LOCATIONS,
  WorkoutEquipment,
  WorkoutFrequency,
  WorkoutLocation,
} from './workout-taxonomy';
import { volumeGroupsOf } from './weekly-volume';

const GENERATED_AT = '2026-10-08';
const FULL_GYM: readonly WorkoutEquipment[] = [...WORKOUT_EQUIPMENT];
const byId = new Map(EXERCISE_LIBRARY.map((e) => [e.id, e]));
const exerciseOf = (id: string) => byId.get(id) as Exercise;

const input = (overrides: Partial<WorkoutGenerationInput> = {}): WorkoutGenerationInput => ({
  goal: 'build-muscle',
  experience: 'intermediate',
  daysPerWeek: 4,
  locations: ['gym'],
  equipment: FULL_GYM,
  ...overrides,
});

function plan(i: WorkoutGenerationInput = input(), options: Partial<GenerationOptions> = {}): WorkoutPlan {
  const result = generateWorkoutPlan(i, { generatedAt: GENERATED_AT, ...options });
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

const errorOf = (i: WorkoutGenerationInput, options: Partial<GenerationOptions> = {}) => {
  const result = generateWorkoutPlan(i, { generatedAt: GENERATED_AT, ...options });
  return result.ok ? null : result.error;
};
const errorCode = (i: WorkoutGenerationInput, options: Partial<GenerationOptions> = {}) => errorOf(i, options)?.code ?? null;

const resistance = (p: WorkoutPlan): WorkoutSession[] => p.sessions.filter((s): s is WorkoutSession => s.kind === 'resistance');
const patternsOf = (session: PlanSession): MovementPattern[] => session.exercises.map((e) => exerciseOf(e.exerciseId).pattern);
const has = (session: PlanSession, ...patterns: MovementPattern[]) => patternsOf(session).some((p) => patterns.includes(p));
const idsOf = (session: PlanSession) => session.exercises.map((e) => e.exerciseId);

const EQUIPMENT_SETS: Record<string, readonly WorkoutEquipment[]> = {
  none: [],
  dumbbells: ['dumbbells', 'bench'],
  bands: ['resistance-band'],
  'full gym': FULL_GYM,
};

/** Every combination the engine supports, for property-style checks. */
function* allInputs(): Generator<WorkoutGenerationInput> {
  for (const goal of PRIMARY_GOALS) {
    for (const experience of TRAINING_EXPERIENCE_LEVELS) {
      for (const daysPerWeek of WORKOUT_FREQUENCIES) {
        for (const location of WORKOUT_LOCATIONS) {
          for (const equipment of Object.values(EQUIPMENT_SETS)) {
            yield { goal, experience, daysPerWeek, locations: [location], equipment };
          }
        }
      }
    }
  }
}
const ALL_INPUTS = [...allInputs()];
/**
 * Checking every exercise of every session of all plans is CPU-bound: ~1.9 s
 * alone, up to ~6.6 s measured when the full suite runs files in parallel,
 * over the default 5 s per-test timeout.
 */
const ALL_SESSIONS_TIMEOUT_MS = 20_000;
const ALL_PLANS = ALL_INPUTS.map((i) => ({ input: i, result: generateWorkoutPlan(i, { generatedAt: GENERATED_AT }) }));
const ALL_OK = ALL_PLANS.flatMap((p) => (p.result.ok ? [{ input: p.input, plan: p.result.value }] : []));

describe('generateWorkoutPlan', () => {
  describe('determinism', () => {
    it('same input → identical plan, every time', () => {
      for (const i of [input(), input({ goal: 'lose-fat', locations: ['home'], equipment: [] }), input({ experience: 'beginner', daysPerWeek: 5 })]) {
        const first = plan(i);
        for (let run = 0; run < 5; run++) {
          expect(plan(structuredClone(i))).toEqual(first);
        }
      }
    });

    it('ordering of locations/equipment does not change the plan', () => {
      const a = plan(input({ locations: ['gym', 'home'], equipment: ['dumbbells', 'bench', 'cable'] }));
      const b = plan(input({ locations: ['home', 'gym'], equipment: ['cable', 'bench', 'dumbbells', 'bench'] }));
      expect(b).toEqual(a);
    });

    it('derives a stable, versioned id that changes when the input changes', () => {
      expect(plan().id).toMatch(/^wp-v2-[0-9a-f]{8}$/);
      expect(plan().id).toBe(plan().id);
      expect(plan(input({ daysPerWeek: 3 })).id).not.toBe(plan().id);
      expect(plan(input(), { generatedAt: '2027-01-01' }).id).toBe(plan().id); // date is not identity
      expect(plan(input(), { chains: [] }).id).not.toBe(plan().id); // chains are part of the programming
    });

    it('uses no randomness (Math.random is never called)', () => {
      const spy = vi.spyOn(Math, 'random');
      plan(input({ experience: 'advanced', daysPerWeek: 6, goal: 'improve-fitness' }));
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe(`every supported combination (${ALL_INPUTS.length})`, () => {
    it('generates a valid plan for every goal × experience × frequency × location × equipment input', () => {
      expect(ALL_INPUTS.length).toBeGreaterThanOrEqual(900);
      expect(ALL_PLANS.filter((p) => !p.result.ok).map((p) => JSON.stringify(p.input))).toEqual([]);
    });

    it('NEVER selects an exercise whose equipment, location or difficulty is unavailable', () => {
      const experienceRank = (e: TrainingExperience) => TRAINING_EXPERIENCE_LEVELS.indexOf(e);
      for (const { input: i, plan: p } of ALL_OK) {
        for (const planned of p.sessions.flatMap((s) => s.exercises)) {
          const ex = exerciseOf(planned.exerciseId);
          const context = `${planned.exerciseId} for ${JSON.stringify(i)}`;
          expect(ex.requires.every((item) => i.equipment.includes(item)), context).toBe(true);
          expect(ex.locations.some((l) => i.locations.includes(l)), context).toBe(true);
          expect(experienceRank(ex.difficulty) <= experienceRank(i.experience), context).toBe(true);
        }
      }
    });

    it('never repeats an exercise within a session', () => {
      for (const { plan: p } of ALL_OK) {
        for (const session of p.sessions) {
          expect(new Set(idsOf(session)).size).toBe(session.exercises.length);
        }
      }
    });

    it('fills every required objective (directly or by a flagged substitute), never silently drops one', () => {
      for (const { input: i, plan: p } of ALL_OK) {
        for (const session of resistance(p)) {
          for (const o of session.objectives.filter((o) => o.required)) {
            expect(['filled', 'substituted'], `${JSON.stringify(i)} ${session.id}/${o.objectiveId}`).toContain(o.status);
            expect(session.exercises.some((e) => e.exerciseId === o.exerciseId && e.selection.objectiveId === o.objectiveId)).toBe(true);
          }
        }
      }
    });

    it('reports every objective with a structured status and reason', () => {
      for (const { plan: p } of ALL_OK) {
        for (const session of resistance(p)) {
          expect(session.objectives.map((o) => o.objectiveId).sort()).toEqual(
            [...new Set(session.objectives.map((o) => o.objectiveId))].sort(),
          );
          for (const o of session.objectives) {
            const reason = { filled: null, substituted: 'no-full-movement-available', unfilled: 'no-compatible-exercise', 'not-selected': 'session-budget-reached' }[o.status];
            expect(o.reason).toBe(reason);
            expect(o.exerciseId === null).toBe(o.status === 'unfilled' || o.status === 'not-selected');
          }
          // Each exercise answers exactly one objective.
          expect(session.exercises.map((e) => e.selection.objectiveId).sort()).toEqual(
            session.objectives.filter((o) => o.exerciseId).map((o) => o.objectiveId).sort(),
          );
        }
      }
    });

    it('sequences exercises by category (primary → secondary → other compound → isolation → arms → core → conditioning)', () => {
      const order = CONFIG.sequencing.order;
      for (const { plan: p } of ALL_OK) {
        for (const session of resistance(p)) {
          expect(session.exercises.map((e) => e.order)).toEqual(session.exercises.map((_, i) => i + 1));
          const ranks = session.exercises.map((e) => order.indexOf(e.sequenceCategory));
          expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
          expect(session.exercises[0].selection.role).toBe('primary');
        }
      }
    });

    it('never stacks two high-fatigue lifts in one session', () => {
      for (const { input: i, plan: p } of ALL_OK) {
        for (const session of resistance(p)) {
          const heavy = session.exercises.filter((e) => exerciseOf(e.exerciseId).fatigue === 'high');
          expect(heavy.length, `${JSON.stringify(i)} ${session.name}`).toBeLessThanOrEqual(1);
        }
      }
    });

    it('in a gym with full equipment, never uses band (fallback) exercises', () => {
      const fullGym = ALL_OK.filter((x) => x.input.locations[0] === 'gym' && x.input.equipment === FULL_GYM);
      expect(fullGym.length).toBe(PRIMARY_GOALS.length * TRAINING_EXPERIENCE_LEVELS.length * WORKOUT_FREQUENCIES.length);
      for (const { input: i, plan: p } of fullGym) {
        const fallbacks = p.sessions.flatMap(idsOf).filter((id) => exerciseOf(id).tier === 'fallback');
        expect(fallbacks, JSON.stringify(i)).toEqual([]);
      }
    });

    it('keeps sets, rest and session length inside configured limits; never longer than the target maximum', () => {
      const L = WORKOUT_CONFIG_LIMITS;
      const { min, max } = CONFIG.duration.targetSessionMinutes;
      const maxSets = CONFIG.weeklyVolume.maxSetsPerExercise;
      for (const { input: i, plan: p } of ALL_OK) {
        for (const session of resistance(p)) {
          expect(session.exercises.length).toBeGreaterThanOrEqual(CONFIG.volume.minimumExercisesPerSession);
          expect(session.exercises.length).toBeLessThanOrEqual(CONFIG.volume.exercisesPerSession[i.experience]);
          expect(session.estimatedDurationMinutes).toBeLessThanOrEqual(max);
          // Short sessions exist only when padding would break volume limits (beginners, small setups).
          expect(session.estimatedDurationMinutes).toBeGreaterThanOrEqual(min - 10);
          for (const e of session.exercises) {
            expect(e.sets).toBeGreaterThanOrEqual(L.sets.min);
            expect(e.sets).toBeLessThanOrEqual(Math.max(maxSets[i.experience], CONFIG.prescriptions[p.programStyle][e.prescriptionProfile].sets[i.experience]));
            expect(e.restSeconds).toBeGreaterThanOrEqual(L.restSeconds.min);
            expect(e.restSeconds).toBeLessThanOrEqual(L.restSeconds.max);
          }
        }
      }
    }, ALL_SESSIONS_TIMEOUT_MS);

    it('nearly all sessions land in the realistic 35–50 minute range', () => {
      const sessions = ALL_OK.flatMap((x) => resistance(x.plan));
      const inRange = sessions.filter((s) => s.estimatedDurationMinutes >= 35 && s.estimatedDurationMinutes <= 50);
      expect(inRange.length / sessions.length).toBeGreaterThan(0.95);
    });

    it('records weekly volume that matches the planned sets', () => {
      for (const { plan: p } of ALL_OK) {
        const totals = Object.fromEntries(VOLUME_GROUPS.map((g) => [g, 0])) as Record<string, number>;
        for (const e of resistance(p).flatMap((s) => s.exercises)) {
          if (e.selection.role !== 'core' && e.selection.role !== 'conditioning') {
            for (const g of volumeGroupsOf(exerciseOf(e.exerciseId))) {
              totals[g] += e.sets;
            }
          }
        }
        for (const g of VOLUME_GROUPS) {
          expect(p.explanation.weeklyVolume[g].sets).toBe(totals[g]);
          const outside = p.warnings.some((w) => w.code === 'weekly-volume-outside-target' && w.group === g);
          expect(outside).toBe(p.explanation.weeklyVolume[g].status !== 'within');
        }
      }
    });
  });

  describe('frequency → split', () => {
    it.each<[WorkoutFrequency, string, string[]]>([
      [2, 'full-body', ['Full Body A', 'Full Body B']],
      [3, 'full-body', ['Full Body A', 'Full Body B', 'Full Body C']],
      [4, 'upper-lower', ['Upper A', 'Lower A', 'Upper B', 'Lower B']],
      [5, 'upper-lower-push-pull-legs', ['Upper', 'Lower', 'Push', 'Pull', 'Legs']],
      [6, 'push-pull-legs', ['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B']],
    ])('%i days → %s', (daysPerWeek, strategy, names) => {
      const p = plan(input({ daysPerWeek }));
      expect(p.split.strategy).toBe(strategy);
      expect(p.sessions.map((s) => s.name)).toEqual(names);
      expect(p.sessions.map((s) => s.dayIndex)).toEqual(names.map((_, i) => i + 1));
      expect(p.explanation.split).toEqual({
        frequency: daysPerWeek,
        resistanceSessions: daysPerWeek,
        activityDays: 0,
        goal: 'build-muscle',
        strategy,
        source: 'frequency-default',
        replacedStrategy: null,
      });
    });

    it('lower sessions alternate a squat focus and a hinge focus', () => {
      expect(resistance(plan()).map((s) => s.templateId)).toEqual(['upper', 'lower-a', 'upper', 'lower-b']);
    });

    it('general fitness at 4 days uses full-body sessions (goal override)', () => {
      const p = plan(input({ goal: 'improve-fitness', daysPerWeek: 4 }));
      expect(p.split.strategy).toBe('full-body');
      expect(p.explanation.split.source).toBe('goal-override');
      expect(resistance(p).map((s) => s.templateId)).toEqual(['full-body-a', 'full-body-b', 'full-body-c', 'full-body-a']);
    });

    it('falls back to full-body when the split cannot be built from the equipment', () => {
      const p = plan(input({ experience: 'intermediate', daysPerWeek: 6, locations: ['home'], equipment: [] }));
      expect(p.split.strategy).toBe('full-body');
      expect(p.explanation.split).toMatchObject({ source: 'equipment-fallback', replacedStrategy: 'push-pull-legs' });
      expect(p.sessions).toHaveLength(6);
    });
  });

  describe('beginners: available days, not N hard sessions', () => {
    const beginner = (daysPerWeek: WorkoutFrequency, overrides: Partial<WorkoutGenerationInput> = {}) =>
      plan(input({ experience: 'beginner', daysPerWeek, ...overrides }));

    it('5 days → three full-body sessions alternating with two light-activity days', () => {
      const p = beginner(5);
      expect(p.split.strategy).toBe('full-body-with-recovery');
      expect(p.sessions.map((s) => `${s.kind}:${s.name}`)).toEqual([
        'resistance:Full Body A',
        'activity:Light Activity',
        'resistance:Full Body B',
        'activity:Light Activity',
        'resistance:Full Body C',
      ]);
      expect(p.explanation.split).toMatchObject({ frequency: 5, resistanceSessions: 3, activityDays: 2, source: 'experience-override' });
    });

    it('6 days → three full-body sessions, two light days and an optional conditioning day', () => {
      const p = beginner(6);
      expect(p.split.sessionTypes).toEqual(['full-body', 'light-activity', 'full-body', 'light-activity', 'full-body', 'optional-conditioning']);
      expect(p.explanation.split).toMatchObject({ frequency: 6, resistanceSessions: 3, activityDays: 3, source: 'experience-override' });
    });

    it('represents activity days explicitly: easy, timed guidance, no exercises', () => {
      const days = beginner(6).sessions.filter((s) => s.kind === 'activity');
      const lightDay = (dayIndex: number) => ({
        kind: 'activity', id: 'day-' + dayIndex + '-light-activity', name: 'Light Activity', dayIndex,
        sessionType: 'light-activity', optional: false, intensity: 'easy', durationMinutes: { min: 20, max: 30 },
        suggestedActivities: ['walking', 'easy-cycling', 'mobility'], estimatedDurationMinutes: 30, exercises: [],
      });
      expect(days).toEqual([
        lightDay(2),
        lightDay(4),
        {
          kind: 'activity', id: 'day-6-optional-conditioning', name: 'Optional Conditioning', dayIndex: 6,
          sessionType: 'optional-conditioning', optional: true, intensity: 'easy', durationMinutes: { min: 15, max: 20 },
          suggestedActivities: ['mobility', 'light-conditioning'], estimatedDurationMinutes: 20, exercises: [],
        },
      ]);
    });

    it('never places two resistance sessions on consecutive days (5 and 6 days)', () => {
      for (const days of [5, 6] as const) {
        const kinds = beginner(days).sessions.map((s) => s.kind);
        for (let i = 1; i < kinds.length; i++) {
          expect(kinds[i] === 'resistance' && kinds[i - 1] === 'resistance').toBe(false);
        }
      }
    });

    it('applies to every goal and setup, including bodyweight-only at home', () => {
      for (const days of [5, 6] as const) {
        for (const goal of PRIMARY_GOALS) {
          expect(beginner(days, { goal }).explanation.split.resistanceSessions).toBe(3);
        }
        expect(beginner(days, { locations: ['home'], equipment: [] }).explanation.split.source).toBe('experience-override');
      }
    });

    it('intermediate and advanced users keep the demanding 5- and 6-day splits', () => {
      for (const experience of ['intermediate', 'advanced'] as const) {
        expect(plan(input({ experience, daysPerWeek: 5 })).split.strategy).toBe('upper-lower-push-pull-legs');
        expect(plan(input({ experience, daysPerWeek: 6 })).split.strategy).toBe('push-pull-legs');
      }
    });

    it('the equipment fallback keeps activity days when it replaces resistance sessions', () => {
      const config = {
        ...CONFIG,
        splits: {
          ...CONFIG.splits,
          experienceOverrides: {
            beginner: {
              6: {
                strategy: 'full-body-with-recovery' as const,
                sessions: ['push', 'light-activity', 'pull', 'light-activity', 'legs', 'optional-conditioning'] as const,
              },
            },
          },
        },
      };
      const p = plan(input({ experience: 'beginner', daysPerWeek: 6, locations: ['home'], equipment: [] }), { config });
      expect(p.explanation.split).toMatchObject({ source: 'equipment-fallback', replacedStrategy: 'full-body-with-recovery' });
      expect(p.split.sessionTypes).toEqual(['full-body', 'light-activity', 'full-body', 'light-activity', 'full-body', 'optional-conditioning']);
    });

    it('beginners repeat foundational lifts on purpose and label the repetition', () => {
      const [a, , c] = resistance(beginner(3));
      const squatA = a.exercises.find((e) => e.selection.objectiveId === 'knee-dominant')!;
      const squatC = c.exercises.find((e) => e.selection.objectiveId === 'knee-dominant')!;
      expect(squatC.exerciseId).toBe(squatA.exerciseId);
      expect(squatA.weeklyRepetition).toBe('foundational');
      // Exercises used once are 'single'; repeats under "vary" objectives are called out as 'repeated'.
      for (const e of resistance(beginner(3)).flatMap((s) => s.exercises)) {
        const uses = resistance(beginner(3)).flatMap(idsOf).filter((id) => id === e.exerciseId).length;
        expect(e.weeklyRepetition === 'single').toBe(uses === 1);
      }
    });
  });

  describe('objective coverage', () => {
    it('intermediate hypertrophy upper days train shoulders, biceps AND triceps (no displacement)', () => {
      for (const session of resistance(plan()).filter((s) => s.sessionType === 'upper')) {
        expect(has(session, 'shoulder-abduction'), session.name).toBe(true);
        expect(has(session, 'elbow-flexion'), session.name).toBe(true);
        expect(has(session, 'elbow-extension'), session.name).toBe(true);
        expect(session.objectives.filter((o) => o.required).every((o) => o.status === 'filled')).toBe(true);
      }
    });

    it('lower days train knee-dominant, hip-dominant, unilateral and knee-flexion work', () => {
      for (const session of resistance(plan()).filter((s) => s.sessionType === 'lower')) {
        expect(has(session, 'squat'), session.name).toBe(true);
        expect(has(session, 'hinge'), session.name).toBe(true);
        expect(has(session, 'lunge'), session.name).toBe(true);
        expect(has(session, 'knee-flexion'), session.name).toBe(true);
      }
    });

    it('home without equipment: pulling is an honest, flagged scapular substitute', () => {
      const p = plan(input({ goal: 'lose-fat', experience: 'beginner', daysPerWeek: 3, locations: ['home'], equipment: [] }));
      for (const session of resistance(p)) {
        const pull = session.objectives.find((o) => o.objectiveId.endsWith('-pull') && o.required)!;
        expect(pull).toMatchObject({ status: 'substituted', reason: 'no-full-movement-available' });
        const planned = session.exercises.find((e) => e.exerciseId === pull.exerciseId)!;
        expect(planned.selection).toMatchObject({ substitute: true, movementClass: 'scapular' });
        expect(p.warnings).toContainEqual({
          code: 'objective-substituted',
          sessionId: session.id,
          objectiveId: pull.objectiveId,
          exerciseId: pull.exerciseId,
          substituteClass: 'scapular',
        });
      }
    });

    it('a pull-up bar at home turns the substitute into a true pull', () => {
      const p = plan(input({ experience: 'intermediate', daysPerWeek: 3, locations: ['home'], equipment: ['pull-up-bar'] }));
      const pulls = resistance(p).flatMap((s) => s.objectives.filter((o) => o.objectiveId.endsWith('-pull')));
      expect(pulls.length).toBeGreaterThan(0);
      expect(pulls.every((o) => o.status === 'filled')).toBe(true);
    });

    it('reports optional objectives it could not fill rather than dropping them silently', () => {
      const p = plan(input({ locations: ['home'], equipment: [], experience: 'beginner', daysPerWeek: 3, goal: 'lose-fat' }));
      const unfilled = resistance(p).flatMap((s) => s.objectives.filter((o) => o.status === 'unfilled').map((o) => ({ s, o })));
      expect(unfilled.length).toBeGreaterThan(0);
      for (const { s, o } of unfilled) {
        expect(o.required).toBe(false);
        expect(p.warnings).toContainEqual({ code: 'objective-unfilled', sessionId: s.id, objectiveId: o.objectiveId, role: o.role });
      }
    });

    it('a required objective with no compatible exercise is a typed error (with the objective) when no fallback applies', () => {
      const noTriceps = EXERCISE_LIBRARY.filter((e) => e.pattern !== 'elbow-extension');
      const config = { ...CONFIG, splits: { ...CONFIG.splits, infeasibleFallback: 'none' as const } };
      expect(errorOf(input(), { catalog: noTriceps, config })).toMatchObject({
        code: 'impossible-session-requirements',
        details: { templateId: 'upper', objectiveId: 'elbow-extension', reason: 'no-compatible-exercise' },
      });
    });

    it('…and falls back to full-body (where arms are optional) when the fallback is enabled', () => {
      const noTriceps = EXERCISE_LIBRARY.filter((e) => e.pattern !== 'elbow-extension');
      const p = plan(input(), { catalog: noTriceps });
      expect(p.explanation.split).toMatchObject({ source: 'equipment-fallback', replacedStrategy: 'upper-lower' });
    });
  });

  describe('movement balance', () => {
    it('full-body sessions train a push, a pull and the lower body', () => {
      for (const daysPerWeek of [2, 3] as const) {
        for (const session of plan(input({ daysPerWeek })).sessions) {
          expect(has(session, 'horizontal-push', 'vertical-push'), session.name).toBe(true);
          expect(has(session, 'horizontal-pull', 'vertical-pull'), session.name).toBe(true);
          expect(has(session, 'squat', 'lunge', 'hinge'), session.name).toBe(true);
        }
      }
    });

    it('upper/lower and push/pull/legs sessions stay in their lane', () => {
      const pushes: MovementPattern[] = ['horizontal-push', 'vertical-push'];
      const pulls: MovementPattern[] = ['horizontal-pull', 'vertical-pull'];
      const lowerBody: MovementPattern[] = ['squat', 'hinge', 'lunge', 'knee-flexion', 'knee-extension', 'calf-raise'];
      for (const session of plan(input({ daysPerWeek: 6 })).sessions) {
        const patterns = patternsOf(session);
        if (session.sessionType === 'push') {
          expect(patterns.some((p) => pulls.includes(p) || lowerBody.includes(p))).toBe(false);
        }
        if (session.sessionType === 'pull') {
          expect(patterns.some((p) => pushes.includes(p) || lowerBody.includes(p))).toBe(false);
        }
        if (session.sessionType === 'legs') {
          expect(has(session, 'squat') && has(session, 'hinge')).toBe(true);
        }
      }
      for (const session of plan(input({ daysPerWeek: 4 })).sessions) {
        if (session.sessionType === 'upper') {
          expect(patternsOf(session).some((p) => lowerBody.includes(p))).toBe(false);
        }
      }
    });

    it('intermediate hypertrophy weekly volume lands inside every target range in a full gym', () => {
      const p = plan();
      expect(p.warnings.filter((w) => w.code === 'weekly-volume-outside-target')).toEqual([]);
      expect(p.explanation.weeklyVolume.chest.sets).toBeGreaterThanOrEqual(p.explanation.weeklyVolume.chest.target.min);
    });

    it('rear delts never disappear from suitable hypertrophy programs (≥ 3 sessions, not upper/lower)', () => {
      const suitable = ALL_OK.filter(
        ({ input: i, plan: p }) =>
          p.programStyle === 'hypertrophy' &&
          i.experience !== 'beginner' &&
          p.explanation.split.resistanceSessions >= 3 &&
          p.split.strategy !== 'upper-lower',
      );
      expect(suitable.length).toBeGreaterThan(0);
      for (const { input: i, plan: p } of suitable) {
        const rear = p.explanation.weeklyVolume['rear-delts'];
        expect(rear.target.min, JSON.stringify(i)).toBeGreaterThanOrEqual(2);
        expect(rear.sets, JSON.stringify(i)).toBeGreaterThanOrEqual(rear.target.min);
        expect(p.warnings.some((w) => w.code === 'weekly-volume-outside-target' && w.group === 'rear-delts')).toBe(false);
      }
    });

    it('rear-delt minimum is not imposed on strength, general or beginner programs, nor where there is no room', () => {
      for (const { input: i, plan: p } of ALL_OK) {
        const exempt =
          p.programStyle !== 'hypertrophy' ||
          i.experience === 'beginner' ||
          p.explanation.split.resistanceSessions < 3 ||
          p.split.strategy === 'upper-lower';
        if (exempt) {
          expect(p.explanation.weeklyVolume['rear-delts'].target.min, JSON.stringify(i)).toBe(0);
        }
      }
      // Upper/lower keeps its rear-delt objective visible as "not selected", not silently gone.
      const upper = resistance(plan()).find((s) => s.sessionType === 'upper')!;
      expect(upper.objectives.find((o) => o.objectiveId === 'rear-delts')).toMatchObject({
        required: false,
        status: 'not-selected',
        reason: 'session-budget-reached',
      });
    });

    it('balances weekly volume by moving sets, not by adding exercises', () => {
      const p = plan();
      const adjusted = resistance(p).flatMap((s) => s.exercises).filter((e) => e.volumeAdjustment);
      expect(adjusted.length).toBeGreaterThan(0);
      for (const e of adjusted) {
        expect(Math.abs(e.volumeAdjustment!.setsDelta)).toBeGreaterThan(0);
        expect(e.sets).toBe(CONFIG.prescriptions.hypertrophy[e.prescriptionProfile].sets.intermediate + e.volumeAdjustment!.setsDelta);
      }
      const budget = CONFIG.volume.exercisesPerSession.intermediate;
      expect(resistance(p).every((s) => s.exercises.length <= budget)).toBe(true);
    });

    it('optional objectives that would add under-target volume are preferred and say so', () => {
      const p = plan(input({ daysPerWeek: 3 }));
      const reasons = resistance(p).flatMap((s) => s.exercises).flatMap((e) => e.selection.reasons);
      expect(reasons).toContain('weekly-volume-deficit');
    });
  });

  describe('goals', () => {
    const byGoal = (goal: PrimaryGoal) => plan(input({ goal, daysPerWeek: 3 }));

    it('build muscle: moderate rep ranges and rest on the main lift', () => {
      const first = byGoal('build-muscle').sessions[0].exercises[0];
      expect(first.target).toEqual({ kind: 'reps', min: 6, max: 10 });
      expect(first.restSeconds).toBe(120);
    });

    it('strength: heavy barbell main lift first, long rest, fewer exercises', () => {
      const p = byGoal('get-stronger');
      const main = p.sessions[0].exercises[0];
      expect(main).toMatchObject({ prescriptionProfile: 'primary-compound', sequenceCategory: 'primary-compound' });
      expect(main.target).toEqual({ kind: 'reps', min: 4, max: 6 });
      expect(main.restSeconds).toBeGreaterThanOrEqual(180);
      expect(exerciseOf(main.exerciseId).requires).toContain('barbell');
      expect(p.explanation.volume.exercisesPerSession).toBe(byGoal('build-muscle').explanation.volume.exercisesPerSession - 1);
    });

    it('strength: a heavy squat day pairs with a lighter hinge; a deadlift day with lighter knee-dominant work', () => {
      const p = plan(input({ goal: 'get-stronger', daysPerWeek: 4 }));
      const [lowerA, lowerB] = resistance(p).filter((s) => s.sessionType === 'lower');
      expect(lowerA.exercises[0].exerciseId).toBe('back-squat');
      expect(idsOf(lowerA)).not.toContain('deadlift');
      expect(lowerB.exercises[0].exerciseId).toBe('deadlift');
      expect(idsOf(lowerB).filter((id) => exerciseOf(id).fatigue === 'high')).toEqual(['deadlift']);
    });

    it('strength: not every exercise uses the same rest', () => {
      const rests = new Set(resistance(plan(input({ goal: 'get-stronger' }))).flatMap((s) => s.exercises.map((e) => e.restSeconds)));
      expect(rests.size).toBeGreaterThanOrEqual(3);
    });

    it('fat loss: resistance training first, with one optional conditioning finisher last', () => {
      const p = byGoal('lose-fat');
      for (const session of resistance(p)) {
        expect(session.exercises[0].selection.role).toBe('primary');
        const conditioning = session.exercises.filter((e) => e.selection.role === 'conditioning');
        expect(conditioning.length).toBeLessThanOrEqual(1);
        if (conditioning.length) {
          expect(session.exercises.at(-1)).toBe(conditioning[0]);
        }
        expect(session.exercises.filter((e) => e.selection.role !== 'conditioning').length).toBeGreaterThanOrEqual(4);
      }
      expect(p.explanation.volume.conditioningFinisher).toBe(true);
    });

    it('recomposition: hypertrophy training without a finisher', () => {
      const p = byGoal('recomposition');
      expect(p.programStyle).toBe('hypertrophy');
      expect(p.explanation.volume.conditioningFinisher).toBe(false);
      expect(p.sessions.flatMap((s) => s.exercises).some((e) => e.selection.role === 'conditioning')).toBe(false);
    });

    it('general fitness: balanced strength plus conditioning', () => {
      const p = byGoal('improve-fitness');
      expect(p.programStyle).toBe('general');
      expect(resistance(p).every((s) => s.exercises.some((e) => e.selection.role === 'conditioning'))).toBe(true);
    });
  });

  describe('experience', () => {
    const byExperience = (experience: TrainingExperience) => plan(input({ experience, daysPerWeek: 4 }));

    it('beginners get fewer, beginner-level exercises and a conservative load increment', () => {
      const beginner = byExperience('beginner');
      const advanced = byExperience('advanced');
      expect(beginner.sessions[0].exercises.length).toBeLessThan(advanced.sessions[0].exercises.length);
      expect(beginner.sessions.flatMap((s) => s.exercises).every((e) => exerciseOf(e.exerciseId).difficulty === 'beginner')).toBe(true);
      expect(beginner.progressionStrategy.loadIncreasePercent).toBe(2.5);
    });

    it('advanced users get variation between repeated sessions, not just more exercises', () => {
      const p = plan(input({ experience: 'advanced', daysPerWeek: 6 }));
      const [pushA, , , pushB] = p.sessions;
      expect(pushA.exercises[0].exerciseId).toBe(pushB.exercises[0].exerciseId); // main lift is foundational
      expect(idsOf(pushB).slice(1)).not.toEqual(idsOf(pushA).slice(1));
    });
  });

  describe('locations and equipment', () => {
    it.each<[string, WorkoutLocation, readonly WorkoutEquipment[]]>([
      ['gym, full gym', 'gym', FULL_GYM],
      ['home, no equipment', 'home', []],
      ['home, dumbbells', 'home', ['dumbbells', 'bench']],
      ['outdoor, bands', 'outdoor', ['resistance-band']],
    ])('%s: plan uses only what is available', (_, location, equipment) => {
      const p = plan(input({ locations: [location], equipment, daysPerWeek: 3 }));
      const used = p.sessions.flatMap((s) => s.exercises).map((e) => exerciseOf(e.exerciseId));
      expect(used.every((e) => e.requires.every((r) => equipment.includes(r)))).toBe(true);
      expect(p.explanation.availability.availableExerciseCount).toBeGreaterThan(0);
    });

    it('advanced full gym: loadable gym exercises, never Band Leg Curl or Band Pallof Press', () => {
      const ids = plan(input({ goal: 'improve-fitness', experience: 'advanced', daysPerWeek: 6 })).sessions.flatMap(idsOf);
      expect(ids).not.toContain('band-leg-curl');
      expect(ids).not.toContain('band-pallof-press');
      expect(ids).toContain('leg-curl');
    });

    it('bands are still used when they are the only equipment', () => {
      const ids = plan(input({ locations: ['outdoor'], equipment: ['resistance-band'], daysPerWeek: 3 })).sessions.flatMap(idsOf);
      expect(ids.some((id) => exerciseOf(id).tier === 'fallback')).toBe(true);
    });
  });

  describe('prescription and progression', () => {
    it('low-loadability exercises use the low-load profile (higher reps, shorter rest)', () => {
      const p = plan(input({ goal: 'lose-fat', experience: 'beginner', daysPerWeek: 3, locations: ['home'], equipment: [] }));
      const squat = p.sessions[0].exercises.find((e) => e.exerciseId === 'bodyweight-squat')!;
      expect(squat).toMatchObject({ prescriptionProfile: 'low-load', target: { kind: 'reps', min: 10, max: 20 }, restSeconds: 60 });
      const bridge = p.sessions[0].exercises.find((e) => e.exerciseId === 'glute-bridge')!;
      expect(bridge.target).toEqual({ kind: 'reps', min: 10, max: 20 });
      expect(bridge.restSeconds).toBeLessThan(120);
    });

    it('loaded rep exercises use double progression with the goal’s increment', () => {
      expect(plan(input({ goal: 'get-stronger' })).sessions[0].exercises[0].progression).toEqual({
        type: 'double-progression',
        lowerRepBound: 4,
        upperRepBound: 6,
        loadIncreasePercent: 2.5,
        advanceWhen: 'all-sets-at-upper-bound',
      });
      expect(plan().sessions[0].exercises[0].progression).toMatchObject({ type: 'double-progression', loadIncreasePercent: 5 });
    });

    it('bodyweight exercises progress by reps, then along their progression chain', () => {
      const pushUp = plan(input({ locations: ['home'], equipment: [], experience: 'beginner', daysPerWeek: 3 }))
        .sessions[0].exercises.find((e) => e.exerciseId === 'push-up');
      expect(pushUp?.progression).toEqual({
        type: 'rep-progression',
        lowerRepBound: 10,
        upperRepBound: 20,
        advanceWhen: 'all-sets-at-upper-bound',
        thenProgressBy: 'harder-variation',
        chain: { chainId: 'push-up', regression: 'incline-push-up', progression: 'decline-push-up' },
      });
      expect(pushUp?.notes).toContain('bodyweight');
    });

    it('timed exercises use time progression and a time target', () => {
      const finisher = plan(input({ goal: 'lose-fat', daysPerWeek: 3 })).sessions[0].exercises.find(
        (e) => e.selection.role === 'conditioning',
      );
      expect(finisher?.target).toEqual({ kind: 'time', seconds: 30 });
      expect(finisher?.progression).toMatchObject({ type: 'time-progression', startSeconds: 30, incrementSeconds: 5, maxSeconds: 60 });
      expect(finisher?.notes).toContain('time-based');
    });

    it('marks unilateral exercises as per-side', () => {
      for (const e of plan(input({ daysPerWeek: 6 })).sessions.flatMap((s) => s.exercises)) {
        expect(e.notes.includes('per-side')).toBe(exerciseOf(e.exerciseId).laterality === 'unilateral');
      }
    });

    it('describes the plan-level progression strategy (no history yet)', () => {
      expect(plan().progressionStrategy).toEqual({
        loadedExercises: 'double-progression',
        bodyweightExercises: 'rep-progression',
        timedExercises: 'time-progression',
        loadIncreasePercent: 5,
        timeIncrementSeconds: 5,
        maxTimeSeconds: 60,
        historyBased: false,
      });
    });

    it('does not prescribe starting loads', () => {
      expect(JSON.stringify(plan())).not.toMatch(/"(load|weight|kg)"/i);
      expect(plan().assumptions).toContain('no-starting-loads');
    });
  });

  describe('session duration', () => {
    it('is rounded to 5 minutes', () => {
      expect(resistance(plan()).every((s) => s.estimatedDurationMinutes % 5 === 0)).toBe(true);
    });

    it('trims non-primary sets instead of exceeding the maximum (advanced strength full body)', () => {
      const p = plan(input({ goal: 'get-stronger', experience: 'advanced', daysPerWeek: 2 }));
      const trimmed = resistance(p).flatMap((s) => s.exercises).filter((e) => e.volumeAdjustment?.reason === 'session-duration-above-target');
      expect(trimmed.length).toBeGreaterThan(0);
      expect(trimmed.every((e) => e.selection.role !== 'primary' && e.volumeAdjustment!.setsDelta < 0)).toBe(true);
      expect(resistance(p).every((s) => s.estimatedDurationMinutes <= CONFIG.duration.targetSessionMinutes.max)).toBe(true);
    });

    it('adds sets to existing exercises (never exercises) when a session would be too short', () => {
      const p = plan(input({ goal: 'get-stronger', experience: 'beginner', daysPerWeek: 2, locations: ['home'], equipment: [] }));
      const padded = resistance(p).flatMap((s) => s.exercises).filter((e) => e.volumeAdjustment?.reason === 'session-duration-below-target');
      expect(padded.length).toBeGreaterThan(0);
      expect(padded.every((e) => e.volumeAdjustment!.setsDelta > 0)).toBe(true);
      expect(resistance(p).every((s) => s.exercises.length <= CONFIG.volume.exercisesPerSession.beginner - 1)).toBe(true);
    });

    it('strength sessions are not shorter than their long rests imply', () => {
      const s = plan(input({ goal: 'get-stronger', daysPerWeek: 3 })).sessions[0];
      const restMinutes = s.exercises.reduce((t, e) => t + ((e.sets - 1) * e.restSeconds) / 60, 0);
      expect(s.estimatedDurationMinutes).toBeGreaterThan(restMinutes);
    });
  });

  describe('explainability', () => {
    it('explains every selection with structured reasons', () => {
      for (const e of plan().sessions.flatMap((s) => s.exercises)) {
        expect(e.selection.reasons.length).toBeGreaterThan(0);
        expect(e.selection.candidateCount).toBeGreaterThan(0);
        expect(exerciseOf(e.exerciseId).pattern).toBe(e.selection.matchedPattern);
        expect(exerciseOf(e.exerciseId).movementClass).toBe(e.selection.movementClass);
      }
    });

    it('records version, inputs and volume decisions', () => {
      const p = plan(input({ goal: 'get-stronger', experience: 'advanced', daysPerWeek: 5 }));
      expect(p).toMatchObject({ workoutProgrammingVersion: 'v2', generatedAt: GENERATED_AT, goal: 'get-stronger', experience: 'advanced', daysPerWeek: 5 });
      expect(p.explanation.volume).toEqual({
        programStyle: 'strength',
        experience: 'advanced',
        exercisesPerSession: 6,
        conditioningFinisher: false,
        variationRoles: ['accessory'],
      });
      expect(Object.keys(p.explanation.weeklyVolume).sort()).toEqual([...VOLUME_GROUPS].sort());
    });
  });

  describe('typed errors', () => {
    it.each<[string, WorkoutGenerationInput, string]>([
      ['7 days', input({ daysPerWeek: 7 as never }), 'invalid-frequency'],
      ['1 day', input({ daysPerWeek: 1 as never }), 'invalid-frequency'],
      ['unknown goal', input({ goal: 'get-huge' as never }), 'unsupported-goal'],
      ['unknown experience', input({ experience: 'elite' as never }), 'invalid-experience'],
      ['no location', input({ locations: [] }), 'missing-location'],
      ['unknown location', input({ locations: ['moon' as never] }), 'invalid-location'],
      ['missing equipment list', input({ equipment: undefined as never }), 'missing-equipment'],
      ['unknown equipment', input({ equipment: ['kettlebell' as never] }), 'invalid-equipment'],
    ])('%s → %s', (_, i, code) => {
      expect(errorCode(i)).toBe(code);
    });

    it('rejects a malformed generation date', () => {
      expect(errorCode(input(), { generatedAt: '07/10/2026' })).toBe('invalid-generated-date');
    });

    it('reports no compatible exercises instead of returning an empty plan', () => {
      const gymOnly = EXERCISE_LIBRARY.filter((e) => e.locations.length === 1 && e.locations[0] === 'gym');
      expect(errorCode(input({ locations: ['home'], equipment: [] }), { catalog: gymOnly, chains: [] })).toBe('no-compatible-exercises');
    });

    it('reports impossible session requirements when even full-body cannot be built', () => {
      const legsOnly = EXERCISE_LIBRARY.filter((e) => ['squat', 'hinge', 'lunge'].includes(e.pattern));
      expect(errorOf(input({ daysPerWeek: 4 }), { catalog: legsOnly, chains: [] })).toMatchObject({ code: 'impossible-session-requirements' });
    });

    it('rejects an invalid configuration, catalog or progression chains', () => {
      expect(errorCode(input(), { config: { ...CONFIG, version: 'v9' as never } })).toBe('invalid-configuration');
      expect(errorCode(input(), { catalog: [...EXERCISE_LIBRARY, EXERCISE_LIBRARY[0]] })).toBe('invalid-configuration');
      expect(errorCode(input(), { chains: [{ id: 'x', steps: ['push-up', 'nope'], entry: 'push-up' }] })).toBe('invalid-configuration');
    });
  });

  describe('golden fixtures (regression)', () => {
    it.each(GOLDEN_PLANS.map((g) => [g.name, g] as const))('%s', (_, golden) => {
      const p = plan(golden.input, { generatedAt: GOLDEN_GENERATED_AT });
      expect(p.id).toBe(golden.expected.id);
      expect(p.split.strategy).toBe(golden.expected.split);
      expect(
        p.sessions.map((s) => ({
          name: s.name,
          minutes: s.estimatedDurationMinutes,
          exercises: idsOf(s),
          sets: s.exercises.map((e) => e.sets),
        })),
      ).toEqual(golden.expected.sessions);
    });
  });
});
