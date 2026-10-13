import { TargetState } from '../../core/nutrition/nutrition.service';
import { BodyCompositionAssessment, MANUAL_INBODY_SOURCE } from '../../domain/body-composition';
import { MeasurementEntry, WeightEntry } from '../../domain/body-measurements';
import { WeeklyReviewInput, weeklyReview } from '../../domain/fitness-review';
import { calendarDateOf } from '../../domain/fitness-profile';
import { FoodEntryInput, createFoodEntry, nutritionWeek } from '../../domain/nutrition';
import { finishedLog, planFor } from '../../domain/workout-session/testing/workout-log-fixtures';
import { toReviewScreen } from './fitness-review-view-model';

// Synthetic data only. Reviewed week: Monday 5 – Sunday 11 October 2026; "today" is Monday 12 October.
const WEEK = '2026-10-05';
const TODAY = '2026-10-12';
const localDateOf = (instant: string) => calendarDateOf(new Date(instant));
const PLAN = planFor();
const SESSION = PLAN.sessions.find((s) => s.kind === 'resistance')!.id;
const session = (month: number, day: number, w0: number) =>
  finishedLog({ plan: PLAN, sessionId: SESSION, startedAt: new Date(2026, month - 1, day, 18, 0), minutes: 45, entry: (e) => ({ weight: e === 0 ? w0 : 40, reps: 8, durationSeconds: 30 }) });

let seq = 0;
const food = (date: string, overrides: Partial<FoodEntryInput> = {}) => {
  const r = createFoodEntry(
    { name: 'Rice bowl', quantity: 1, unit: 'serving', meal: 'lunch', calories: 600, proteinGrams: 30, carbohydrateGrams: 80, fatGrams: 15, ...overrides },
    { id: `f${++seq}`, date, now: `${date}T12:00:00.000Z` },
  );
  if (!r.ok) {
    throw new Error('fixture');
  }
  return r.value;
};
const weight = (date: string, kilograms: number): WeightEntry => ({ id: `w-${date}`, date, weight: { kilograms }, createdAt: `${date}T06:00:00.000Z`, updatedAt: `${date}T06:00:00.000Z` });
const tape = (date: string, waist: number): MeasurementEntry => ({ id: `m-${date}`, date, values: { waist: { centimeters: waist } }, createdAt: `${date}T06:00:00.000Z`, updatedAt: `${date}T06:00:00.000Z` });
const report = (date: string, bodyFat: number): BodyCompositionAssessment => ({
  id: `r-${date}`,
  date,
  source: MANUAL_INBODY_SOURCE,
  reported: { 'body-fat-percentage': { value: bodyFat, unit: '%' } },
  createdAt: `${date}T06:00:00.000Z`,
  updatedAt: `${date}T06:00:00.000Z`,
});

const TARGETS: TargetState = {
  kind: 'available',
  targets: { calories: { kind: 'target', kcal: 2400, adjusted: false }, macros: { kind: 'target', proteinGrams: 150, carbohydrateGrams: 280, fatGrams: 70, constrained: false } },
};
const FOOD = [food('2026-10-05', { proteinGrams: 60 }), food('2026-10-06', { proteinGrams: 60, calories: 900 }), food('2026-10-07', { proteinGrams: 60 })];

function snapshot(overrides: Partial<WeeklyReviewInput> = {}, extra: { targets?: TargetState; today?: string } = {}) {
  const today = extra.today ?? TODAY;
  const input: WeeklyReviewInput = {
    weekStart: WEEK,
    today,
    unitSystem: 'metric',
    localDateOf,
    training: { logs: [session(9, 28, 60), session(10, 6, 60), session(10, 8, 62.5)], plannedPerWeek: 3 },
    nutrition: { week: nutritionWeek(FOOD, WEEK, today)!, calorieTarget: 2400, proteinTarget: 150 },
    weights: [weight('2026-09-20', 81.4), weight('2026-10-10', 80.6)],
    measurements: [tape('2026-09-20', 90), tape('2026-10-09', 89)],
    bodyComposition: [report('2026-09-01', 22.4), report('2026-10-07', 21.6)],
    ...overrides,
  };
  return { today, unitSystem: input.unitSystem, review: weeklyReview(input)!, targets: extra.targets ?? TARGETS };
}

