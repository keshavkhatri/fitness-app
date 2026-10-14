import { TargetState } from '../../core/nutrition/nutrition.service';
import { FoodEntry, FoodEntryInput, createFoodEntry, nutritionWeek } from '../../domain/nutrition';
import { niceMax, targetFor, toWeekChart } from './nutrition-week-chart';

// Synthetic food only. Thursday 8 October 2026 is "today".
const TODAY = '2026-10-08';
const INPUT: FoodEntryInput = { name: 'Oats', quantity: 60, unit: 'g', meal: 'breakfast', calories: 230, proteinGrams: 8, carbohydrateGrams: 40, fatGrams: 4 };
let seq = 0;
const food = (date: string, overrides: Partial<FoodEntryInput> = {}): FoodEntry => {
  const r = createFoodEntry({ ...INPUT, ...overrides }, { id: `f${++seq}`, date, now: `${date}T08:00:00.000Z` });
  if (!r.ok) {
    throw new Error('fixture');
  }
  return r.value;
};
const TARGETS: TargetState = {
  kind: 'available',
  targets: {
    calories: { kind: 'target', kcal: 2000, adjusted: false },
    macros: { kind: 'target', proteinGrams: 140, carbohydrateGrams: 220, fatGrams: 65, constrained: false },
  },
};
const week = (entries: FoodEntry[]) => nutritionWeek(entries, TODAY, TODAY)!;

describe('nutrition week chart', () => {
  it('nice axis tops', () => {
    expect(niceMax(2300)).toBe(2400);
    expect(niceMax(2000)).toBe(2000);
    expect(niceMax(140)).toBe(160);
    expect(niceMax(65)).toBe(80);
    expect(niceMax(0)).toBe(0);
  });

  it('targets only from the calculation (none when withheld)', () => {
    expect(targetFor(TARGETS, 'calories')).toBe(2000);
    expect(targetFor(TARGETS, 'carbs')).toBe(220);
    expect(targetFor({ kind: 'no-profile' }, 'calories')).toBeNull();
    const withheld: TargetState = { kind: 'available', targets: { calories: { kind: 'target', kcal: 1400, adjusted: false }, macros: { kind: 'withheld', reason: 'infeasible' } } };
    expect(targetFor(withheld, 'calories')).toBe(1400);
    expect(targetFor(withheld, 'protein')).toBeNull();
  });

  it('bars only for logged days (a logged 0 kcal day is a bar of 0, a day without food has none)', () => {
    const c = toWeekChart(week([food('2026-10-05', { calories: 1500 }), food('2026-10-06', { calories: 0, proteinGrams: 0, carbohydrateGrams: 0, fatGrams: 0 })]), TARGETS, 'calories', TODAY);
    expect(c.bars.map((b) => [b.letter, b.status, b.height])).toEqual([
      ['M', 'logged', 75],
      ['T', 'logged', 0],
      ['W', 'not-logged', null],
      ['T', 'not-logged', null],
      ['F', 'upcoming', null],
      ['S', 'upcoming', null],
      ['S', 'upcoming', null],
    ]);
    expect(c.bars[3].isToday).toBe(true);
    expect(c.targetHeight).toBe(100);
    expect(c.targetText).toBe('Daily target 2,000 kcal');
    expect(c.ticks.map((t) => t.label)).toEqual(['2k', '1.5k', '1k', '500', '0']);
  });

  it('without a target: no target outline; an empty week still has a scale', () => {
    const c = toWeekChart(week([]), { kind: 'no-profile' }, 'protein', TODAY);
    expect(c.targetHeight).toBeNull();
    expect(c.targetText).toBeNull();
    expect(c.bars.every((b) => b.height === null)).toBe(true);
    expect(c.ticks[0].label).toBe('200');
  });
});
