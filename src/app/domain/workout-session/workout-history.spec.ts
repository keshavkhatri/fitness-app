import { CalendarDate, calendarDateOf } from '../fitness-profile';
import { BODYWEIGHT_PROFILE, finishedLog, planFor } from './testing/workout-log-fixtures';
import { startWorkoutLog } from './workout-log';
import {
  addDays,
  completedWorkouts,
  completionStatus,
  exercisePerformance,
  groupByCompletionDay,
  isTrainingWorkout,
  startOfWeek,
  trainingOverview,
  weekdayOf,
} from './workout-history';

// Tests use local wall-clock instants and the local resolver, as the app does.
const localDate = (instant: string) => calendarDateOf(new Date(instant));
const day = (year: number, month: number, d: number): CalendarDate => ({ year, month, day: d });
const local = (month: number, d: number, hour = 9, minute = 0) => new Date(2026, month - 1, d, hour, minute);

describe('workout history (domain)', () => {
  const thursday = finishedLog({ startedAt: local(10, 8, 18), minutes: 45 }); // Thu 8 Oct, full
  const monday = finishedLog({ startedAt: local(10, 5, 7), minutes: 42, complete: (e) => e < 5, skipRest: true }); // partial
  const lastWeek = finishedLog({ startedAt: local(10, 1, 9), minutes: 50 }); // Thu 1 Oct
  const lastMonth = finishedLog({ startedAt: local(9, 28, 9), minutes: 40 }); // Mon 28 Sep (same week as 1 Oct)

  describe('listing', () => {
    it('lists finished workouts by completion time, newest first (never by plan order or name)', () => {
      const listed = completedWorkouts([lastMonth, thursday, lastWeek, monday]);
      expect(listed.map((l) => l.id)).toEqual([thursday.id, monday.id, lastWeek.id, lastMonth.id]);
    });

    it('ignores in-progress workouts', () => {
      const started = startWorkoutLog(planFor(), 'day-1-upper', { id: 'x', startedAt: local(10, 8).toISOString(), weightUnit: 'kg' });
      expect(started.ok && completedWorkouts([started.value, thursday]).map((l) => l.id)).toEqual([thursday.id]);
    });

    it('orders by completion even when a longer workout started earlier finished later', () => {
      const early = finishedLog({ startedAt: local(10, 8, 7), minutes: 120 }); // finishes 09:00
      const late = finishedLog({ startedAt: local(10, 8, 8), minutes: 30 }); // finishes 08:30
      expect(completedWorkouts([late, early]).map((l) => l.id)).toEqual([early.id, late.id]);
    });

    it('marks partial workouts as partial', () => {
      expect(completionStatus(thursday)).toBe('complete');
      expect(completionStatus(monday)).toBe('partial');
    });

    it('a finished workout with no completed set is not training', () => {
      const empty = finishedLog({ startedAt: local(10, 8, 6), minutes: 2, complete: () => false });
      expect(isTrainingWorkout(empty)).toBe(false);
      expect(isTrainingWorkout(monday)).toBe(true);
    });
  });

  describe('calendar', () => {
    it('weekday, week start and day arithmetic are time-zone free', () => {
      expect(weekdayOf(day(2026, 10, 5))).toBe(0); // Monday
      expect(weekdayOf(day(2026, 10, 11))).toBe(6); // Sunday
      expect(startOfWeek(day(2026, 10, 8))).toEqual(day(2026, 10, 5));
      expect(startOfWeek(day(2026, 10, 11))).toEqual(day(2026, 10, 5));
      expect(addDays(day(2026, 12, 31), 1)).toEqual(day(2027, 1, 1));
      expect(addDays(day(2024, 3, 1), -1)).toEqual(day(2024, 2, 29));
    });

    it('groups by the local date of completion, newest day first', () => {
      const sameDay = finishedLog({ startedAt: local(10, 8, 7), minutes: 30 });
      const groups = groupByCompletionDay([monday, sameDay, thursday, lastWeek], localDate);
      expect(groups.map((g) => [g.date, g.workouts.map((w) => w.id)])).toEqual([
        [day(2026, 10, 8), [thursday.id, sameDay.id]],
        [day(2026, 10, 5), [monday.id]],
        [day(2026, 10, 1), [lastWeek.id]],
      ]);
    });

    it('uses the completion time, not the start time, for the day', () => {
      const overMidnight = finishedLog({ startedAt: local(10, 7, 23, 40), minutes: 45 }); // ends 00:25 on 8 Oct
      expect(groupByCompletionDay([overMidnight], localDate)[0].date).toEqual(day(2026, 10, 8));
    });
  });

  describe('training overview', () => {
    const all = [thursday, monday, lastWeek, lastMonth];

    it('counts this week (Mon–Sun) and this month, from finished workouts only', () => {
      const overview = trainingOverview(all, day(2026, 10, 8), localDate);
      expect(overview).toMatchObject({ workoutsCompleted: 4, workoutsThisWeek: 2, workoutsThisMonth: 3 });
      expect(trainingOverview(all, day(2026, 10, 11), localDate).workoutsThisWeek).toBe(2); // Sunday, same week
      expect(trainingOverview(all, day(2026, 10, 12), localDate).workoutsThisWeek).toBe(0); // next Monday
      expect(trainingOverview(all, day(2026, 9, 30), localDate)).toMatchObject({ workoutsThisWeek: 2, workoutsThisMonth: 1 });
    });

    it('totals completed sets and durations, and knows the last workout', () => {
      const overview = trainingOverview(all, day(2026, 10, 8), localDate);
      const sets = (log: typeof thursday) => log.exercises.flatMap((e) => e.sets).filter((s) => s.status === 'completed').length;
      expect(overview.totalSetsCompleted).toBe(all.reduce((n, l) => n + sets(l), 0));
      expect(overview.totalDurationSeconds).toBe((45 + 42 + 50 + 40) * 60);
      expect(overview.lastWorkout?.id).toBe(thursday.id);
      expect(overview.lastWorkoutDate).toEqual(day(2026, 10, 8));
    });

    it('excludes finished workouts with nothing completed, and in-progress workouts', () => {
      const empty = finishedLog({ startedAt: local(10, 8, 20), minutes: 1, complete: () => false });
      const overview = trainingOverview([empty, thursday], day(2026, 10, 8), localDate);
      expect(overview).toMatchObject({ workoutsCompleted: 1, workoutsThisWeek: 1, lastWorkout: { id: thursday.id } });
    });

    it('is empty without history', () => {
      expect(trainingOverview([], day(2026, 10, 8), localDate)).toEqual({
        workoutsCompleted: 0,
        workoutsThisWeek: 0,
        workoutsThisMonth: 0,
        totalSetsCompleted: 0,
        totalDurationSeconds: 0,
        lastWorkout: null,
        lastWorkoutDate: null,
      });
    });
  });

  describe('exercise performance', () => {
    it('collects completed sets of one exercise across workouts, newest first, from the logs’ own data', () => {
      const perf = exercisePerformance([lastWeek, thursday, monday], 'barbell-bench-press');
      expect(perf?.exerciseName).toBe('Bench Press');
      expect(perf?.sessions.map((s) => s.workoutId)).toEqual([thursday.id, monday.id, lastWeek.id]);
      expect(perf?.sessions[0]).toMatchObject({ logging: 'weight-reps', weightUnit: 'kg' });
      expect(perf?.sessions[0].sets[0]).toEqual({
        setNumber: 1,
        weight: 40,
        reps: 10,
        durationSeconds: null,
        completedAt: thursday.exercises[0].sets[0].completedAt,
      });
    });

    it('leaves out skipped and not-done sets, and workouts where the exercise had none completed', () => {
      const partial = finishedLog({ startedAt: local(10, 6), minutes: 30, complete: (e, s) => e === 0 && s < 2, skipRest: true });
      const perf = exercisePerformance([partial], 'barbell-bench-press');
      expect(perf?.sessions[0].sets.map((s) => s.setNumber)).toEqual([1, 2]);
      expect(exercisePerformance([partial], 'barbell-row')).toBeNull();
    });

    it('timed and bodyweight work keep their own values', () => {
      const plan = planFor(BODYWEIGHT_PROFILE);
      const log = finishedLog({ plan, sessionId: plan.sessions[0].id, startedAt: local(10, 7), minutes: 35 });
      const timed = log.exercises.find((e) => e.logging === 'duration')!;
      const perf = exercisePerformance([log], timed.exerciseId);
      expect(perf?.sessions[0].sets.every((s) => s.durationSeconds !== null && s.weight === null && s.reps === null)).toBe(true);
      const pushUps = exercisePerformance([log], 'push-up');
      expect(pushUps?.sessions[0].sets.every((s) => s.reps !== null && s.weight === null)).toBe(true);
    });

    it('uses the name recorded in the log, not the current catalog', () => {
      const renamed = { ...thursday, exercises: thursday.exercises.map((e, i) => (i === 0 ? { ...e, name: 'Flat Bench (old name)' } : e)) };
      expect(exercisePerformance([renamed], 'barbell-bench-press')?.exerciseName).toBe('Flat Bench (old name)');
    });

    it('is null for an exercise never performed', () => {
      expect(exercisePerformance([thursday], 'nordic-curl')).toBeNull();
    });
  });
});
