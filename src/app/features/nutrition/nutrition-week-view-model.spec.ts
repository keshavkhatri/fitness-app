import { NutritionWeekSnapshot, TargetState } from '../../core/nutrition/nutrition.service';
import { FoodEntry, FoodEntryInput, createFoodEntry, nutritionWeek } from '../../domain/nutrition';
import { toNutritionWeekScreen, toWeekHeader, weekRangeLabel } from './nutrition-week-view-model';

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
const snapshot = (entries: FoodEntry[], date = TODAY, targets: TargetState = TARGETS): NutritionWeekSnapshot => ({
  today: TODAY,
  week: nutritionWeek(entries, date, TODAY)!,
  targets,
});
/** Values never break inside (non-breaking spaces); parts are separated by ' · '. */
const parts = (...values: string[]) => values.map((v) => v.replace(/ /g, '\u00a0')).join(' · ');
const ready = (s: NutritionWeekSnapshot) => {
  const screen = toNutritionWeekScreen(s);
  if (screen.kind !== 'ready') {
    throw new Error(screen.kind);
  }
  return screen;
};

describe('nutrition week view model', () => {
  it('names this week, last week and older weeks; never offers a week after this one', () => {
    expect(toWeekHeader('2026-10-05', '2026-10-11', TODAY)).toEqual({ title: 'This week', range: 'Oct 5 – 11, 2026', isCurrent: true, canGoNext: false });
    expect(toWeekHeader('2026-09-28', '2026-10-04', TODAY)).toEqual({ title: 'Last week', range: 'Sep 28 – Oct 4, 2026', isCurrent: false, canGoNext: true });
    expect(toWeekHeader('2026-09-14', '2026-09-20', TODAY)).toMatchObject({ title: 'Sep 14 – 20, 2026', canGoNext: true });
    expect(weekRangeLabel('2026-12-28', '2027-01-03')).toBe('Dec 28, 2026 – Jan 3, 2027');
  });

  it('day rows distinguish logged, not logged and upcoming days', () => {
    const s = ready(snapshot([food('2026-10-05', { calories: 1420.4, proteinGrams: 62, carbohydrateGrams: 140, fatGrams: 41 })]));
    expect(s.days.map((d) => [d.weekday, d.dateLabel, d.status, d.openable])).toEqual([
      ['Monday', 'Oct 5', 'logged', true],
      ['Tuesday', 'Oct 6', 'not-logged', true],
      ['Wednesday', 'Oct 7', 'not-logged', true],
      ['Today', 'Oct 8', 'not-logged', true],
      ['Friday', 'Oct 9', 'upcoming', false],
      ['Saturday', 'Oct 10', 'upcoming', false],
      ['Sunday', 'Oct 11', 'upcoming', false],
    ]);
    expect(s.days[0]).toMatchObject({
      calories: '1,420 kcal',
      macros: parts('P 62 g', 'C 140 g', 'F 41 g'),
      comparison: '580 kcal below target',
      ariaLabel: 'Open Monday, Oct 5 in your food log. 1,420 kcal, protein 62 g, carbs 140 g, fat 41 g. 580 kcal below target',
    });
    expect(s.days[1]).toMatchObject({ calories: null, macros: null, comparison: null, progress: null, ariaLabel: 'Open Tuesday, Oct 6 in your food log. Nothing logged' });
    expect(s.days[4].ariaLabel).toBe('Friday, Oct 9: Upcoming');
    expect(s.loggedLabel).toBe('Food logged on 1 of 4 days so far');
  });

  it('a logged 0 kcal day is logged, not missing', () => {
    const s = ready(snapshot([food('2026-10-06', { name: 'Black coffee', calories: 0, proteinGrams: 0, carbohydrateGrams: 0, fatGrams: 0 })]));
    expect(s.days[1]).toMatchObject({ status: 'logged', calories: '0 kcal', comparison: '2,000 kcal below target' });
    expect(s.average?.calories.eaten).toBe('0');
  });

  it('averages over logged days against the daily targets, with the total alongside', () => {
    const s = ready(snapshot([food('2026-10-05', { calories: 1800, proteinGrams: 120 }), food('2026-10-07', { calories: 2300, proteinGrams: 150 })]));
    expect(s.total).toEqual({ calories: '4,100 kcal', macros: parts('Protein 270 g', 'Carbs 80 g', 'Fat 8 g') });
    expect(s.average).toMatchObject({
      calories: { eaten: '2,050', target: '2,000' },
      comparison: '50 kcal over your daily target',
      caption: "Across the 2 days with food logged. Days without entries aren't counted.",
      targetNote: null,
    });
    expect(s.average?.macros.map((m) => [m.label, m.eaten, m.target])).toEqual([
      ['Protein', '135 g', '140 g'],
      ['Carbs', '40 g', '220 g'],
      ['Fat', '4 g', '65 g'],
    ]);
    const onTarget = ready(snapshot([food('2026-10-05', { calories: 2000 })]));
    expect(onTarget.average?.comparison).toBe('On your daily target');
  });

  it('without valid targets: intake only, with a short reason; nothing invented', () => {
    const review: TargetState = { kind: 'available', targets: { calories: { kind: 'review-required' }, macros: { kind: 'withheld', reason: 'calorie-review' } } };
    for (const targets of [review, { kind: 'no-profile' } as TargetState, { kind: 'unavailable' } as TargetState]) {
      const s = ready(snapshot([food('2026-10-05', { calories: 1800 })], TODAY, targets));
      expect(s.average?.calories).toMatchObject({ eaten: '1,800', target: null, progress: null });
      expect(s.average?.comparison).toBeNull();
      expect(s.average?.macros.every((m) => m.target === null && m.progress === null)).toBe(true);
      expect(s.average?.targetNote).not.toBeNull();
      expect(s.days[0]).toMatchObject({ comparison: null, progress: null });
    }
  });

  it('an empty week has no totals or average (never zeros)', () => {
    const s = ready(snapshot([]));
    expect([s.total, s.average]).toEqual([null, null]);
    expect(s.days.every((d) => d.calories === null)).toBe(true);
    expect(s.loggedLabel).toBe('Food logged on 0 of 4 days so far');
    expect(ready(snapshot([], '2026-09-30')).loggedLabel).toBe('Food logged on 0 of 7 days');
  });
});
