import { UserFitnessProfile } from '../fitness-profile';
import { EXERCISE_LIBRARY, Exercise, WorkoutPlan, WorkoutSession } from '../workout-programming';
import {
  CUSTOM_PLAN_LIMITS,
  CustomPlanSpec,
  applyCustomPlan,
  customSpecFromPlan,
  defaultCustomExercise,
  validateCustomPlan,
} from './custom-plan';
import { parseWorkoutPlan } from './parse-workout-plan';
import { generateWorkoutPlanForProfile } from './training-plan';

const PROFILE: UserFitnessProfile = {
  primaryGoal: 'build-muscle',
  dateOfBirth: '1990-06-15',
  sex: 'male',
  height: { centimeters: 180 },
  weight: { kilograms: 80 },
  unitSystem: 'metric',
  trainingExperience: 'beginner',
  trainingDaysPerWeek: 5,
  trainingLocation: 'gym',
  equipment: ['full-gym'],
  activityLevel: 'moderately-active',
  goalTarget: { targetWeight: null },
  updatedAt: '2026-10-01T09:00:00.000Z',
};

const generated = (): WorkoutPlan => {
  const result = generateWorkoutPlanForProfile(PROFILE, { generatedAt: '2026-10-08' });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
};

const resistance = (plan: WorkoutPlan) => plan.sessions.filter((s): s is WorkoutSession => s.kind === 'resistance');
const byId = (id: string) => EXERCISE_LIBRARY.find((e) => e.id === id) as Exercise;
const timed = EXERCISE_LIBRARY.find((e) => e.measurement === 'time') as Exercise;
const repsExercise = (id: string) => byId(id);

/** A valid spec: every resistance day gets the same two picks. */
function specFor(plan: WorkoutPlan, ids = ['barbell-bench-press', 'lat-pulldown']): CustomPlanSpec {
  return {
    days: resistance(plan).map((s) => ({
      sessionId: s.id,
      exercises: ids.map((id) => ({ exerciseId: id, sets: 3, target: { kind: 'reps' as const, min: 8, max: 12 }, restSeconds: 90 })),
    })),
  };
}

