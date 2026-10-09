import { WorkoutLog, completeSet, skipSet, startWorkoutLog } from '../../../domain/workout-session';
import { HOME_PROFILE, PROFILE, planFor } from '../testing/workout-fixtures';
import { formatSetValues, toActiveWorkoutView, toResumeCard } from './active-workout-view-model';

const START = '2026-10-08T09:00:00.000Z';
const logFor = (profile = PROFILE, sessionId = 'day-1-upper', unit: 'kg' | 'lb' = 'kg'): WorkoutLog => {
  const result = startWorkoutLog(planFor(profile), sessionId, { id: 'wl', startedAt: START, weightUnit: unit });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
};
const must = (result: ReturnType<typeof completeSet>): WorkoutLog => {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
};

describe('active workout view model', () => {
  it('describes the workout and the current exercise from the log', () => {
    const view = toActiveWorkoutView(logFor());
    expect(view).toMatchObject({
      workoutId: 'wl',
      sessionId: 'day-1-upper',
      title: 'Upper Body A',
      position: 'Exercise 1 of 7',
      progress: { value: 0, max: 22, text: 'Exercise 1 of 7. 0 of 22 sets done.' },
      isFirst: true,
      isLast: false,
      pendingTotal: 22,
    });
    expect(view.exercise).toMatchObject({
      heading: '1. Bench Press',
      metadata: 'Chest · Barbell, bench, rack',
      planned: '4 sets · 6–10 reps · 120 sec rest',
      restSeconds: 120,
      mode: 'weight-reps',
      pending: 4,
      nextPendingSet: 0,
    });
    expect(view.exercise.fields.map((f) => [f.key, f.label, f.inputMode, f.placeholder])).toEqual([
      ['weight', 'kg', 'decimal', 'kg'],
      ['reps', 'Reps', 'numeric', '6–10'],
    ]);
  });

  it('labels weight in pounds for imperial logs', () => {
    const view = toActiveWorkoutView(logFor(PROFILE, 'day-1-upper', 'lb'));
    expect(view.exercise.fields[0]).toMatchObject({ label: 'lb', spoken: 'weight in pounds' });
  });

  it('per-side and timed exercises get matching fields', () => {
    let log = logFor(PROFILE, 'day-2-lower');
    const perSide = log.exercises.findIndex((e) => e.planned.perSide);
    log = { ...log, currentExerciseIndex: perSide };
    expect(toActiveWorkoutView(log).exercise.fields.find((f) => f.key === 'reps')).toMatchObject({ label: 'Reps / side', spoken: 'reps per side' });

    const home = logFor(HOME_PROFILE, 'day-1-full-body');
    const timed = home.exercises.findIndex((e) => e.logging === 'duration');
    const view = toActiveWorkoutView({ ...home, currentExerciseIndex: timed });
    expect(view.exercise.fields).toEqual([
      { key: 'durationSeconds', label: 'Seconds', spoken: 'seconds', inputMode: 'numeric', placeholder: '30' },
    ]);
    expect(view.exercise.sets[0].suggestion.durationSeconds).toBe('30');
  });

  it('rows carry status, values and action labels; pending rows suggest the latest values', () => {
    let log = logFor();
    log = must(completeSet(log, { exercise: 0, set: 0 }, { weight: 60, reps: 8 }, '2026-10-08T09:03:00.000Z'));
    log = must(skipSet(log, { exercise: 0, set: 1 }));
    const rows = toActiveWorkoutView(log).exercise.sets;
    expect(rows.map((r) => [r.label, r.status, r.valuesText, r.actionLabel])).toEqual([
      ['Set 1', 'completed', '60 kg × 8', 'Set 1 done: 60 kg × 8. Undo'],
      ['Set 2', 'skipped', null, 'Set 2 skipped. Undo'],
      ['Set 3', 'pending', null, 'Complete set 3'],
      ['Set 4', 'pending', null, 'Complete set 4'],
    ]);
    expect(rows[2].suggestion).toEqual({ weight: '60', reps: '8', durationSeconds: '' });
    expect(toActiveWorkoutView(log).progress.text).toBe('Exercise 1 of 7. 1 of 22 sets done.');
    expect(toActiveWorkoutView(log).exercise.nextPendingSet).toBe(2);
  });

  it('marks the first and last exercise', () => {
    const log = logFor();
    expect(toActiveWorkoutView({ ...log, currentExerciseIndex: 6 })).toMatchObject({ isFirst: false, isLast: true, position: 'Exercise 7 of 7' });
  });

  it('formats recorded values per logging mode', () => {
    const set = { setNumber: 1, status: 'completed' as const, weight: 22.5, reps: 10, durationSeconds: 45, completedAt: START };
    expect(formatSetValues(set, 'weight-reps', 'lb')).toBe('22.5 lb × 10');
    expect(formatSetValues(set, 'reps', 'kg')).toBe('10 reps');
    expect(formatSetValues(set, 'duration', 'kg')).toBe('45 sec');
    expect(formatSetValues({ ...set, status: 'skipped' }, 'reps', 'kg')).toBeNull();
  });

  it('builds the Workout tab’s resume card', () => {
    const log = must(completeSet(logFor(), { exercise: 0, set: 0 }, { weight: 60, reps: 8 }, '2026-10-08T09:03:00.000Z'));
    expect(toResumeCard(log)).toEqual({ sessionId: 'day-1-upper', title: 'Upper Body A', progress: '1 of 22 sets done' });
  });
});
