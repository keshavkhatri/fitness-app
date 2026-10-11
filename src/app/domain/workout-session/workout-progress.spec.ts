import { CalendarDate, calendarDateOf } from '../fitness-profile';
import { BODYWEIGHT_PROFILE, finishedLog, planFor } from './testing/workout-log-fixtures';
import { trainingOverview } from './workout-history';
import { WorkoutLog } from './workout-log.model';
import { isBetterSet, performedExercises, recentBest, recentExercisePerformance, topSet, weeklyActivity } from './workout-progress';

const localDate = (instant: string) => calendarDateOf(new Date(instant));
const day = (year: number, month: number, d: number): CalendarDate => ({ year, month, day: d });
const local = (month: number, d: number, hour = 9) => new Date(2026, month - 1, d, hour, 0);

/** Bench press weights per session, to model changing performance. */
const benchAt = (startedAt: Date, weight: number, reps: number, unit: 'kg' | 'lb' = 'kg'): WorkoutLog =>
  finishedLog({
    startedAt,
    minutes: 45,
    weightUnit: unit,
    entry: (e, s) => (e === 0 ? { weight: s === 1 ? weight : weight - 2.5, reps } : { weight: 20, reps: 10 }),
  });

describe('workout progress (domain)', () => {
  describe('weekly activity (Monday–Sunday)', () => {
    const logs = [
      finishedLog({ startedAt: local(10, 5, 7), minutes: 40 }), // Monday
      finishedLog({ startedAt: local(10, 7, 7), minutes: 40 }), // Wednesday
      finishedLog({ startedAt: local(10, 7, 18), minutes: 40 }), // Wednesday again
      finishedLog({ startedAt: local(10, 11, 20), minutes: 30 }), // Sunday
      finishedLog({ startedAt: local(10, 4, 9), minutes: 40 }), // Sunday before: last week
      finishedLog({ startedAt: local(10, 12, 9), minutes: 40 }), // Monday after: next week
      finishedLog({ startedAt: local(10, 9, 9), minutes: 5, complete: () => false }), // nothing completed
    ];

    it('counts training workouts per day of the current week only', () => {
      const week = weeklyActivity(logs, day(2026, 10, 8), localDate);
      expect(week.map((d) => d.date)).toEqual([5, 6, 7, 8, 9, 10, 11].map((d) => day(2026, 10, d)));
      expect(week.map((d) => d.workouts)).toEqual([1, 0, 2, 0, 0, 0, 1]);
    });

    it('sums each day’s start-to-finish minutes (0 on days without workouts)', () => {
      const a = finishedLog({ startedAt: local(10, 6, 7), minutes: 30 });
      const b = finishedLog({ startedAt: local(10, 6, 18), minutes: 45 });
      const week = weeklyActivity([a, b], day(2026, 10, 8), localDate);
      expect(week.map((d) => d.minutes)).toEqual([0, 75, 0, 0, 0, 0, 0]);
    });

    it('a workout with zero completed sets is not activity', () => {
      expect(weeklyActivity(logs, day(2026, 10, 8), localDate)[4].workouts).toBe(0);
    });

    it('a partial workout with completed sets counts', () => {
      const partial = finishedLog({ startedAt: local(10, 9), minutes: 20, complete: (e) => e === 0, skipRest: true });
      expect(weeklyActivity([partial], day(2026, 10, 9), localDate)[4].workouts).toBe(1);
    });

    it('agrees with the overview’s weekly count, on Monday and on Sunday', () => {
      for (const today of [day(2026, 10, 5), day(2026, 10, 11)]) {
        const week = weeklyActivity(logs, today, localDate);
        expect(week.reduce((n, d) => n + d.workouts, 0)).toBe(trainingOverview(logs, today, localDate).workoutsThisWeek);
      }
      expect(weeklyActivity(logs, day(2026, 10, 12), localDate).map((d) => d.workouts)).toEqual([1, 0, 0, 0, 0, 0, 0]);
    });
  });

  describe('performed exercises', () => {
    it('lists exercises with completed sets, most recently performed first, grouped by id', () => {
      const older = finishedLog({ startedAt: local(10, 5), minutes: 40, sessionId: 'day-2-lower' });
      const newer = finishedLog({ startedAt: local(10, 8), minutes: 40, complete: (e) => e < 2 });
      const list = performedExercises([older, newer]);
      expect(list.slice(0, 2).map((p) => p.exerciseId)).toEqual(['barbell-bench-press', 'barbell-row']);
      expect(list.map((p) => p.exerciseId)).toContain('back-squat');
      expect(new Set(list.map((p) => p.exerciseId)).size).toBe(list.length);
      expect(recentExercisePerformance([older, newer], 3).map((p) => p.exerciseId)).toEqual(list.slice(0, 3).map((p) => p.exerciseId));
    });

    it('groups by exercise id even when the recorded name changed', () => {
      const old = benchAt(local(10, 1), 60, 8);
      const renamed = { ...old, exercises: old.exercises.map((e, i) => (i === 0 ? { ...e, name: 'Old Bench Name' } : e)) };
      const recent = benchAt(local(10, 8), 62.5, 8);
      const bench = performedExercises([renamed, recent]).find((p) => p.exerciseId === 'barbell-bench-press')!;
      expect(bench.sessions).toHaveLength(2);
      expect(bench.exerciseName).toBe('Bench Press'); // the latest log's name
    });

    it('skipped and not-done sets never count as performance', () => {
      const partial = finishedLog({ startedAt: local(10, 8), minutes: 30, complete: (e, s) => e === 0 && s === 0, skipRest: true });
      const list = performedExercises([partial]);
      expect(list.map((p) => p.exerciseId)).toEqual(['barbell-bench-press']);
      expect(list[0].sessions[0].sets).toHaveLength(1);
    });

    it('is empty without completed sets', () => {
      expect(performedExercises([])).toEqual([]);
      expect(performedExercises([finishedLog({ startedAt: local(10, 8), minutes: 2, complete: () => false })])).toEqual([]);
    });
  });

  describe('top set and recent best', () => {
    it('weight and reps: heaviest, then most reps; ties keep the earlier set', () => {
      const log = finishedLog({
        startedAt: local(10, 8),
        minutes: 40,
        entry: (e, s) => ({ weight: [60, 62.5, 62.5, 60][s] ?? 20, reps: [8, 6, 7, 9][s] ?? 10 }),
      });
      const session = performedExercises([log]).find((p) => p.exerciseId === 'barbell-bench-press')!.sessions[0];
      expect(topSet(session)).toMatchObject({ setNumber: 3, weight: 62.5, reps: 7 });
    });

    it('bodyweight compares reps and timed work compares duration, never inventing weight', () => {
      const plan = planFor(BODYWEIGHT_PROFILE);
      const log = finishedLog({ plan, sessionId: plan.sessions[0].id, startedAt: local(10, 8), minutes: 35 });
      const list = performedExercises([log]);
      const pushUps = list.find((p) => p.exerciseId === 'push-up')!;
      expect(topSet(pushUps.sessions[0])).toMatchObject({ reps: 10, weight: null });
      const timed = list.find((p) => p.sessions[0].logging === 'duration')!;
      expect(topSet(timed.sessions[0])).toMatchObject({ durationSeconds: 40, weight: null, reps: null });
    });

    it('recent best looks across recent comparable sessions; ties keep the more recent', () => {
      const logs = [benchAt(local(9, 28), 65, 8), benchAt(local(10, 1), 60, 8), benchAt(local(10, 5), 65, 8), benchAt(local(10, 8), 62.5, 8)];
      const bench = performedExercises(logs).find((p) => p.exerciseId === 'barbell-bench-press')!;
      const best = recentBest(bench)!;
      expect(best.set).toMatchObject({ weight: 65, reps: 8 });
      expect(best.session.completedAt).toBe(logs[2].completedAt);
      expect(best.sessionsConsidered).toBe(4);
      expect(recentBest(bench, 1)?.set).toMatchObject({ weight: 62.5 });
    });

    it('never compares kilograms with pounds', () => {
      const logs = [benchAt(local(10, 1), 140, 8, 'lb'), benchAt(local(10, 8), 62.5, 8, 'kg')];
      const bench = performedExercises(logs).find((p) => p.exerciseId === 'barbell-bench-press')!;
      expect(recentBest(bench)).toMatchObject({ set: { weight: 62.5 }, sessionsConsidered: 1 });
    });

    it('isBetterSet follows the mode’s rule', () => {
      const set = (weight: number | null, reps: number | null, durationSeconds: number | null) => ({ setNumber: 1, weight, reps, durationSeconds, completedAt: '' });
      expect(isBetterSet('weight-reps', set(60, 9, null), set(60, 8, null))).toBe(true);
      expect(isBetterSet('weight-reps', set(57.5, 12, null), set(60, 8, null))).toBe(false);
      expect(isBetterSet('reps', set(null, 15, null), set(null, 12, null))).toBe(true);
      expect(isBetterSet('duration', set(null, null, 45), set(null, null, 60))).toBe(false);
    });
  });
});
