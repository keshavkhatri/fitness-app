import { BodyCompositionAssessment, MANUAL_INBODY_SOURCE, createBodyCompositionAssessment } from '../../../domain/body-composition';
import { WeightEntry, createWeightEntry } from '../../../domain/body-measurements';
import { WorkoutLog, completedWorkouts, exercisePerformance, performedExercises } from '../../../domain/workout-session';
import { BODYWEIGHT_PROFILE, finishedLog, planFor } from '../../../domain/workout-session/testing/workout-log-fixtures';
import { ALL_AREAS, areaFilters, queryExercises, toExerciseRow } from './exercise-list-view-model';
import { metricValue, performanceRangeStart, toExercisePerformanceView } from './exercise-performance-view-model';
import { formatPerformedSet, performedOnLabel, toBodyMetrics, toConsistency, toKeyMetrics, toProgressWorkouts } from './progress-view-model';

const local = (month: number, d: number, hour = 9) => new Date(2026, month - 1, d, hour, 0);
const NOW = local(10, 8, 20); // Thursday 8 Oct 2026
const TODAY = '2026-10-08';
const day = (year: number, month: number, d: number) => ({ year, month, day: d });

/** Bench press (exercise 0) at a weight; other exercises fixed. */
const bench = (startedAt: Date, weight: number, reps: number, unit: 'kg' | 'lb' = 'kg') =>
  finishedLog({ startedAt, minutes: 45, weightUnit: unit, entry: (e, s) => (e === 0 ? { weight: s === 0 ? weight : weight - 2.5, reps } : { weight: 30, reps: 10 }) });
const ok = (logs: readonly WorkoutLog[]) => ({ ok: true as const, workouts: completedWorkouts(logs) });

const weigh = (id: string, date: string, kg: number): WeightEntry => {
  const r = createWeightEntry({ weight: kg, unitSystem: 'metric', date }, { id, now: `${date}T07:00:00.000Z`, today: TODAY });
  if (!r.ok) {
    throw new Error('bad weight');
  }
  return r.value;
};
const assess = (id: string, date: string, fat: number, muscle?: number): BodyCompositionAssessment => {
  const r = createBodyCompositionAssessment(
    {
      date,
      source: MANUAL_INBODY_SOURCE,
      values: { 'body-fat-percentage': { value: fat, unit: '%' }, ...(muscle ? { 'skeletal-muscle-mass': { value: muscle, unit: 'kg' as const } } : {}) },
    },
    { id, now: `${date}T08:00:00.000Z`, today: TODAY },
  );
  if (!r.ok) {
    throw new Error('bad assessment');
  }
  return r.value;
};

