import { WeightHistoryState } from '../../core/body-measurements/weight-history.service';
import { NutritionDay, nutritionDay } from '../../domain/nutrition';
import { mindsetFor } from './home-dashboard-content';
import { BODY_POINTS, toBodyOverview, toFocus, toMacroRings, toMealTiles, toMilestone, toWeeklyProgress } from './home-dashboard';
import { HomeWeekView } from './home-training';
import { DaySummaryView } from '../nutrition/nutrition-view-model';

const entry = (date: string, kg: number) => ({ id: date, date, weight: { kilograms: kg }, createdAt: `${date}T08:00:00Z`, updatedAt: `${date}T08:00:00Z` });

describe('home dashboard cards', () => {
  it('counts down to the next streak milestone with one dot per day', () => {
    expect(toMilestone(1)).toEqual(expect.objectContaining({ headline: '2 days', caption: 'Keep your 3-day streak', dots: [true, false, false] }));
    expect(toMilestone(0).caption).toBe('Start a 3-day streak');
    expect(toMilestone(null).headline).toBe('3 days');
    const week = toMilestone(5);
    expect(week.headline).toBe('2 days');
    expect(week.dots).toEqual([true, true, false, false]); // 3 → 7
    const long = toMilestone(40);
    expect(long.dots).toBeNull(); // 30 → 60
    expect(long.progress).toBeCloseTo(10 / 30);
    expect(toMilestone(400).caption).toBe('Every milestone reached');
  });

  it('shows the latest weight against the very first one (all time)', () => {
    const state: WeightHistoryState = {
      status: 'ready',
      unitSystem: 'metric',
      entries: [entry('2026-10-05', 95.1), entry('2025-12-20', 97.7), entry('2026-10-20', 94.5)],
    };
    const view = toBodyOverview(state, '2026-10-22');
    expect(view).toEqual(
      expect.objectContaining({ kind: 'ready', latest: '94.5 kg', start: '97.7 kg', since: '20 Dec 2025', change: '3.2 kg', direction: 'down', count: 3 }),
    );
    expect(view?.kind === 'ready' && view.points.map((p) => Math.round(p * 100) / 100)).toEqual([1, 0.19, 0]);
  });

  it('draws a long history with at most the point limit, keeping the first and the latest', () => {
    const entries = Array.from({ length: 200 }, (_, i) => entry(`2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, 100 - i / 10));
    const view = toBodyOverview({ status: 'ready', unitSystem: 'metric', entries }, '2026-10-22');
    expect(view?.kind === 'ready' && view.points.length).toBe(BODY_POINTS);
    expect(view?.kind === 'ready' && [view.points[0], view.points.at(-1)]).toEqual([1, 0]);
  });

  it('has no change for a single weigh-in, and an empty state without any', () => {
    const one = toBodyOverview({ status: 'ready', unitSystem: 'metric', entries: [entry('2026-10-20', 80)] }, '2026-10-22');
    expect(one).toEqual(expect.objectContaining({ kind: 'ready', change: null, points: [] }));
    expect(toBodyOverview({ status: 'ready', unitSystem: 'metric', entries: [] }, '2026-10-22')).toEqual({ kind: 'empty' });
    expect(toBodyOverview({ status: 'loading' }, '2026-10-22')).toBeNull();
  });

  it('lists the meals in the order they are eaten, with calories once logged', () => {
    const day: NutritionDay = nutritionDay(
      [
        {
          id: 'a',
          date: '2026-10-22',
          name: 'Apple',
          quantity: 1,
          unit: 'piece',
          meal: 'snacks',
          nutrition: { calories: 95, proteinGrams: 0.5, carbohydrateGrams: 25, fatGrams: 0.3 },
          createdAt: '2026-10-22T10:00:00Z',
          updatedAt: '2026-10-22T10:00:00Z',
        },
      ],
      '2026-10-22',
    );
    const tiles = toMealTiles(day);
    expect(tiles.map((t) => t.meal)).toEqual(['breakfast', 'lunch', 'snacks', 'dinner']);
    expect(tiles[2].calories).toBe('95 kcal');
    expect(tiles[0].calories).toBeNull();
  });

  const summary = (target: boolean): DaySummaryView => ({
    calories: {
      headline: '',
      eaten: '0',
      target: target ? '2,626' : null,
      status: null,
      balance: null,
      over: false,
      progress: target ? { value: 0, max: 2626, valueText: '0 of 2,626 kcal' } : null,
    },
    macros: [
      { key: 'protein', label: 'Protein', eaten: '0 g', target: target ? '170 g' : null, status: null, progress: target ? { value: 0, max: 170, valueText: 'p' } : null },
      { key: 'carbs', label: 'Carbs', eaten: '0 g', target: target ? '75 g' : null, status: null, progress: null },
      { key: 'fat', label: 'Fat', eaten: '0 g', target: target ? '79 g' : null, status: null, progress: null },
    ],
    targetNote: null,
  });

  it('shapes the macro rings and today’s focus from the day summary', () => {
    const rings = toMacroRings(summary(true));
    expect(rings.map((r) => [r.label, r.eaten, r.target])).toEqual([
      ['Protein', '0g', '/ 170g'],
      ['Calories', '0', '/ 2,626'],
      ['Carbs', '0g', '/ 75g'],
      ['Fats', '0g', '/ 79g'],
    ]);
    expect(toFocus(summary(true)).map((f) => f.value)).toEqual(['10k+', '170g+', '7h+']);
    // No protein target: no protein aim.
    expect(toFocus(summary(false)).map((f) => f.key)).toEqual(['steps', 'sleep']);
  });

  it('averages only the days with steps logged; nothing logged reads as missing', () => {
    const week = { done: 1, planned: 3 } as HomeWeekView;
    const view = toWeeklyProgress({
      week,
      steps: { '2026-10-19': 6_000, '2026-10-21': 9_000, '2026-10-12': 20_000 },
      nutrition: null,
      targets: null,
      today: '2026-10-22',
    });
    expect(view.stats.map((s) => s.value)).toEqual(['1/3', '7,500', '–']);
    expect(view.stats[0].progress).toBeCloseTo(1 / 3);
    expect(view.stats[2].progress).toBeNull();
  });

  it('uses the person’s own step goal: today’s focus and the weekly bar follow it', () => {
    expect(toFocus(summary(true), 7_500).find((i) => i.key === 'steps')).toEqual(
      expect.objectContaining({ value: '7.5k+', ariaLabel: 'Walk 7,500 steps or more. Log steps' }),
    );
    const input = { week: null, steps: { '2026-10-19': 5_000 }, nutrition: null, targets: null, today: '2026-10-22' as const };
    expect(toWeeklyProgress(input).stats[1].progress).toBeCloseTo(0.5); // 5,000 of the default 10,000
    expect(toWeeklyProgress({ ...input, stepGoal: 5_000 }).stats[1].progress).toBe(1);
    expect(toWeeklyProgress({ ...input, stepGoal: 20_000 }).stats[1].progress).toBeCloseTo(0.25);
  });

  it('keeps the same quote and tip all day', () => {
    expect(mindsetFor(20_000)).toEqual(mindsetFor(20_000));
    expect(mindsetFor(20_000).quote).not.toBe(mindsetFor(20_001).quote);
  });
});
