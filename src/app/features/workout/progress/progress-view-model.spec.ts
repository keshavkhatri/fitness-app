import { calendarDateOf } from '../../../domain/fitness-profile';
import { WorkoutLog, performedExercises, trainingOverview, weeklyActivity } from '../../../domain/workout-session';
import { BODYWEIGHT_PROFILE, finishedLog, planFor } from '../../../domain/workout-session/testing/workout-log-fixtures';
import { ProgressResult } from '../../../core/workout/workout-history.service';
import { formatPerformedSet, performedOnLabel, toExerciseList, toExercisePerformance, toProgressScreen } from './progress-view-model';

const local = (month: number, d: number, hour = 9) => new Date(2026, month - 1, d, hour, 0);
const NOW = local(10, 8, 20); // Thursday 8 Oct 2026
const localDate = (instant: string) => calendarDateOf(new Date(instant));
const progressOf = (logs: readonly WorkoutLog[], now = NOW): ProgressResult => {
  const today = calendarDateOf(now);
  return { ok: true, overview: trainingOverview(logs, today, localDate), week: weeklyActivity(logs, today, localDate), exercises: performedExercises(logs) };
};
const bench = (startedAt: Date, weight: number, reps: number) =>
  finishedLog({ startedAt, minutes: 45, entry: (e, s) => (e === 0 ? { weight: s === 0 ? weight : weight - 2.5, reps } : { weight: 30, reps: 10 }) });

describe('progress view model', () => {
  const logs = [bench(local(10, 8, 7), 62.5, 7), bench(local(10, 5, 7), 60, 8), bench(local(9, 30, 7), 57.5, 8)];

  it('overview, week and activity come from finished workouts', () => {
    const screen = toProgressScreen(progressOf(logs), NOW);
    expect(screen.kind).toBe('ready');
    if (screen.kind !== 'ready') {
      return;
    }
    expect(screen.overview.map((t) => [t.label, t.count, t.unit])).toEqual([
      ['This week', 2, 'workouts'],
      ['This month', 2, 'workouts'],
      ['Total', 3, 'workouts'],
    ]);
    expect(screen.week.summary).toBe('2 workouts');
    expect(screen.week.days.map((d) => [d.letter, d.status, d.isToday])).toEqual([
      ['M', 'done', false],
      ['T', 'none', false],
      ['W', 'none', false],
      ['T', 'done', true],
      ['F', 'upcoming', false],
      ['S', 'upcoming', false],
      ['S', 'upcoming', false],
    ]);
    expect(screen.week.days.map((d) => d.spoken)).toEqual([
      'Monday: workout completed',
      'Tuesday: no workout',
      'Wednesday: no workout',
      'Thursday: workout completed',
      'Friday: upcoming',
      'Saturday: upcoming',
      'Sunday: upcoming',
    ]);
    expect(Object.fromEntries(screen.activity.map((f) => [f.key, f.value]))).toEqual({
      sets: `${3 * 22}`,
      time: '2 h 15 min',
      last: 'Today',
    });
  });

  it('recent performance shows the latest actual top set, newest exercises first, at most four', () => {
    const screen = toProgressScreen(progressOf(logs), NOW);
    if (screen.kind !== 'ready') {
      throw new Error(screen.kind);
    }
    expect(screen.recent).toHaveLength(4);
    expect(screen.recent[0]).toEqual({
      exerciseId: 'barbell-bench-press',
      name: 'Bench Press',
      latest: '62.5 kg × 7',
      lastPerformed: 'Last performed · Today',
    });
    expect(screen.hasMoreExercises).toBe(true);
    expect(toExerciseList(progressOf(logs), NOW)).toHaveLength(7);
  });

  it('empty history is the first-workout state; a failed read is an error', () => {
    expect(toProgressScreen(progressOf([]), NOW)).toEqual({ kind: 'empty' });
    expect(toProgressScreen({ ok: false }, NOW)).toEqual({ kind: 'error' });
    expect(toExerciseList({ ok: false }, NOW)).toBeNull();
  });

  it('a workout with nothing completed does not make progress non-empty', () => {
    const nothing = finishedLog({ startedAt: local(10, 8), minutes: 3, complete: () => false });
    expect(toProgressScreen(progressOf([nothing]), NOW)).toEqual({ kind: 'empty' });
  });

  it('partial workouts count, and performance uses only their completed sets', () => {
    const partial = finishedLog({ startedAt: local(10, 8, 7), minutes: 25, complete: (e, s) => e === 0 && s < 2, skipRest: true });
    const screen = toProgressScreen(progressOf([partial]), NOW);
    if (screen.kind !== 'ready') {
      throw new Error(screen.kind);
    }
    expect(screen.overview[0]).toMatchObject({ count: 1, unit: 'workout' });
    expect(screen.recent.map((r) => r.exerciseId)).toEqual(['barbell-bench-press']);
    expect(Object.fromEntries(screen.activity.map((f) => [f.key, f.value]))['sets']).toBe('2');
  });

  describe('exercise performance detail', () => {
    it('latest, recent best and each session’s completed sets, newest first', () => {
      const perf = performedExercises(logs).find((p) => p.exerciseId === 'barbell-bench-press')!;
      const view = toExercisePerformance(perf, NOW);
      expect(view.name).toBe('Bench Press');
      expect(view.latest).toEqual({ value: '62.5 kg × 7', date: 'Today' });
      expect(view.recentBest).toEqual({ value: '62.5 kg × 7', date: 'Today', note: 'Top set across your last 3 sessions' });
      expect(view.sessions.map((s) => s.dateLabel)).toEqual(['Today', 'Monday, Oct 5', 'Wednesday, Sep 30']);
      expect(view.sessions[1].sets.map((s) => `${s.label} · ${s.value}`)).toEqual([
        'Set 1 · 60 kg × 8',
        'Set 2 · 57.5 kg × 8',
        'Set 3 · 57.5 kg × 8',
        'Set 4 · 57.5 kg × 8',
      ]);
    });

    it('bodyweight shows reps only and timed work shows seconds', () => {
      const plan = planFor(BODYWEIGHT_PROFILE);
      const log = finishedLog({ plan, sessionId: plan.sessions[0].id, startedAt: local(10, 7), minutes: 35 });
      const list = performedExercises([log]);
      const pushUps = toExercisePerformance(list.find((p) => p.exerciseId === 'push-up')!, NOW);
      expect(pushUps.latest.value).toBe('10 reps');
      expect(pushUps.sessions[0].sets.every((s) => !s.value.includes('kg'))).toBe(true);
      const timed = toExercisePerformance(list.find((p) => p.sessions[0].logging === 'duration')!, NOW);
      expect(timed.latest.value).toBe('40 sec');
      expect(timed.sessions[0].sets.map((s) => s.value)).toEqual(['30 sec', '35 sec', '40 sec']);
    });

    it('keeps the unit the workout was recorded in', () => {
      expect(formatPerformedSet({ setNumber: 1, weight: 135, reps: 5, durationSeconds: null, completedAt: '' }, 'weight-reps', 'lb')).toBe('135 lb × 5');
    });
  });

  it.each([
    [{ year: 2026, month: 10, day: 8 }, 'Today'],
    [{ year: 2026, month: 10, day: 7 }, 'Yesterday'],
    [{ year: 2026, month: 10, day: 1 }, 'Oct 1'],
    [{ year: 2025, month: 12, day: 30 }, 'Dec 30, 2025'],
  ])('performed-on label for %j is %s', (date, label) => {
    expect(performedOnLabel(date, { year: 2026, month: 10, day: 8 })).toBe(label);
  });
});
