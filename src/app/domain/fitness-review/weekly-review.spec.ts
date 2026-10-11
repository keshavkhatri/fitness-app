import { BodyCompositionAssessment, MANUAL_INBODY_SOURCE } from '../body-composition';
import { MeasurementEntry, WeightEntry } from '../body-measurements';
import { calendarDateOf } from '../fitness-profile';
import { FoodEntryInput, createFoodEntry, nutritionWeek } from '../nutrition';
import { WorkoutLog } from '../workout-session';
import { finishedLog, planFor } from '../workout-session/testing/workout-log-fixtures';
import { exerciseTrends } from './exercise-trends';
import { WeeklyReviewInput, weeklyReview } from './weekly-review';

// Synthetic data only. Reviewed week: Monday 5 – Sunday 11 October 2026; "today" is Monday 12 October.
const WEEK = '2026-10-05';
const WEEK_END = '2026-10-11';
const TODAY = '2026-10-12';
const localDateOf = (instant: string) => calendarDateOf(new Date(instant));
const PLAN = planFor();
const SESSION = PLAN.sessions.find((s) => s.kind === 'resistance')!.id;

/** A finished session on a local October day: exercise 0 at `w0` kg, every other exercise at 40 kg; all sets ×8. */
const session = (day: number, w0: number, options: { month?: number; weightUnit?: 'kg' | 'lb' } = {}) =>
  finishedLog({
    plan: PLAN,
    sessionId: SESSION,
    startedAt: new Date(2026, (options.month ?? 10) - 1, day, 18, 0),
    minutes: 45,
    weightUnit: options.weightUnit,
    entry: (e) => ({ weight: e === 0 ? w0 : 40, reps: 8, durationSeconds: 30 }),
  });
const exercise0 = (logs: readonly WorkoutLog[]) => logs[0].exercises.find((e) => e.sets.some((s) => s.status === 'completed'))!.exerciseId;

const food = (date: string, overrides: Partial<FoodEntryInput> = {}) => {
  const r = createFoodEntry(
    { name: 'Rice bowl', quantity: 1, unit: 'serving', meal: 'lunch', calories: 600, proteinGrams: 30, carbohydrateGrams: 80, fatGrams: 15, ...overrides },
    { id: `${date}-${Math.random()}`, date, now: `${date}T12:00:00.000Z` },
  );
  if (!r.ok) {
    throw new Error('fixture');
  }
  return r.value;
};
const weight = (date: string, kilograms: number): WeightEntry => ({ id: `w-${date}`, date, weight: { kilograms }, createdAt: `${date}T06:00:00.000Z`, updatedAt: `${date}T06:00:00.000Z` });
const tape = (date: string, waist: number): MeasurementEntry => ({ id: `m-${date}`, date, values: { waist: { centimeters: waist } }, createdAt: `${date}T06:00:00.000Z`, updatedAt: `${date}T06:00:00.000Z` });
const report = (date: string, reported: BodyCompositionAssessment['reported']): BodyCompositionAssessment => ({
  id: `r-${date}`,
  date,
  source: MANUAL_INBODY_SOURCE,
  reported,
  createdAt: `${date}T06:00:00.000Z`,
  updatedAt: `${date}T06:00:00.000Z`,
});

const input = (overrides: Partial<WeeklyReviewInput> = {}): WeeklyReviewInput => ({
  weekStart: WEEK,
  today: TODAY,
  unitSystem: 'metric',
  localDateOf,
  training: { logs: [], plannedPerWeek: 4 },
  nutrition: { week: nutritionWeek([], WEEK, TODAY)!, calorieTarget: 2000, proteinTarget: 140 },
  weights: [],
  measurements: [],
  bodyComposition: [],
  ...overrides,
});
const review = (overrides: Partial<WeeklyReviewInput> = {}) => weeklyReview(input(overrides))!;

