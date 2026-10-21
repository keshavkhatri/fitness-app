import { parseWorkoutLog } from './parse-workout-log';
import { GYM_PROFILE, planFor } from './testing/workout-log-fixtures';
import { completeSet, finishWorkout, setRestSeconds, startWorkoutLog } from './workout-log';
import { REST_SECONDS_LIMITS, WorkoutLog, WorkoutLogResult } from './workout-log.model';

const START = '2026-10-08T09:00:00.000Z';

const value = <T>(result: WorkoutLogResult<T>): T => {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
};

const fresh = (): WorkoutLog => {
  const plan = planFor(GYM_PROFILE);
  const session = plan.sessions.find((s) => s.kind === 'resistance')!;
  return value(startWorkoutLog(plan, session.id, { id: 'wl-rest', startedAt: START, weightUnit: 'kg' }));
};

describe('setRestSeconds (the user own rest between sets)', () => {
  it('sets it for one exercise and leaves the plan rest and the other exercises alone', () => {
    const log = fresh();
    const next = value(setRestSeconds(log, 1, 45));
    expect(next.exercises[1].customRestSeconds).toBe(45);
    expect(next.exercises[1].planned.restSeconds).toBe(log.exercises[1].planned.restSeconds);
    expect(next.exercises[0].customRestSeconds).toBeUndefined();
    expect(log.exercises[1].customRestSeconds).toBeUndefined();
  });

  it('sets it for every exercise with null', () => {
    const next = value(setRestSeconds(fresh(), null, 90));
    expect(next.exercises.every((e) => (e.customRestSeconds ?? e.planned.restSeconds) === 90)).toBe(true);
  });

  it('goes back to the plan with null, and choosing the planned length stores nothing', () => {
    const custom = value(setRestSeconds(fresh(), 0, 45));
    expect(value(setRestSeconds(custom, 0, null)).exercises[0].customRestSeconds).toBeUndefined();
    const planned = custom.exercises[0].planned.restSeconds;
    expect(value(setRestSeconds(custom, 0, planned)).exercises[0].customRestSeconds).toBeUndefined();
  });

  it('keeps completed sets', () => {
    const log = value(completeSet(fresh(), { exercise: 0, set: 0 }, { weight: 60, reps: 8 }, '2026-10-08T09:05:00.000Z'));
    const next = value(setRestSeconds(log, 0, 30));
    expect(next.exercises[0].sets).toEqual(log.exercises[0].sets);
  });

  it('accepts whole seconds from 15 to 600 only', () => {
    const { min, max } = REST_SECONDS_LIMITS;
    expect(setRestSeconds(fresh(), 0, min).ok).toBe(true);
    expect(setRestSeconds(fresh(), 0, max).ok).toBe(true);
    for (const bad of [min - 1, max + 1, 0, -5, 30.5, Number.NaN]) {
      expect(setRestSeconds(fresh(), 0, bad)).toMatchObject({ ok: false, error: { code: 'invalid-rest' } });
    }
  });

  it('rejects an unknown exercise, and a finished workout', () => {
    expect(setRestSeconds(fresh(), 99, 60)).toMatchObject({ ok: false, error: { code: 'invalid-position' } });
    const done = value(finishWorkout(fresh(), '2026-10-08T10:00:00.000Z'));
    expect(setRestSeconds(done, 0, 60)).toMatchObject({ ok: false, error: { code: 'workout-not-in-progress' } });
  });

  it('survives storing and reading, and a stored value outside the range makes the log unreadable', () => {
    const log = value(setRestSeconds(fresh(), 2, 150));
    expect(parseWorkoutLog(JSON.parse(JSON.stringify(log)))?.exercises[2].customRestSeconds).toBe(150);
    const broken = JSON.parse(JSON.stringify(log));
    broken.exercises[2].customRestSeconds = 5;
    expect(parseWorkoutLog(broken)).toBeNull();
  });
});