describe('progress overview view model', () => {
  describe('body metrics: the latest recording and the difference from the previous one', () => {
    it('weight, body fat (in percentage points) and muscle mass, each against its previous recording', () => {
      const weights = { status: 'ready' as const, unitSystem: 'metric' as const, entries: [weigh('w1', '2026-10-01', 79), weigh('w2', '2026-10-07', 78.4)] };
      const composition = { status: 'ready' as const, assessments: [assess('a1', '2026-09-01', 21.7, 33.2), assess('a2', '2026-10-01', 18.5, 35)] };
      const [weight, fat, muscle] = toBodyMetrics(weights, composition, TODAY);
      expect(weight).toMatchObject({ value: '78.4', unit: 'kg', change: { text: '−0.6 kg', direction: 'down' }, caption: 'vs 1 Oct' });
      expect(fat).toMatchObject({ value: '18.5', unit: '%', change: { text: '−3.2 pts', spoken: '−3.2 percentage points', direction: 'down' }, caption: 'vs 1 Sep' });
      expect(muscle).toMatchObject({ value: '35', unit: 'kg', change: { text: '+1.8 kg', direction: 'up' } });
    });

    it('compared with the first recording instead: how far it has come since the start', () => {
      const weights = {
        status: 'ready' as const,
        unitSystem: 'metric' as const,
        entries: [weigh('w0', '2026-06-02', 97.4), weigh('w1', '2026-10-01', 95.1), weigh('w2', '2026-10-07', 94.5)],
      };
      const composition = {
        status: 'ready' as const,
        assessments: [assess('a0', '2026-06-02', 39.8, 32.8), assess('a1', '2026-09-03', 35, 35.2), assess('a2', '2026-10-01', 33.4, 35.8)],
      };
      const [weight, fat, muscle] = toBodyMetrics(weights, composition, TODAY, 'first');
      expect(weight).toMatchObject({ value: '94.5', change: { text: '−2.9 kg', direction: 'down' }, caption: 'since 2 Jun' });
      expect(fat).toMatchObject({ change: { text: '−6.4 pts', direction: 'down' }, caption: 'since 2 Jun' });
      expect(muscle).toMatchObject({ change: { text: '+3 kg', direction: 'up' }, caption: 'since 2 Jun' });
      // The default stays "since last time".
      expect(toBodyMetrics(weights, composition, TODAY)[0].caption).toBe('vs 1 Oct');
    });

    it('one recording: its date, no change; none: "Not recorded" (never a zero)', () => {
      const weights = { status: 'ready' as const, unitSystem: 'metric' as const, entries: [weigh('w1', '2026-10-07', 78.4)] };
      const [weight, fat, muscle] = toBodyMetrics(weights, { status: 'ready', assessments: [assess('a1', '2026-10-01', 18.5)] }, TODAY);
      expect(weight).toMatchObject({ value: '78.4', change: null, caption: '7 Oct' });
      expect(fat).toMatchObject({ value: '18.5', change: null, caption: '1 Oct' });
      expect(muscle).toMatchObject({ value: null, change: null, caption: 'Not recorded' });
      expect(toBodyMetrics({ status: 'error' }, { status: 'loading' }, TODAY).map((m) => m.value)).toEqual([null, null, null]);
    });
  });

  describe('workout consistency', () => {
    it('counts weeks with a workout, never before the first workout; the plan is a reference', () => {
      const logs = [bench(local(10, 6), 60, 8), bench(local(10, 1), 60, 8), bench(local(9, 30), 60, 8), bench(local(9, 15), 60, 8)];
      const c = toConsistency(ok(logs), 4, NOW)!;
      // First workout Tue 15 Sep: weeks of Sep 14, 21, 28 and Oct 5.
      expect(c.weeksCounted).toBe(4);
      expect(c.weeks.map((w) => w.workouts)).toEqual([1, 0, 2, 1]);
      expect(c).toMatchObject({ activeWeeks: 3, percent: 75, summary: '3 of 4 weeks with a workout' });
      expect(c.weeks[3]).toMatchObject({ isCurrent: true, spoken: 'Week of 5 Oct (this week, so far): 1 workout' });
      expect(c.weeks[1].spoken).toBe('Week of 21 Sep: no workouts');
      expect(c.planned).toEqual({ perWeek: 4, height: 1, label: 'Plan: 4 a week' });
      expect(c.weeks[2].height).toBe(0.5);
    });

    it('at most twelve weeks; no plan means no reference line; no workouts means no chart', () => {
      const logs = [bench(local(5, 4), 60, 8), bench(local(10, 6), 60, 8)];
      const c = toConsistency(ok(logs), null, NOW)!;
      expect(c.weeksCounted).toBe(12);
      expect(c.planned).toBeNull();
      expect(toConsistency(ok([]), 4, NOW)).toBeNull();
      expect(toProgressWorkouts({ ok: true, workouts: [] }, 4, NOW)).toEqual({ kind: 'empty' });
      expect(toProgressWorkouts({ ok: false }, 4, NOW)).toEqual({ kind: 'error' });
    });
  });

  describe('key metrics', () => {
    it('total workouts, volume of weighted sets in the latest workout’s unit, average duration', () => {
      const logs = [bench(local(10, 6), 60, 8), bench(local(10, 1), 50, 10)];
      const metrics = toKeyMetrics(ok(logs), NOW);
      expect(metrics.map((m) => [m.key, m.caption])).toEqual([
        ['workouts', 'All time'],
        ['volume', 'All time'],
        ['duration', 'Per workout'],
      ]);
      expect(metrics[0].value).toBe('2');
      expect(metrics[2].value).toBe('45 min');
    });

    it('never adds kg and lb: the caption says which unit is counted', () => {
      const metrics = toKeyMetrics(ok([bench(local(10, 6), 135, 5, 'lb'), bench(local(10, 1), 60, 8)]), NOW);
      expect(metrics.find((m) => m.key === 'volume')).toMatchObject({ caption: 'lb sets, all time' });
      expect(metrics.find((m) => m.key === 'volume')?.value).toMatch(/ lb$/);
    });

    it('bodyweight-only training has no volume to show', () => {
      const plan = planFor(BODYWEIGHT_PROFILE);
      const log = finishedLog({ plan, sessionId: plan.sessions[0].id, startedAt: local(10, 6), minutes: 30 });
      expect(toKeyMetrics(ok([log]), NOW).map((m) => m.key)).toEqual(['workouts', 'duration']);
    });
  });
});