describe('Weekly Fitness Review view model', () => {
  it('words a complete review: summary, stats, explained actions and every section', () => {
    const s = toReviewScreen(snapshot());
    expect(s.header).toMatchObject({ title: 'Last week', range: 'Oct 5 – 11, 2026', isCurrent: false, canGoNext: true });
    expect(s.summary).toBe('You finished 2 of 3 planned workouts, logged food on 3 of 7 days and your weight was 0.8 kg lower over 4 weeks.');
    expect(s.stats.map((x) => x.value)).toEqual(['2 / 3', '3 / 7 days', '−0.8 kg']);
    expect(s.actionsTitle).toBe('Focus for next week');
    expect(s.actions.map((a) => [a.id, a.title, a.reason])).toEqual([
      ['complete-workouts', 'Complete your 3 planned workouts', 'You finished 2 of 3 planned workouts in this week.'],
      ['protein', 'Bring protein closer to 150 g a day', 'On the 3 days you logged, protein averaged 60 g, below your 150 g daily target.'],
      ['log-food', 'Log your food on more days', 'Food was logged on 3 of 7 days, so your averages aren’t reliable yet.'],
    ]);
    expect(s.actions.map((a) => a.link.target.kind)).toEqual(['workout', 'nutrition', 'nutrition']);

    expect(s.training).toMatchObject({ kind: 'ready', summary: '2 of 3 planned workouts finished.', stalled: [], showRule: true });
    if (s.training.kind !== 'ready') {
      throw new Error('training');
    }
    expect(s.training.improving).toHaveLength(1);
    expect(s.training.improving[0].detail).toMatch(/^62\.5 kg × 8, up from 60 kg × 8$/);
    expect(s.training.notEnough).toMatch(/more comparable sessions before a trend can be shown\.$/);

    expect(s.nutrition).toMatchObject({
      kind: 'ready',
      coverage: 'Food logged on 3 of 7 days',
      rows: [
        { key: 'calories', value: '700 kcal a day', target: 'target 2,400 kcal' },
        { key: 'protein', value: '60 g a day', target: 'target 150 g' },
      ],
      targetNote: null,
      link: { target: { kind: 'nutrition-week', date: WEEK } },
    });
    expect(s.body.weight).toEqual({ kind: 'ready', text: '−0.8 kg over 4 weeks', detail: '81.4 kg on Sep 20 → 80.6 kg on Oct 10, 2 weigh-ins' });
    expect(s.body.measurements).toEqual({ kind: 'ready', items: [{ key: 'waist', label: 'Waist', value: '−1.0 cm', detail: 'Sep 20 → Oct 9' }] });
    expect(s.body.composition).toEqual({ kind: 'ready', items: [{ key: 'body-fat-percentage', label: 'Body fat percentage', value: '−0.8%', detail: 'Sep 1 → Oct 7' }] });
  });

  it('the current week reads as “so far” and focuses on the rest of the week', () => {
    const s = toReviewScreen(snapshot({ weekStart: '2026-10-05' }, { today: '2026-10-08' }));
    expect(s.current).toBe(true);
    expect(s.header.title).toBe('This week');
    expect(s.actionsTitle).toBe('Focus for the rest of this week');
    expect(s.summary).toBe('So far this week, you finished 2 of 3 planned workouts, logged food on 3 of 4 days and your weight was 0.8 kg lower over 4 weeks.');
    expect(s.actions[0]).toMatchObject({ id: 'complete-workouts', title: 'Fit in your remaining 1 workout', reason: '2 of 3 planned workouts done so far this week.' });
  });

  it('without valid targets: no target comparison, the reason is shown, no target-based action', () => {
    const s = toReviewScreen(snapshot({ nutrition: { week: nutritionWeek(FOOD, WEEK, TODAY)!, calorieTarget: null, proteinTarget: null } }, { targets: { kind: 'no-profile' } }));
    expect(s.nutrition).toMatchObject({ kind: 'ready', rows: [{ target: null }, { target: null }], targetNote: 'Set up your profile to see your daily targets.' });
    expect(s.actions.map((a) => a.id)).not.toContain('protein');
  });

  it('unreadable sources stay visibly unavailable, never zero', () => {
    const s = toReviewScreen(snapshot({ training: null, nutrition: null, weights: null, measurements: null, bodyComposition: null }, { targets: { kind: 'unavailable' } }));
    expect(s.stats.map((x) => x.value)).toEqual(['Not recorded', 'Not recorded', 'Not recorded']);
    expect(s.training).toEqual({ kind: 'unavailable' });
    expect(s.nutrition).toEqual({ kind: 'unavailable' });
    expect(s.body).toEqual({ weight: { kind: 'unavailable' }, measurements: { kind: 'unavailable' }, composition: { kind: 'unavailable' } });
  });

  it('an empty history explains what is missing instead of guessing', () => {
    const s = toReviewScreen(snapshot({ training: { logs: [], plannedPerWeek: null }, nutrition: { week: nutritionWeek([], WEEK, TODAY)!, calorieTarget: 2400, proteinTarget: 150 }, weights: [], measurements: [], bodyComposition: [] }));
    expect(s.summary).toBe('Not much was recorded in this week, so there’s little to review yet.');
    expect(s.training).toMatchObject({ kind: 'ready', summary: 'No workouts finished in this week.', improving: [], stalled: [], notEnough: null, showRule: false });
    expect(s.nutrition).toEqual({ kind: 'empty', coverage: 'Food logged on 0 of 7 days' });
    expect(s.body.weight).toEqual({ kind: 'ready', text: 'No weigh-ins in the last 4 weeks.', detail: null });
    expect(s.body.measurements).toEqual({ kind: 'ready', items: [] });
    expect(s.body.composition).toEqual({ kind: 'ready', items: [] });
    expect(s.actions.map((a) => a.id)).toEqual(['log-food', 'weigh-in', 'measure']);
    expect(s.actions.find((a) => a.id === 'measure')?.reason).toBe('No tape measurements recorded yet; they help track change beyond the scale.');
  });

  it('a single weigh-in is not a trend', () => {
    const s = toReviewScreen(snapshot({ weights: [weight('2026-10-10', 80)] }));
    expect(s.body.weight).toEqual({ kind: 'ready', text: 'Only one weigh-in in the last 4 weeks: not enough for a trend.', detail: null });
    expect(s.stats.find((x) => x.key === 'weight')?.value).toBe('Not recorded');
    expect(s.summary).not.toMatch(/weight/);
  });

  it('a stalled exercise is named with its best earlier top set and linked to its history', () => {
    const logs = [session(9, 14, 60), session(9, 21, 60), session(9, 28, 60), session(10, 7, 60)];
    const s = toReviewScreen(snapshot({ training: { logs, plannedPerWeek: 1 } }));
    if (s.training.kind !== 'ready') {
      throw new Error('training');
    }
    expect(s.training.stalled.length).toBeGreaterThan(0);
    expect(s.training.stalled[0].detail).toBe('No better top set than 60 kg × 8 in the last 3 comparable sessions');
    const action = s.actions.find((a) => a.id === 'review-exercise');
    expect(action?.reason).toBe('No better top set than 60 kg × 8 in your last 3 comparable sessions.');
    expect(action?.link.target).toEqual({ kind: 'exercise', exerciseId: s.training.stalled[0].exerciseId });
  });

  it('imperial: weight and lengths in lb and in', () => {
    const s = toReviewScreen(snapshot({ unitSystem: 'imperial' }));
    expect(s.body.weight).toMatchObject({ text: '−1.8 lb over 4 weeks' });
    expect(s.stats.find((x) => x.key === 'weight')?.value).toBe('−1.8 lb');
    expect(s.body.measurements).toMatchObject({ items: [{ value: '−0.4 in' }] });
  });
});
