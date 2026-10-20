import { DEFAULT_WORKOUT_CONFIG, EXERCISE_LIBRARY, Exercise } from '../../../domain/workout-programming';
import { ACTIVITY_PROFILE, planFor } from '../testing/workout-fixtures';
import { customSpecFromPlan } from '../../../domain/training-plan';
import { CATALOG } from '../workout-view-model';
import {
  PlanDraft,
  addExercise,
  draftFromSpec,
  exerciseErrors,
  moveExercise,
  removeExercise,
  sameDraft,
  setField,
  toSpec,
} from './custom-plan-draft';
import { CATEGORY_OPTIONS, EQUIPMENT_OPTIONS, MUSCLE_OPTIONS, NO_QUERY, filterExercises } from './exercise-filter';

const plan = planFor(ACTIVITY_PROFILE);
const ex = (id: string) => EXERCISE_LIBRARY.find((e) => e.id === id) as Exercise;
const timed = EXERCISE_LIBRARY.find((e) => e.measurement === 'time') as Exercise;
const base = draftFromSpec(customSpecFromPlan(plan));
const day = base[0].sessionId;
const names = (draft: PlanDraft, sessionId = day) => draft.find((d) => d.sessionId === sessionId)!.exercises.map((e) => e.exerciseId);
const add = (draft: PlanDraft, e: Exercise) => addExercise(draft, day, e, plan, DEFAULT_WORKOUT_CONFIG);

describe('custom plan draft', () => {
  it('starts as the active plan’s exercises, with prescriptions as text', () => {
    const first = base[0].exercises[0];
    expect(typeof first.sets).toBe('string');
    expect(names(base)).toEqual(plan.sessions.find((s) => s.id === day)!.exercises.map((e) => e.exerciseId));
  });

  it('adds an exercise at the end with the engine’s usual prescription, once per day', () => {
    const empty = removeAll(base, day);
    const added = add(empty, ex('barbell-bench-press'));
    expect(names(added)).toEqual(['barbell-bench-press']);
    expect(added[0].exercises[0]).toMatchObject({ sets: expect.stringMatching(/^\d+$/), repsMin: expect.stringMatching(/^\d+$/), seconds: '' });
    expect(add(added, ex('barbell-bench-press'))).toEqual(added);
  });

  it('timed exercises start with seconds instead of reps', () => {
    const added = add(removeAll(base, day), timed);
    expect(added[0].exercises[0]).toMatchObject({ repsMin: '', repsMax: '' });
    expect(Number(added[0].exercises[0].seconds)).toBeGreaterThan(0);
    expect(toSpec(added, CATALOG)?.days[0].exercises[0].target.kind).toBe('time');
  });

  it('removes exercises', () => {
    const first = names(base)[0];
    expect(names(removeExercise(base, day, first))).toEqual(names(base).slice(1));
  });

  it('reorders one step at a time and stops at either end', () => {
    const [a, b, c] = names(base);
    expect(names(moveExercise(base, day, a, 1)).slice(0, 3)).toEqual([b, a, c]);
    expect(names(moveExercise(base, day, c, -1)).slice(0, 3)).toEqual([a, c, b]);
    expect(moveExercise(base, day, a, -1)).toEqual(base);
    const last = names(base).at(-1)!;
    expect(moveExercise(base, day, last, 1)).toEqual(base);
  });

  it('other days are never touched', () => {
    const other = base[1].sessionId;
    const changed = removeExercise(add(base, ex('deadlift')), day, names(base)[0]);
    expect(names(changed, other)).toEqual(names(base, other));
  });

  it('tracks whether anything differs from the start', () => {
    expect(sameDraft(base, base)).toBe(true);
    expect(sameDraft(base, setField(base, day, names(base)[0], 'sets', '9'))).toBe(false);
    const reverted = setField(setField(base, day, names(base)[0], 'sets', '9'), day, names(base)[0], 'sets', base[0].exercises[0].sets);
    expect(sameDraft(base, reverted)).toBe(true);
  });

  describe('prescription validation', () => {
    const rep = base[0].exercises[0];
    const errors = (patch: Partial<typeof rep>) => exerciseErrors({ ...rep, ...patch }, false);

    it('accepts what the engine itself produces', () => {
      for (const d of base) {
        for (const e of d.exercises) {
          expect(exerciseErrors(e, CATALOG.get(e.exerciseId)?.measurement === 'time')).toEqual({});
        }
      }
    });

    it('explains each wrong field', () => {
      expect(errors({ sets: '' }).sets).toMatch(/1–10 sets/);
      expect(errors({ sets: '0' }).sets).toBeDefined();
      expect(errors({ sets: '11' }).sets).toBeDefined();
      expect(errors({ sets: '2.5' }).sets).toBeDefined();
      expect(errors({ sets: 'abc' }).sets).toBeDefined();
      expect(errors({ repsMin: '' }).repsMin).toBeDefined();
      expect(errors({ repsMax: '101' }).repsMax).toBeDefined();
      expect(errors({ repsMin: '12', repsMax: '8' }).repsMax).toMatch(/at least the minimum/);
      expect(errors({ rest: '-5' }).rest).toBeDefined();
      expect(errors({ rest: '601' }).rest).toBeDefined();
      expect(errors({ rest: '0' })).toEqual({});
      expect(exerciseErrors({ ...rep, seconds: '' }, true).seconds).toMatch(/5–600 seconds/);
      expect(exerciseErrors({ ...rep, seconds: '45', repsMin: '', repsMax: '' }, true)).toEqual({});
    });

    it('turns into numbers only when every field is valid', () => {
      expect(toSpec(base, CATALOG)).not.toBeNull();
      expect(toSpec(setField(base, day, rep.exerciseId, 'sets', ''), CATALOG)).toBeNull();
      const spec = toSpec(setField(base, day, rep.exerciseId, 'sets', ' 4 '), CATALOG);
      expect(spec?.days[0].exercises[0].sets).toBe(4);
    });
  });
});

