import { UserFitnessProfile } from '../fitness-profile';
import { generateWorkoutPlanForProfile } from '../training-plan';
import { WorkoutPlan, WorkoutSession } from '../workout-programming';
import { parseWorkoutLog } from './parse-workout-log';
import {
  completeSet,
  finishWorkout,
  goToExercise,
  nextPendingSet,
  resetSet,
  skipExercise,
  skipSet,
  startDecision,
  startWorkoutLog,
  summarizeWorkoutLog,
  totalPendingSets,
  validateEntry,
} from './workout-log';
import { WorkoutLog, WorkoutLogResult } from './workout-log.model';

const PROFILE: UserFitnessProfile = {
  primaryGoal: 'build-muscle',
  dateOfBirth: '1990-06-15',
  sex: 'male',
  height: { centimeters: 180 },
  weight: { kilograms: 80 },
  unitSystem: 'metric',
  trainingExperience: 'intermediate',
  trainingDaysPerWeek: 4,
  trainingLocation: 'gym',
  equipment: ['full-gym'],
  activityLevel: 'moderately-active',
  goalTarget: { targetWeight: null },
  updatedAt: '2026-10-01T09:00:00.000Z',
};

const planFor = (profile: UserFitnessProfile = PROFILE): WorkoutPlan => {
  const result = generateWorkoutPlanForProfile(profile, { generatedAt: '2026-10-08' });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
};

const START = '2026-10-08T09:00:00.000Z';
const at = (minutes: number) => new Date(Date.parse(START) + minutes * 60_000).toISOString();

const value = <T>(result: WorkoutLogResult<T>): T => {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
};
const start = (plan = planFor(), sessionId = 'day-1-upper') =>
  value(startWorkoutLog(plan, sessionId, { id: 'wl-1', startedAt: START, weightUnit: 'kg' }));