describe('Weekly Fitness Review', () => {
  describe('exercise trends (comparable sessions only)', () => {
    it('improving: the week’s top set beats the best earlier comparable top set', () => {
      const logs = [session(21, 60, { month: 9 }), session(28, 60, { month: 9 }), session(7, 62.5)];
      const trends = exerciseTrends(logs, WEEK, WEEK_END, localDateOf);
      expect(trends.improving).toHaveLength(1);
      expect(trends.improving[0]).toMatchObject({ exerciseId: exercise0(logs), latest: { weight: 62.5, reps: 8 }, reference: { weight: 60, reps: 8 }, sessionsCompared: 3 });
      // The other exercises held steady over only three sessions: too few to call a stall.
      expect(trends.stalled).toEqual([]);
      expect(trends.notEnoughHistory).toBe(trends.trained - 1);
    });

    it('stalled: four or more comparable sessions and no better top set in the last three', () => {
      const logs = [session(14, 60, { month: 9 }), session(21, 60, { month: 9 }), session(28, 60, { month: 9 }), session(7, 60)];
      const trends = exerciseTrends(logs, WEEK, WEEK_END, localDateOf);
      expect(trends.improving).toEqual([]);
      expect(trends.stalled.length).toBe(trends.trained);
      expect(trends.stalled.find((s) => s.exerciseId === exercise0(logs))).toMatchObject({ latest: { weight: 60 }, reference: { weight: 60 }, sessionsCompared: 4 });
    });

    it('a recent improvement inside the window is not a stall', () => {
      const logs = [session(14, 60, { month: 9 }), session(21, 60, { month: 9 }), session(28, 62.5, { month: 9 }), session(7, 62.5)];
      const trends = exerciseTrends(logs, WEEK, WEEK_END, localDateOf);
      expect(trends.stalled.some((s) => s.exerciseId === exercise0(logs))).toBe(false);
      expect(trends.improving.some((s) => s.exerciseId === exercise0(logs))).toBe(false);
    });

    it('never compares kg with lb, and needs history before concluding anything', () => {
      const lbHistory = [session(21, 130, { month: 9, weightUnit: 'lb' }), session(28, 130, { month: 9, weightUnit: 'lb' }), session(7, 62.5)];
      const mixed = exerciseTrends(lbHistory, WEEK, WEEK_END, localDateOf);
      expect([mixed.improving, mixed.stalled]).toEqual([[], []]);
      expect(mixed.notEnoughHistory).toBe(mixed.trained);

      const single = exerciseTrends([session(7, 60)], WEEK, WEEK_END, localDateOf);
      expect(single.trained).toBeGreaterThan(0);
      expect(single.notEnoughHistory).toBe(single.trained);
    });

    it('judges an older week only by what was known then (later sessions ignored)', () => {
      const logs = [session(21, 60, { month: 9 }), session(28, 60, { month: 9 }), session(7, 70)];
      const trends = exerciseTrends(logs, '2026-09-28', '2026-10-04', localDateOf);
      expect(trends.improving).toEqual([]);
    });

    it('nothing trained in the week: nothing to report', () => {
      expect(exerciseTrends([session(28, 60, { month: 9 })], WEEK, WEEK_END, localDateOf)).toEqual({ improving: [], stalled: [], notEnoughHistory: 0, trained: 0 });
    });
  });

  describe('sections', () => {
    it('training: workouts finished in the week against the plan', () => {
      const r = review({ training: { logs: [session(5, 60), session(7, 60), session(4, 60), session(12, 60)], plannedPerWeek: 4 } });
      expect(r.training).toMatchObject({ kind: 'ready', completed: 2, planned: 4 });
      expect([r.weekStart, r.weekEnd, r.current]).toEqual([WEEK, WEEK_END, false]);
    });

    it('nutrition: coverage and averages over logged days, never zero for missing days', () => {
      const week = nutritionWeek([food('2026-10-05', { calories: 1800, proteinGrams: 100 }), food('2026-10-06', { calories: 2200, proteinGrams: 120 })], WEEK, TODAY)!;
      const r = review({ nutrition: { week, calorieTarget: 2000, proteinTarget: 140 } });
      expect(r.nutrition).toMatchObject({ kind: 'ready', loggedDays: 2, elapsedDays: 7, average: { calories: 2000, proteinGrams: 110 }, calorieTarget: 2000, proteinTarget: 140 });
      const empty = review();
      expect(empty.nutrition).toMatchObject({ loggedDays: 0, average: null });
    });

    it('weight: first to last weigh-in in the 28 days ending Sunday, in the display unit', () => {
      const weights = [weight('2026-09-10', 90), weight('2026-09-14', 82.4), weight('2026-09-30', 81.9), weight('2026-10-10', 81.2), weight('2026-10-14', 79)];
      const r = review({ weights });
      expect(r.body.weight).toMatchObject({ kind: 'ready', windowStart: '2026-09-14', trend: { kind: 'change', change: -1.2, entries: 3, first: { date: '2026-09-14' }, last: { date: '2026-10-10' } } });
      const lb = review({ weights, unitSystem: 'imperial' });
      expect(lb.body.weight).toMatchObject({ trend: { change: -2.7 } }); // 181.7 lb → 179.0 lb
    });

    it('weight: one weigh-in, or several on the same day, is not a trend', () => {
      expect(review({ weights: [weight('2026-10-10', 81)] }).body.weight).toMatchObject({ trend: { kind: 'insufficient', entries: 1 } });
      const sameDay = [weight('2026-10-10', 81), { ...weight('2026-10-10', 82), id: 'w2' }];
      expect(review({ weights: sameDay }).body.weight).toMatchObject({ trend: { kind: 'insufficient', entries: 2 } });
    });

    it('measurements: the change between a site’s two latest readings, only when recent', () => {
      const r = review({ measurements: [tape('2026-09-20', 90), tape('2026-10-08', 88.5), tape('2026-10-20', 80)] });
      expect(r.body.measurements).toMatchObject({ kind: 'ready', latestDate: '2026-10-08', changes: [{ site: 'waist', change: -1.5 }] });
      const old = review({ measurements: [tape('2026-05-01', 90), tape('2026-06-01', 89)] });
      expect(old.body.measurements).toMatchObject({ changes: [], latestDate: '2026-06-01' });
    });

    it('InBody: key metrics compared report to report, each on its own; units never converted', () => {
      const r = review({
        bodyComposition: [
          report('2026-09-01', { 'fat-free-mass': { value: 47.0, unit: 'kg' }, weight: { value: 150.8, unit: 'lb' }, 'body-fat-percentage': { value: 31.2, unit: '%' } }),
          report('2026-10-06', { 'fat-free-mass': { value: 47.3, unit: 'kg' }, weight: { value: 68.4, unit: 'kg' }, 'body-fat-percentage': { value: 30.8, unit: '%' } }),
        ],
      });
      if (r.body.composition.kind !== 'ready') {
        throw new Error('unavailable');
      }
      const byMetric = Object.fromEntries(r.body.composition.changes.map((c) => [c.metric, c]));
      expect(byMetric['fat-free-mass']).toMatchObject({ kind: 'change', change: 0.3, unit: 'kg' });
      expect(byMetric['body-fat-percentage']).toMatchObject({ kind: 'change', change: -0.4, unit: '%' });
      expect(byMetric['weight']).toMatchObject({ kind: 'different-units' });
      expect(byMetric['lean-body-mass']).toBeUndefined(); // fat-free mass is never relabelled as lean body mass
      expect(r.body.composition.reports).toBe(2);
    });

    it('a source that couldn’t be read makes only its section unavailable', () => {
      const r = review({ training: null, nutrition: null, weights: null, measurements: null, bodyComposition: null });
      expect([r.training.kind, r.nutrition.kind, r.body.weight.kind, r.body.measurements.kind, r.body.composition.kind]).toEqual(Array(5).fill('unavailable'));
      expect(r.actions).toEqual([]);
    });

    it('an invalid week is rejected', () => {
      expect(weeklyReview(input({ weekStart: 'nope' }))).toBeNull();
    });
  });

  describe('actions (prioritised, traceable, at most three)', () => {
    const fullWeekFood = (protein: number) =>
      nutritionWeek(['05', '06', '07', '08', '09'].map((d) => food(`2026-10-${d}`, { proteinGrams: protein })), WEEK, TODAY)!;

    it('in priority order: workouts, protein, logging, exercise review, weigh-in, measurements — capped at three', () => {
      const r = review({
        training: { logs: [session(7, 60)], plannedPerWeek: 4 },
        nutrition: { week: nutritionWeek([food('2026-10-05', { proteinGrams: 50 }), food('2026-10-06', { proteinGrams: 50 }), food('2026-10-07', { proteinGrams: 50 })], WEEK, TODAY)!, calorieTarget: 2000, proteinTarget: 140 },
      });
      // Also due: logging (3 of 7 days < 60%), a weigh-in and measurements; only the top three are kept.
      expect(r.actions.map((a) => a.id)).toEqual(['complete-workouts', 'protein', 'log-food']);
      expect(r.actions[0]).toEqual({ id: 'complete-workouts', completed: 1, planned: 4, current: false });
      expect(r.actions[1]).toEqual({ id: 'protein', average: 50, target: 140, loggedDays: 3 });
    });

    it('no action without the data behind it: no plan, no protein target, too few logged days', () => {
      const r = review({
        training: { logs: [], plannedPerWeek: null },
        nutrition: { week: fullWeekFood(40), calorieTarget: null, proteinTarget: null },
        weights: [weight('2026-10-01', 81), weight('2026-10-08', 80.6)],
        measurements: [tape('2026-10-01', 88)],
      });
      expect(r.actions).toEqual([]);
      const twoDays = review({ nutrition: { week: nutritionWeek([food('2026-10-05', { proteinGrams: 20 }), food('2026-10-06', { proteinGrams: 20 })], WEEK, TODAY)!, calorieTarget: 2000, proteinTarget: 140 }, training: { logs: [], plannedPerWeek: null }, weights: null, measurements: null });
      expect(twoDays.actions.map((a) => a.id)).toEqual(['log-food']); // 2 of 7 days: log more before judging protein
    });

    it('protein at or above 90% of target is not a gap', () => {
      const r = review({ training: { logs: [], plannedPerWeek: null }, nutrition: { week: fullWeekFood(126), calorieTarget: 2000, proteinTarget: 140 }, weights: null, measurements: null });
      expect(r.actions).toEqual([]);
    });

    it('suggests reviewing the first stalled exercise', () => {
      const logs = [session(14, 60, { month: 9 }), session(21, 60, { month: 9 }), session(28, 60, { month: 9 }), session(7, 60)];
      const r = review({ training: { logs, plannedPerWeek: 1 }, nutrition: null, weights: null, measurements: null });
      expect(r.actions.map((a) => a.id)).toEqual(['review-exercise']);
      expect(r.actions[0]).toMatchObject({ trend: { sessionsCompared: 4 } });
    });

    it('weigh-in and measurement reminders follow their explicit thresholds', () => {
      const r = review({ training: null, nutrition: null, weights: [weight('2026-10-08', 81)], measurements: [tape('2026-08-01', 90)] });
      expect(r.actions).toEqual([
        { id: 'weigh-in', recentWeighIns: 1 },
        { id: 'measure', lastMeasured: '2026-08-01' },
      ]);
      expect(review({ training: null, nutrition: null, weights: null, measurements: [] }).actions).toEqual([{ id: 'measure', lastMeasured: null }]);
    });

    it('the current week asks to finish the remaining workouts', () => {
      const r = review({ weekStart: WEEK, today: '2026-10-08', training: { logs: [session(6, 60)], plannedPerWeek: 3 }, nutrition: null, weights: null, measurements: null });
      expect(r.current).toBe(true);
      expect(r.actions[0]).toEqual({ id: 'complete-workouts', completed: 1, planned: 3, current: true });
    });
  });
});
