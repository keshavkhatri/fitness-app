import { completedWorkouts, workoutVolume } from '../../../domain/workout-session';
import { BODYWEIGHT_PROFILE, finishedLog, planFor } from '../../../domain/workout-session/testing/workout-log-fixtures';
import { dayLabel, filterHistory, shortDayLabel, toHistoryDetail, toHistoryItem, toHistoryScreen } from './history-view-model';

const local = (month: number, day: number, hour = 9, minute = 0) => new Date(2026, month - 1, day, hour, minute);
const NOW = local(10, 8, 20); // Thursday 8 Oct 2026, 8 pm
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
    const lower = (() => {
      const plan = planFor();
      return finishedLog({ plan, sessionId: plan.sessions.find((x) => x.kind === 'resistance' && x.sessionType === 'lower')!.id, startedAt: local(9, 29, 18), minutes: 46 });
    })();
    const september = finishedLog({ startedAt: local(9, 24, 18), minutes: 40 });

    it('groups by local month, newest first, with a count per month', () => {
      const screen = toHistoryScreen({ ok: true, workouts: completedWorkouts([full, partial, monday, lower, september]) });
      expect(screen.kind).toBe('ready');
      if (screen.kind !== 'ready') {
        return;
      }
      expect(screen.months.map((m) => [m.label, m.countLabel, m.items.map((i) => i.id)])).toEqual([
        ['October 2026', '3 workouts', [full.id, partial.id, monday.id]],
        ['September 2026', '2 workouts', [lower.id, september.id]],
      ]);
    });

    it('offers a filter by session type only when there is more than one type, and filters by it', () => {
      const one = toHistoryScreen({ ok: true, workouts: [full, monday] });
      expect(one.kind === 'ready' && one.filters).toEqual([]);

      const mixed = toHistoryScreen({ ok: true, workouts: completedWorkouts([full, lower, september]) });
      if (mixed.kind !== 'ready') {
        throw new Error('expected a ready screen');
      }
      expect(mixed.filters.map((f) => f.label)).toEqual(['All', 'Upper Body', 'Lower Body']);
      expect(filterHistory(mixed.months, 'all')).toBe(mixed.months);
      expect(filterHistory(mixed.months, 'lower').map((m) => [m.label, m.countLabel, m.items.map((i) => i.title)])).toEqual([
        ['September 2026', '1 workout', ['Lower Body A']],
      ]);
    });

    it('items show the date and recorded duration, then exercises; partial workouts add the sets done', () => {
      expect(toHistoryItem(full)).toEqual({
        id: full.id,
        title: 'Upper Body A',
        sessionType: 'upper',
        meta: 'Thu, 8 Oct · 45 min',
        detail: '7 exercises',
        status: 'complete',
        accessibleLabel: 'Upper Body A, Thursday, Oct 8, 2026. 45 min, 7 exercises.',
      });
      expect(toHistoryItem(partial)).toMatchObject({ status: 'partial', meta: 'Wed, 7 Oct · 38 min', detail: '7 exercises · 13 of 22 sets' });
    });

    it('empty and error states', () => {
      expect(toHistoryScreen({ ok: true, workouts: [] })).toEqual({ kind: 'empty' });
      expect(toHistoryScreen({ ok: false })).toEqual({ kind: 'error' });
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
        volume: '4,070',
      });
      const bench = view.exercises[0];
      expect(bench).toMatchObject({ name: 'Bench Press', setsLabel: '4 sets · 6–10 reps', columns: ['Weight (kg)', 'Reps'], planned: '4 sets · 6–10 reps · 120 sec rest', progress: 'All sets done' });
      expect(bench.sets.map((s) => s.cells)).toEqual([
        ['40', '10'],
        ['42.5', '9'],
        ['42.5', '8'],
        ['42.5', '7'],
      ]);
      expect(bench.sets.map((s) => `${s.label} · ${s.value}`)).toEqual([
        'Set 1 · 40 kg × 10',
        'Set 2 · 42.5 kg × 9',
        'Set 3 · 42.5 kg × 8',
        'Set 4 · 42.5 kg × 7',
      ]);
      expect(view.exercises[4]).toMatchObject({ progress: '0 of 3 sets done' });
      expect(view.exercises[4].sets.every((s) => s.value === 'Skipped')).toBe(true);
    });

    it('totals: exercises with a done set (of all), sets done, and volume from weighted sets', () => {
      const view = toHistoryDetail(partial, NOW);
      expect(view).toMatchObject({ dateLabel: 'Wed, 7 Oct 2026', duration: '38 min' });
      // Independent of the implementation: the fixture's weight 40 + 5e (+2.5 after the first set), reps 10 − s.
      let expected = 0;
      partial.exercises.forEach((e, ei) => {
        if (e.logging === 'weight-reps') {
          e.sets.forEach((set, si) => {
            if (set.status === 'completed') {
              expected += (40 + ei * 5 + (si === 0 ? 0 : 2.5)) * (10 - si);
            }
          });
        }
      });
      expect(workoutVolume(partial)).toBe(expected);
      expect(view.metrics.map((m) => [m.key, m.value, m.label])).toEqual([
        ['exercises', '4/7', 'Exercises'],
        ['sets', '13', 'Sets done'],
        ['volume', new Intl.NumberFormat('en-US').format(expected), 'Volume (kg)'],
      ]);
      expect(toHistoryDetail(full, NOW).metrics[0].value).toBe('7');
    });

    it('max is the heaviest set, then the most reps (ties: the earlier set); none without a done set', () => {
      const view = toHistoryDetail(partial, NOW);
      expect(view.exercises[0].best).toBe('42.5 kg × 9');
      expect(view.exercises[4].best).toBeNull();
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
      expect(pushUps.columns).toBeNull();
      expect(pushUps.sets[0].cells).toEqual(['10 reps']);
      expect(pushUps.best).toBe('10 reps');
      // No weighted work: no volume to report.
      expect(workoutVolume(log)).toBeNull();
      expect(view.metrics.map((m) => m.key)).toEqual(['exercises', 'sets']);
    });

    it('uses names and prescriptions recorded in the log, even if the catalog or plan changed', () => {
      const changed = {
        ...full,
        exercises: full.exercises.map((e, i) =>
          i === 0 ? { ...e, name: 'Flat Barbell Press (2026 name)', planned: { ...e.planned, sets: 4, target: { kind: 'reps' as const, min: 5, max: 5 } } } : e,
        ),
      };
      const view = toHistoryDetail(changed, NOW);
      expect(view.exercises[0]).toMatchObject({ name: 'Flat Barbell Press (2026 name)', planned: '4 sets · 5 reps · 120 sec rest' });
    });
  });
});