describe('exercise list view model', () => {
  const logs = [bench(local(10, 8, 7), 62.5, 7), bench(local(10, 5, 7), 60, 8), bench(local(9, 30, 7), 57.5, 8)];
  const rows = performedExercises(logs).map((p) => toExerciseRow(p, NOW));

  it('a row: name, body area, latest top set, and a trend of the top set across recent sessions', () => {
    const benchRow = rows.find((r) => r.name === 'Bench Press')!;
    expect(benchRow).toMatchObject({ area: 'Chest', latest: '62.5 kg × 7', lastLabel: 'Today' });
    expect(benchRow.trend).toEqual({ bars: [57.5 / 62.5, 60 / 62.5, 1], change: '+5 kg', direction: 'up', since: 'since 30 Sep' });
    expect(benchRow.accessibleLabel).toBe('Bench Press. Chest. Latest top set 62.5 kg × 7, Today. +5 kg since 30 Sep');
  });

  it('one session: no trend (never from one point)', () => {
    const one = toExerciseRow(performedExercises([bench(local(10, 8), 60, 8)])[0], NOW);
    expect(one.trend).toBeNull();
  });

  it('search and the area filter work together; sort by recent or name; filters list only present areas', () => {
    const filters = areaFilters(rows);
    expect(filters[0]).toBe(ALL_AREAS);
    expect(filters).toContain('Chest');
    expect(queryExercises(rows, { search: 'press', area: 'Chest', sort: 'name' }).map((r) => r.name)).toEqual(['Bench Press']);
    expect(queryExercises(rows, { search: 'PRESS', area: ALL_AREAS, sort: 'name' }).map((r) => r.name)).toEqual(
      rows.filter((r) => /press/i.test(r.name)).map((r) => r.name).sort((a, b) => a.localeCompare(b)),
    );
    expect(queryExercises(rows, { search: 'chest', area: ALL_AREAS, sort: 'recent' }).every((r) => r.areas.includes('Chest'))).toBe(true);
    expect(queryExercises(rows, { search: 'zzz', area: ALL_AREAS, sort: 'recent' })).toEqual([]);
  });
});