describe('workout log (domain)', () => {
  describe('starting from a planned session', () => {
    it('snapshots the session, its exercises and prescriptions; everything pending', () => {
      const plan = planFor();
      const session = plan.sessions[0] as WorkoutSession;
      const log = start(plan);

      expect(log).toMatchObject({
        id: 'wl-1',
        source: { planId: plan.id, workoutProgrammingVersion: 'v2', sessionId: 'day-1-upper' },
        sessionType: 'upper',
        variant: 'A',
        weightUnit: 'kg',
        startedAt: START,
        completedAt: null,
        status: 'in-progress',
        currentExerciseIndex: 0,
      });
      expect(log.exercises.map((e) => e.exerciseId)).toEqual(session.exercises.map((e) => e.exerciseId));
      expect(log.exercises[0]).toEqual({
        exerciseId: 'barbell-bench-press',
        name: 'Bench Press',
        order: 1,
        planned: { sets: 4, target: { kind: 'reps', min: 6, max: 10 }, restSeconds: 120, perSide: false },
        logging: 'weight-reps',
        sets: [1, 2, 3, 4].map((setNumber) => ({
          setNumber,
          status: 'pending',
          weight: null,
          reps: null,
          durationSeconds: null,
          completedAt: null,
        })),
      });
    });

    it('chooses what to record from the exercise: weight and reps, reps only, or duration', () => {
      const home = planFor({ ...PROFILE, trainingLocation: 'home', equipment: ['bodyweight-only'], primaryGoal: 'lose-fat', trainingExperience: 'beginner', trainingDaysPerWeek: 3 });
      const log = start(home, home.sessions[0].id);
      const modes = Object.fromEntries(log.exercises.map((e) => [e.exerciseId, e.logging]));
      expect(modes['push-up']).toBe('reps');
      expect(modes['mountain-climbers']).toBe('duration');
      const gym = start(planFor(), 'day-2-lower');
      expect(gym.exercises.find((e) => e.exerciseId === 'back-squat')?.logging).toBe('weight-reps');
      expect(gym.exercises.find((e) => e.planned.perSide)).toBeDefined();
    });

    it('never modifies the plan', () => {
      const plan = planFor();
      const before = structuredClone(plan);
      let log = start(plan);
      log = value(completeSet(log, { exercise: 0, set: 0 }, { weight: 60, reps: 8 }, at(3)));
      log = value(skipExercise(log, 1));
      value(finishWorkout(log, at(40)));
      expect(plan).toEqual(before);
    });

    it('keeps its snapshot when the plan is regenerated later', () => {
      const log = start(planFor());
      const regenerated = planFor({ ...PROFILE, primaryGoal: 'get-stronger' });
      expect(regenerated.id).not.toBe(log.source.planId);
      // The log carries everything it needs; nothing points back into the plan.
      const next = value(completeSet(log, { exercise: 0, set: 0 }, { weight: 60, reps: 8 }, at(3)));
      expect(next.exercises[0].planned).toEqual(log.exercises[0].planned);
      expect(next.source.planId).toBe(log.source.planId);
    });

    it.each([
      ['an unknown session', 'day-9-upper', 'session-not-found'],
      ['an activity day', 'day-2-light-activity', 'not-a-resistance-session'],
    ])('refuses %s', (_, id, code) => {
      const plan = planFor({ ...PROFILE, trainingExperience: 'beginner', trainingDaysPerWeek: 5 });
      const result = startWorkoutLog(plan, id, { id: 'x', startedAt: START, weightUnit: 'kg' });
      expect(result.ok ? null : result.error.code).toBe(code);
    });

    it('rejects an invalid start time', () => {
      const result = startWorkoutLog(planFor(), 'day-1-upper', { id: 'x', startedAt: 'yesterday', weightUnit: 'kg' });
      expect(result.ok ? null : result.error.code).toBe('invalid-timestamp');
    });
  });

  describe('one active workout at a time', () => {
    it('starts when nothing is active, resumes the same session, reports a conflict otherwise', () => {
      const active = start();
      expect(startDecision(null, 'day-1-upper')).toBe('start');
      expect(startDecision(active, 'day-1-upper')).toBe('resume');
      expect(startDecision(active, 'day-3-upper')).toBe('conflict');
      expect(startDecision(value(finishWorkout(active, at(30))), 'day-3-upper')).toBe('start');
    });
  });

  describe('sets', () => {
    it('completes a set with the values for its logging mode, at the given time', () => {
      const log = value(completeSet(start(), { exercise: 0, set: 1 }, { weight: 62.5, reps: 8, durationSeconds: 99 }, at(5)));
      expect(log.exercises[0].sets[1]).toEqual({
        setNumber: 2,
        status: 'completed',
        weight: 62.5,
        reps: 8,
        durationSeconds: null,
        completedAt: at(5),
      });
      expect(log.exercises[0].sets[0].status).toBe('pending');
    });

    it('a completed set can be corrected', () => {
      let log = value(completeSet(start(), { exercise: 0, set: 0 }, { weight: 60, reps: 8 }, at(3)));
      log = value(completeSet(log, { exercise: 0, set: 0 }, { weight: 60, reps: 10 }, at(4)));
      expect(log.exercises[0].sets[0]).toMatchObject({ reps: 10, completedAt: at(4) });
    });

    it('skipped is explicit and distinct from completed, with no values', () => {
      const log = value(skipSet(start(), { exercise: 0, set: 3 }));
      expect(log.exercises[0].sets[3]).toEqual({ setNumber: 4, status: 'skipped', weight: null, reps: null, durationSeconds: null, completedAt: null });
      expect(summarizeWorkoutLog(log).setsCompleted).toBe(0);
      expect(summarizeWorkoutLog(log).setsSkipped).toBe(1);
    });

    it('reset returns a completed or skipped set to pending', () => {
      let log = value(completeSet(start(), { exercise: 0, set: 0 }, { weight: 60, reps: 8 }, at(3)));
      log = value(resetSet(log, { exercise: 0, set: 0 }));
      expect(log.exercises[0].sets[0].status).toBe('pending');
      expect(log.exercises[0].sets[0].weight).toBeNull();
    });

    it('skipping an exercise skips only its pending sets', () => {
      let log = value(completeSet(start(), { exercise: 0, set: 0 }, { weight: 60, reps: 8 }, at(3)));
      log = value(skipExercise(log, 0));
      expect(log.exercises[0].sets.map((s) => s.status)).toEqual(['completed', 'skipped', 'skipped', 'skipped']);
      expect(log.exercises[1].sets.every((s) => s.status === 'pending')).toBe(true);
    });

    it('is immutable: the previous log is unchanged', () => {
      const before = start();
      const snapshot = structuredClone(before);
      value(completeSet(before, { exercise: 0, set: 0 }, { weight: 60, reps: 8 }, at(3)));
      expect(before).toEqual(snapshot);
    });

    describe('invalid input', () => {
      it.each<[string, Parameters<typeof validateEntry>, string]>([
        ['missing weight', ['weight-reps', { reps: 8 }], 'weight'],
        ['negative weight', ['weight-reps', { weight: -5, reps: 8 }], 'weight'],
        ['absurd weight', ['weight-reps', { weight: 5000, reps: 8 }], 'weight'],
        ['three-decimal weight', ['weight-reps', { weight: 20.125, reps: 8 }], 'weight'],
        ['missing reps', ['weight-reps', { weight: 60 }], 'reps'],
        ['zero reps', ['reps', { reps: 0 }], 'reps'],
        ['fractional reps', ['reps', { reps: 7.5 }], 'reps'],
        ['missing duration', ['duration', {}], 'durationSeconds'],
        ['fractional duration', ['duration', { durationSeconds: 30.5 }], 'durationSeconds'],
        ['NaN reps', ['reps', { reps: Number.NaN }], 'reps'],
      ])('%s', (_, [mode, entry], field) => {
        const result = validateEntry(mode, entry);
        expect(result.ok ? null : result.error).toMatchObject({ code: 'invalid-entry', field });
      });

      it('accepts valid entries, ignoring fields the mode does not use', () => {
        expect(validateEntry('weight-reps', { weight: 0.1, reps: 1 })).toEqual({ ok: true, value: { weight: 0.1, reps: 1, durationSeconds: null } });
        expect(validateEntry('reps', { weight: 20, reps: 12 })).toEqual({ ok: true, value: { weight: null, reps: 12, durationSeconds: null } });
        expect(validateEntry('duration', { reps: 3, durationSeconds: 45 })).toEqual({ ok: true, value: { weight: null, reps: null, durationSeconds: 45 } });
      });

      it('rejects bad positions and leaves the log unchanged', () => {
        const log = start();
        for (const result of [
          completeSet(log, { exercise: 99, set: 0 }, { weight: 1, reps: 1 }, at(1)),
          completeSet(log, { exercise: 0, set: 9 }, { weight: 1, reps: 1 }, at(1)),
          skipSet(log, { exercise: -1, set: 0 }),
          skipExercise(log, 42),
          goToExercise(log, 7.5),
        ]) {
          expect(result.ok ? null : result.error.code).toBe('invalid-position');
        }
      });
    });
  });

  describe('navigation, finishing and summary', () => {
    it('moves between exercises and remembers the current one', () => {
      const log = value(goToExercise(start(), 3));
      expect(log.currentExerciseIndex).toBe(3);
      expect(nextPendingSet(log.exercises[3])).toBe(0);
    });

    it('finishes a complete workout', () => {
      let log = start();
      log.exercises.forEach((e, ei) =>
        e.sets.forEach((_, si) => {
          log = value(completeSet(log, { exercise: ei, set: si }, { weight: 20, reps: 10, durationSeconds: 30 }, at(1 + ei)));
        }),
      );
      log = value(finishWorkout(log, at(47)));
      expect(log).toMatchObject({ status: 'completed', completedAt: at(47) });
      expect(summarizeWorkoutLog(log)).toEqual({
        durationSeconds: 47 * 60,
        totalExercises: 7,
        exercisesCompleted: 7,
        totalSets: log.exercises.reduce((n, e) => n + e.sets.length, 0),
        setsCompleted: log.exercises.reduce((n, e) => n + e.sets.length, 0),
        setsSkipped: 0,
        setsIncomplete: 0,
        fullyCompleted: true,
      });
    });

    it('finishes an incomplete workout, keeping pending and skipped sets distinguishable', () => {
      let log = value(completeSet(start(), { exercise: 0, set: 0 }, { weight: 60, reps: 8 }, at(3)));
      log = value(skipExercise(log, 1));
      expect(totalPendingSets(log)).toBeGreaterThan(0);
      log = value(finishWorkout(log, at(20)));
      const summary = summarizeWorkoutLog(log);
      expect(summary).toMatchObject({ setsCompleted: 1, setsSkipped: 3, fullyCompleted: false, exercisesCompleted: 0, durationSeconds: 1200 });
      expect(summary.setsIncomplete).toBe(summary.totalSets - 4);
    });

    it('a finished workout can no longer be edited', () => {
      const done = value(finishWorkout(start(), at(5)));
      expect(completeSet(done, { exercise: 0, set: 0 }, { weight: 1, reps: 1 }, at(6))).toMatchObject({
        ok: false,
        error: { code: 'workout-not-in-progress' },
      });
      expect(finishWorkout(done, at(7))).toMatchObject({ ok: false, error: { code: 'workout-not-in-progress' } });
    });

    it('rejects a finish time before the start', () => {
      expect(finishWorkout(start(), at(-5))).toMatchObject({ ok: false, error: { code: 'invalid-timestamp' } });
    });

    it('reports elapsed time for an in-progress workout', () => {
      expect(summarizeWorkoutLog(start(), at(12)).durationSeconds).toBe(720);
    });
  });

  describe('interrupted workouts: stored and recovered', () => {
    it('round-trips through JSON unchanged (pending, completed and skipped sets)', () => {
      let log: WorkoutLog = value(completeSet(start(), { exercise: 0, set: 0 }, { weight: 60, reps: 8 }, at(3)));
      log = value(skipSet(log, { exercise: 0, set: 1 }));
      log = value(goToExercise(log, 2));
      expect(parseWorkoutLog(JSON.parse(JSON.stringify(log)))).toEqual(log);
      const done = value(finishWorkout(log, at(30)));
      expect(parseWorkoutLog(JSON.parse(JSON.stringify(done)))).toEqual(done);
    });

    it.each<[string, (log: any) => void]>([
      ['unknown status', (l) => (l.status = 'paused')],
      ['completed without completion time', (l) => (l.status = 'completed')],
      ['completion time while in progress', (l) => (l.completedAt = at(5))],
      ['current exercise out of range', (l) => (l.currentExerciseIndex = 99)],
      ['set count differs from the plan snapshot', (l) => l.exercises[0].sets.pop()],
      ['completed set without values', (l) => Object.assign(l.exercises[0].sets[0], { status: 'completed', completedAt: at(1) })],
      ['pending set with values', (l) => (l.exercises[0].sets[0].reps = 8)],
      ['unknown logging mode', (l) => (l.exercises[0].logging = 'vibes')],
      ['unknown weight unit', (l) => (l.weightUnit = 'stone')],
      ['unknown programming version', (l) => (l.source.workoutProgrammingVersion = 'v1')],
      ['malformed start time', (l) => (l.startedAt = 'this morning')],
      ['no exercises', (l) => (l.exercises = [])],
    ])('rejects %s', (_, change) => {
      const copy = JSON.parse(JSON.stringify(start()));
      change(copy);
      expect(parseWorkoutLog(copy)).toBeNull();
    });

    it.each([null, 42, 'log', [], {}])('rejects %p', (input) => {
      expect(parseWorkoutLog(input)).toBeNull();
    });
  });
});