describe('custom workout plan (domain)', () => {
  it('the editable form of a generated plan is valid as it is', () => {
    const plan = generated();
    const spec = customSpecFromPlan(plan);
    expect(spec.days.map((d) => d.sessionId)).toEqual(resistance(plan).map((s) => s.id));
    expect(validateCustomPlan(plan, spec)).toEqual([]);
  });

  describe('validation', () => {
    const plan = generated();
    const valid = specFor(plan);
    const first = valid.days[0].sessionId;
    const withFirstDay = (exercises: CustomPlanSpec['days'][number]['exercises']): CustomPlanSpec => ({
      days: [{ sessionId: first, exercises }, ...valid.days.slice(1)],
    });
    const one = valid.days[0].exercises[0];
    const codes = (spec: CustomPlanSpec) => validateCustomPlan(plan, spec).map((i) => i.code);

    it('accepts a valid spec', () => {
      expect(codes(valid)).toEqual([]);
    });

    it('rejects an empty day, too many exercises and duplicates', () => {
      expect(codes(withFirstDay([]))).toEqual(['empty-day']);
      const many = EXERCISE_LIBRARY.slice(0, CUSTOM_PLAN_LIMITS.exercisesPerDay.max + 1).map((e) => ({ ...one, exerciseId: e.id, target: e.measurement === 'time' ? { kind: 'time' as const, seconds: 30 } : one.target }));
      expect(codes(withFirstDay(many))).toContain('too-many-exercises');
      expect(codes(withFirstDay([one, one]))).toEqual(['duplicate-exercise']);
    });

    it('rejects unknown exercises (nothing is invented outside the catalog)', () => {
      expect(codes(withFirstDay([{ ...one, exerciseId: 'made-up-lift' }]))).toEqual(['unknown-exercise']);
    });

    it('rejects out-of-range sets, reps, time and rest, and reversed rep ranges', () => {
      const bad = (patch: Partial<typeof one>) => codes(withFirstDay([{ ...one, ...patch }]));
      expect(bad({ sets: 0 })).toEqual(['invalid-sets']);
      expect(bad({ sets: 11 })).toEqual(['invalid-sets']);
      expect(bad({ sets: 2.5 })).toEqual(['invalid-sets']);
      expect(bad({ restSeconds: -1 })).toEqual(['invalid-rest']);
      expect(bad({ restSeconds: 0 })).toEqual([]);
      expect(bad({ target: { kind: 'reps', min: 0, max: 5 } })).toEqual(['invalid-reps']);
      expect(bad({ target: { kind: 'reps', min: 12, max: 8 } })).toEqual(['invalid-reps']);
      expect(bad({ target: { kind: 'reps', min: 5, max: 101 } })).toEqual(['invalid-reps']);
    });

    it('timed exercises take seconds, rep exercises take reps', () => {
      const timedSpec = { ...one, exerciseId: timed.id };
      expect(codes(withFirstDay([timedSpec]))).toEqual(['target-mismatch']);
      expect(codes(withFirstDay([{ ...timedSpec, target: { kind: 'time', seconds: 45 } }]))).toEqual([]);
      expect(codes(withFirstDay([{ ...timedSpec, target: { kind: 'time', seconds: 2 } }]))).toEqual(['invalid-seconds']);
      expect(codes(withFirstDay([{ ...one, target: { kind: 'time', seconds: 45 } }]))).toEqual(['target-mismatch']);
    });

    it('requires every resistance day, and only the plan’s own days', () => {
      expect(codes({ days: valid.days.slice(1) })).toEqual(['missing-session']);
      expect(codes({ days: [...valid.days, { sessionId: 'day-9-nope', exercises: [one] }] })).toEqual(['unknown-session']);
    });
  });

  describe('applying', () => {
    it('replaces each resistance day’s exercises, keeping days, ids, names, activity days and the profile-derived facts', () => {
      const base = generated();
      const result = applyCustomPlan(base, specFor(base), '2026-10-09');
      expect(result.ok).toBe(true);
      const plan = (result as { value: WorkoutPlan }).value;

      expect(plan.sessions.map((s) => [s.id, s.name, s.kind, s.dayIndex])).toEqual(base.sessions.map((s) => [s.id, s.name, s.kind, s.dayIndex]));
      expect(plan.sessions.filter((s) => s.kind === 'activity')).toEqual(base.sessions.filter((s) => s.kind === 'activity'));
      for (const session of resistance(plan)) {
        expect(session.exercises.map((e) => [e.order, e.exerciseId, e.sets, e.target, e.restSeconds])).toEqual([
          [1, 'barbell-bench-press', 3, { kind: 'reps', min: 8, max: 12 }, 90],
          [2, 'lat-pulldown', 3, { kind: 'reps', min: 8, max: 12 }, 90],
        ]);
        expect(session.estimatedDurationMinutes).toBeGreaterThan(0);
        expect(session.objectives).toEqual([]);
      }
      expect(plan).toMatchObject({
        custom: { editedAt: '2026-10-09' },
        goal: base.goal,
        experience: base.experience,
        daysPerWeek: base.daysPerWeek,
        generatedAt: base.generatedAt,
        warnings: [],
      });
      expect(plan.explanation.availability).toEqual(base.explanation.availability);
      expect(plan.id).toMatch(/^custom-[0-9a-f]{8}$/);
      // The generated plan is not touched.
      expect(base.custom).toBeUndefined();
    });

    it('is deterministic: the same picks give the same plan id; other picks do not', () => {
      const base = generated();
      const id = (ids?: string[]) => (applyCustomPlan(base, specFor(base, ids), '2026-10-09') as { value: WorkoutPlan }).value.id;
      expect(id()).toBe(id());
      expect(id(['barbell-bench-press'])).not.toBe(id());
    });

    it('prescriptions match the exercise kind: per-side, timed and bodyweight notes, with a matching progression rule', () => {
      const base = generated();
      const pick = (e: Exercise) => defaultCustomExercise(e, base);
      const unilateral = EXERCISE_LIBRARY.find((e) => e.laterality === 'unilateral' && e.measurement === 'reps') as Exercise;
      const days = resistance(base).map((s, i) => ({
        sessionId: s.id,
        exercises: i === 0 ? [pick(timed), pick(unilateral), pick(repsExercise('barbell-bench-press'))] : [pick(repsExercise('lat-pulldown'))],
      }));
      const result = applyCustomPlan(base, { days }, '2026-10-09');
      expect(result.ok).toBe(true);
      const [t, u, b] = resistance((result as { value: WorkoutPlan }).value)[0].exercises;
      expect(t.target.kind).toBe('time');
      expect(t.notes).toContain('time-based');
      expect(t.progression.type).toBe('time-progression');
      expect(u.notes).toContain('per-side');
      expect(b.progression.type).toBe('double-progression');
    });

    it('returns the issues and builds nothing when the spec is invalid', () => {
      const base = generated();
      const result = applyCustomPlan(base, { days: [] }, '2026-10-09');
      expect(result.ok).toBe(false);
    });

    it('a custom plan can itself be edited again (still custom, new edit date)', () => {
      const base = generated();
      const first = (applyCustomPlan(base, specFor(base), '2026-10-09') as { value: WorkoutPlan }).value;
      const second = applyCustomPlan(first, specFor(first, ['deadlift']), '2026-10-12');
      expect(second.ok && second.value.custom).toEqual({ editedAt: '2026-10-12' });
    });

    it('recomputes weekly volume from the user’s picks', () => {
      const base = generated();
      const plan = (applyCustomPlan(base, specFor(base, ['barbell-bench-press']), '2026-10-09') as { value: WorkoutPlan }).value;
      expect(plan.explanation.weeklyVolume.chest.sets).toBe(3 * resistance(plan).length);
      expect(plan.explanation.weeklyVolume.quads.sets).toBe(0);
      expect(plan.explanation.weeklyVolume.quads.status).not.toBe('within');
    });
  });

  describe('storage format', () => {
    it('a custom plan survives serialize → parse, keeping its mark', () => {
      const base = generated();
      const plan = (applyCustomPlan(base, specFor(base), '2026-10-09') as { value: WorkoutPlan }).value;
      expect(parseWorkoutPlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
    });

    it('a generated plan has no mark, and a malformed mark invalidates the plan rather than passing as generated', () => {
      const base = generated();
      expect(parseWorkoutPlan(JSON.parse(JSON.stringify(base)))?.custom).toBeUndefined();
      expect(parseWorkoutPlan({ ...JSON.parse(JSON.stringify(base)), custom: { editedAt: 'yesterday' } })).toBeNull();
      expect(parseWorkoutPlan({ ...JSON.parse(JSON.stringify(base)), custom: 'yes' })).toBeNull();
    });

    it('a stored custom plan with an exercise outside the catalog is rejected', () => {
      const base = generated();
      const plan = JSON.parse(JSON.stringify((applyCustomPlan(base, specFor(base), '2026-10-09') as { value: WorkoutPlan }).value));
      plan.sessions[0].exercises[0].exerciseId = 'made-up-lift';
      expect(parseWorkoutPlan(plan)).toBeNull();
    });
  });
});