describe('exercise performance view model', () => {
  const logs = [
    bench(local(10, 8, 7), 100, 6),
    bench(local(10, 1, 7), 95, 6),
    bench(local(9, 24, 7), 92.5, 6),
    bench(local(7, 10, 7), 90, 8),
    bench(local(2, 2, 7), 80, 8),
  ];
  const performance = exercisePerformance(logs, 'barbell-bench-press')!;

  it('range boundaries: the same day N months back (clamped); all time has none', () => {
    expect(performanceRangeStart('1m', day(2026, 10, 8))).toEqual(day(2026, 9, 8));
    expect(performanceRangeStart('6m', day(2026, 10, 8))).toEqual(day(2026, 4, 8));
    expect(performanceRangeStart('1m', day(2026, 3, 31))).toEqual(day(2026, 2, 28));
    expect(performanceRangeStart('all', day(2026, 10, 8))).toBeNull();
  });

  it('a range without sessions says so; nothing is drawn (never an empty axis)', () => {
    const old = exercisePerformance([bench(local(3, 2, 7), 80, 8)], 'barbell-bench-press')!;
    const view = toExercisePerformanceView(old, { range: '3m', metric: 'weight' }, NOW);
    expect(view.ranges).toEqual(['1m', '3m', '6m', '1y', 'all']);
    expect(view.chart).toBeNull();
    expect(view.best).toBeNull();
    expect(view.sessions).toEqual([]);
    expect(view.chartLabel).toBe('No sessions in this range.');
    expect(toExercisePerformanceView(old, { range: '1y', metric: 'weight' }, NOW).chart?.points).toHaveLength(1);
  });

  it('charts one recorded value per session, oldest first; the change is first to last in the range', () => {
    const view = toExercisePerformanceView(performance, { range: '1m', metric: 'weight' }, NOW);
    expect(view.metrics).toEqual(['weight', 'volume', 'reps']);
    expect(view.chart?.points).toHaveLength(3);
    // Every session labelled: its value above, its date below.
    expect(view.chart?.points.map((p) => [p.valueText, p.date])).toEqual([
      ['92.5', '24 Sep'],
      ['95', '1 Oct'],
      ['100', '8 Oct'],
    ]);
    expect(view.change).toEqual({ text: '+7.5 kg', since: 'since 24 Sep', direction: 'up' });
    expect(view.best).toEqual({ value: '100 kg × 6', date: '8 Oct 2026' });
    expect(view.chartLabel).toBe('Max weight, last month: 3 sessions, from 92.5 kg on 24 Sep to 100 kg on 8 Oct.');
    expect(view.sessions.map((s) => [s.dateLabel, s.value])).toEqual([
      ['8 Oct 2026', '100 kg'],
      ['1 Oct 2026', '95 kg'],
      ['24 Sep 2026', '92.5 kg'],
    ]);
    expect(view.sessions[0].detail).toBe('4 sets · 6 reps');
  });

  it('switching the range or metric changes the chart', () => {
    const all = toExercisePerformanceView(performance, { range: 'all', metric: 'weight' }, NOW);
    expect(all.chart?.points).toHaveLength(5);
    const volume = toExercisePerformanceView(performance, { range: 'all', metric: 'volume' }, NOW);
    expect(volume.chart?.unit).toBe('kg');
    expect(volume.sessions[0].value).toBe(`${metricValue(performance.sessions[0], 'volume')!.toLocaleString('en-US')} kg`);
    // 6M (from 8 Apr) holds the four sessions since July; All adds February.
    expect(toExercisePerformanceView(performance, { range: '6m', metric: 'weight' }, NOW).chart?.points).toHaveLength(4);
  });

  it('a single session: a point, no change; never a trend from one value', () => {
    const one = exercisePerformance([bench(local(10, 8), 100, 6)], 'barbell-bench-press')!;
    const view = toExercisePerformanceView(one, { range: 'all', metric: 'weight' }, NOW);
    expect(view.chart?.points).toHaveLength(1);
    expect(view.change).toBeNull();
  });

  it('kg and lb are never charted together (only sessions comparable with the latest)', () => {
    const mixed = exercisePerformance([bench(local(10, 8), 100, 6), bench(local(10, 1), 200, 6, 'lb')], 'barbell-bench-press')!;
    const view = toExercisePerformanceView(mixed, { range: 'all', metric: 'weight' }, NOW);
    expect(view.chart?.points).toHaveLength(1);
    expect(view.sessions).toHaveLength(2);
    expect(view.sessions[1].value).toBe('200 lb');
  });

  it('small changes aren’t exaggerated: the chart spans at least a fifth of the largest value (and 1)', () => {
    const view = toExercisePerformanceView(performance, { range: '1m', metric: 'weight' }, NOW);
    expect(view.chart?.minSpan).toBe(20);
  });

  it('bodyweight work charts reps only', () => {
    const plan = planFor(BODYWEIGHT_PROFILE);
    const log = finishedLog({ plan, sessionId: plan.sessions[0].id, startedAt: local(10, 6), minutes: 30 });
    const pushUps = performedExercises([log]).find((p) => p.exerciseName === 'Push-Up')!;
    const view = toExercisePerformanceView(pushUps, { range: 'all', metric: 'weight' }, NOW);
    expect(view.metrics).toEqual(['reps']);
    expect(view.metric).toBe('reps');
    expect(view.best?.value).toBe('10 reps');
  });
});

describe('shared formatting', () => {
  it('keeps the unit the workout was recorded in', () => {
    expect(formatPerformedSet({ setNumber: 1, weight: 135, reps: 5, durationSeconds: null, completedAt: '' }, 'weight-reps', 'lb')).toBe('135 lb × 5');
  });

  it.each([
    [{ year: 2026, month: 10, day: 8 }, 'Today'],
    [{ year: 2026, month: 10, day: 7 }, 'Yesterday'],
    [{ year: 2026, month: 10, day: 1 }, '1 Oct'],
    [{ year: 2025, month: 12, day: 30 }, '30 Dec 2025'],
  ])('performed-on label for %j is %s', (date, label) => {
    expect(performedOnLabel(date, { year: 2026, month: 10, day: 8 })).toBe(label);
  });
});
