import { calendarDateOf } from '../../../domain/fitness-profile';
import { trainingOverview } from '../../../domain/workout-session';
import { BODYWEIGHT_PROFILE, finishedLog, planFor } from '../../../domain/workout-session/testing/workout-log-fixtures';
import { dayLabel, shortDayLabel, toHistoryDetail, toHistoryItem, toHistoryScreen, toRecentWorkouts } from './history-view-model';

const local = (month: number, day: number, hour = 9, minute = 0) => new Date(2026, month - 1, day, hour, minute);
const NOW = local(10, 8, 20); // Thursday 8 Oct 2026, 8 pm
const localDate = (instant: string) => calendarDateOf(new Date(instant));
const day = (year: number, month: number, d: number) => ({ year, month, day: d });

const full = finishedLog({ startedAt: local(10, 8, 18), minutes: 45 });
const partial = finishedLog({ startedAt: local(10, 7, 7), minutes: 38, complete: (e) => e < 4, skipRest: true });
const monday = finishedLog({ startedAt: local(10, 5, 6, 30), minutes: 50 });

describe('history view model', () => {
  describe('dates (local presentation)', () => {
    it.each([
      [day(2026, 10, 8), 'Today'],
      [day(2026, 10, 7), 'Yesterday'],
      [day(2026, 10, 5), 'Monday, Oct 5'],
      [day(2025, 12, 31), 'Wednesday, Dec 31, 2025'],
    ])('day label for %j is %s', (date, label) => {
      expect(dayLabel(date, day(2026, 10, 8))).toBe(label);
    });

    it.each([
      [day(2026, 10, 8), 'Today'],
      [day(2026, 10, 7), 'Yesterday'],
      [day(2026, 10, 5), 'Mon'],
      [day(2026, 9, 30), 'Sep 30'],
    ])('short label for %j is %s', (date, label) => {
      expect(shortDayLabel(date, day(2026, 10, 8))).toBe(label);
    });
  });

  describe('history list', () => {
    it('groups by local completion day, newest first, with consistency counts', () => {
      const workouts = [full, partial, monday];
      const screen = toHistoryScreen({ ok: true, workouts }, trainingOverview(workouts, calendarDateOf(NOW), localDate), NOW);
      expect(screen.kind).toBe('ready');
      if (screen.kind !== 'ready') {
        return;
      }
      expect(screen.consistency).toEqual({ thisWeek: '3 workouts', thisMonth: '3 workouts' });
      expect(screen.groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
        ['Today', [full.id]],
        ['Yesterday', [partial.id]],
        ['Monday, Oct 5', [monday.id]],
      ]);
    });

    it('items show name, time, duration, exercises and sets; partial workouts say so in words', () => {
      expect(toHistoryItem(full)).toEqual({
        id: full.id,
        title: 'Upper Body A',
        time: '6:45 PM',
        meta: '45 min · 7 of 7 exercises · 22 sets',
        metaParts: ['6:45 PM', '45 min', '7 of 7 exercises', '22 sets'],
        status: 'complete',
        statusLabel: 'Completed',
        skippedLabel: null,
      });
      expect(toHistoryItem(partial)).toMatchObject({
        status: 'partial',
        statusLabel: 'Finished · 13/22 sets',
        skippedLabel: '9 skipped',
        meta: '38 min · 4 of 7 exercises · 13 sets',
      });
    });

    it('empty and error states', () => {
      const empty = trainingOverview([], calendarDateOf(NOW), localDate);
      expect(toHistoryScreen({ ok: true, workouts: [] }, empty, NOW)).toEqual({ kind: 'empty' });
      expect(toHistoryScreen({ ok: false }, null, NOW)).toEqual({ kind: 'error' });
    });

    it('recent workouts: at most three, compact day and duration', () => {
      const recent = toRecentWorkouts([full, partial, monday, finishedLog({ startedAt: local(9, 30), minutes: 40 })], NOW);
      expect(recent.map((r) => [r.title, r.meta, r.statusLabel])).toEqual([
        ['Upper Body A', 'Today · 45 min', 'Completed'],
        ['Upper Body A', 'Yesterday · 38 min', 'Finished · 13/22 sets'],
        ['Upper Body A', 'Mon · 50 min', 'Completed'],
      ]);
    });
  });

  describe('historical detail: planned vs actual, from the log only', () => {
    it('summarizes the workout and keeps planned and actual separate', () => {
      const view = toHistoryDetail(partial, NOW);
      expect(view).toMatchObject({
        title: 'Upper Body A',
        completedLabel: 'Yesterday · 7:38 AM',
        status: 'partial',
        statusLabel: 'Finished · 13/22 sets',
      });
      expect(Object.fromEntries(view.facts.map((f) => [f.key, f.value]))).toEqual({
        duration: '38 min',
        exercises: '4 of 7',
        completed: '13',
        skipped: '9',
      });
      const bench = view.exercises[0];
      expect(bench).toMatchObject({ heading: '1. Bench Press', planned: '4 sets · 6–10 reps · 120 sec rest', progress: 'All sets done' });
      expect(bench.sets.map((s) => `${s.label} · ${s.value}`)).toEqual([
        'Set 1 · 40 kg × 10',
        'Set 2 · 42.5 kg × 9',
        'Set 3 · 42.5 kg × 8',
        'Set 4 · 42.5 kg × 7',
      ]);
      expect(view.exercises[4]).toMatchObject({ progress: '0 of 3 sets done' });
      expect(view.exercises[4].sets.every((s) => s.value === 'Skipped')).toBe(true);
    });

    it('sets neither done nor skipped read "Not done", and are counted', () => {
      const leftOpen = finishedLog({ startedAt: local(10, 6), minutes: 20, complete: (e) => e === 0 });
      const view = toHistoryDetail(leftOpen, NOW);
      expect(view.exercises[1].sets[0].value).toBe('Not done');
      expect(view.facts.find((f) => f.key === 'incomplete')?.value).toBe('18');
    });

    it('timed and bodyweight sets show their own values', () => {
      const plan = planFor(BODYWEIGHT_PROFILE);
      const log = finishedLog({ plan, sessionId: plan.sessions[0].id, startedAt: local(10, 8, 7), minutes: 35 });
      const view = toHistoryDetail(log, NOW);
      const timed = view.exercises.find((e) => e.planned.includes('sec ·') && !e.planned.includes('reps'))!;
      expect(timed.sets[0].value).toBe('30 sec');
      const pushUps = view.exercises.find((e) => e.name === 'Push-Up')!;
      expect(pushUps.sets[0].value).toBe('10 reps');
    });

    it('uses names and prescriptions recorded in the log, even if the catalog or plan changed', () => {
      const changed = {
        ...full,
        exercises: full.exercises.map((e, i) =>
          i === 0 ? { ...e, name: 'Flat Barbell Press (2026 name)', planned: { ...e.planned, sets: 4, target: { kind: 'reps' as const, min: 5, max: 5 } } } : e,
        ),
      };
      const view = toHistoryDetail(changed, NOW);
      expect(view.exercises[0]).toMatchObject({ heading: '1. Flat Barbell Press (2026 name)', planned: '4 sets · 5 reps · 120 sec rest' });
    });
  });
});