function removeAll(draft: PlanDraft, sessionId: string): PlanDraft {
  return draft.map((d) => (d.sessionId === sessionId ? { ...d, exercises: [] } : d));
}

describe('exercise filter', () => {
  const ids = (query: Partial<typeof NO_QUERY>) => filterExercises({ ...NO_QUERY, ...query }).map((e) => e.id);

  it('with no query lists the whole catalog, alphabetically', () => {
    const all = filterExercises(NO_QUERY);
    expect(all).toHaveLength(EXERCISE_LIBRARY.length);
    expect(all.map((e) => e.name)).toEqual([...all.map((e) => e.name)].sort((a, b) => a.localeCompare(b)));
  });

  it('searches names by every word, ignoring case and punctuation', () => {
    expect(ids({ text: 'BENCH press' })).toContain('barbell-bench-press');
    expect(ids({ text: 'press bench dumbbell' })).toContain('dumbbell-bench-press');
    expect(ids({ text: 'zzzz' })).toEqual([]);
  });

  it('filters by muscle (primary or secondary)', () => {
    const chest = filterExercises({ ...NO_QUERY, muscle: 'chest' });
    expect(chest.length).toBeGreaterThan(0);
    expect(chest.every((e) => e.primaryMuscles.includes('chest') || e.secondaryMuscles.includes('chest'))).toBe(true);
  });

  it('filters by equipment, and bodyweight means no equipment', () => {
    expect(filterExercises({ ...NO_QUERY, equipment: 'barbell' }).every((e) => e.requires.includes('barbell'))).toBe(true);
    const bodyweight = filterExercises({ ...NO_QUERY, equipment: 'bodyweight' });
    expect(bodyweight.length).toBeGreaterThan(0);
    expect(bodyweight.every((e) => e.requires.length === 0)).toBe(true);
  });

  it('combines text, muscle and equipment', () => {
    const result = filterExercises({ ...NO_QUERY, text: 'press', muscle: 'chest', equipment: 'dumbbells' });
    expect(result.map((e) => e.id)).toContain('dumbbell-bench-press');
    expect(result.every((e) => e.requires.includes('dumbbells') && /press/i.test(e.name))).toBe(true);
  });

  it('search also matches muscle and equipment words', () => {
    expect(ids({ text: 'hamstrings' })).toContain('romanian-deadlift');
    expect(ids({ text: 'bodyweight' })).toContain('push-up');
  });

  it('filters by type tag; every exercise has one', () => {
    expect(EXERCISE_LIBRARY.every((e) => e.categories.length > 0)).toBe(true);
    expect(ids({ category: 'cardio' })).toEqual(expect.arrayContaining(['burpees', 'bike-intervals']));
    expect(ids({ category: 'cardio' })).not.toContain('back-squat');
    expect(ids({ category: 'mobility' })).toEqual(expect.arrayContaining(['bird-dog', 'dead-bug']));
    expect(ids({ category: 'core' })).toContain('plank');
    expect(CATEGORY_OPTIONS).toEqual(['strength', 'core', 'mobility', 'cardio']);
  });

  it('offers only muscles and equipment the catalog uses', () => {
    expect(MUSCLE_OPTIONS.length).toBeGreaterThan(5);
    expect(EQUIPMENT_OPTIONS[0]).toEqual({ value: 'bodyweight', label: 'Bodyweight' });
    for (const option of EQUIPMENT_OPTIONS) {
      expect(filterExercises({ ...NO_QUERY, equipment: option.value }).length).toBeGreaterThan(0);
    }
  });
});
