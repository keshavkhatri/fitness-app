import { createFoodEntry } from './food-entry';
import { FoodEntry, FoodEntryInput } from './nutrition.model';
import { nutritionWeek, shiftWeek, weekDates, weekStartOf } from './nutrition-week';

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
const week = (entries: FoodEntry[], date = TODAY, today = TODAY) => {
  const w = nutritionWeek(entries, date, today);
  if (!w) {
    throw new Error('invalid date');
  }
  return w;
};

describe('nutrition week', () => {
  describe('calendar week (Monday–Sunday)', () => {
    it('finds the Monday of any day, including Monday and Sunday themselves', () => {
      expect(weekStartOf('2026-10-08')).toBe('2026-10-05'); // Thursday
      expect(weekStartOf('2026-10-05')).toBe('2026-10-05'); // Monday
      expect(weekStartOf('2026-10-11')).toBe('2026-10-05'); // Sunday
      expect(weekStartOf('2026-10-12')).toBe('2026-10-12'); // next Monday
      expect(weekStartOf('2027-01-01')).toBe('2026-12-28'); // across a year
      expect(weekStartOf('2028-03-01')).toBe('2028-02-28'); // across a leap day
      expect(weekStartOf('not-a-date')).toBeNull();
    });

    it('lists seven days Monday first, and steps whole weeks', () => {
      expect(weekDates('2026-12-28')).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
      expect(shiftWeek('2026-10-05', -1)).toBe('2026-09-28');
      expect(shiftWeek('2026-10-05', 1)).toBe('2026-10-12');
      expect(weekDates('bad')).toEqual([]);
      expect(nutritionWeek([], 'bad', TODAY)).toBeNull();
    });

    it('uses only the week’s own entries (entries outside it are ignored)', () => {
      const w = week([food('2026-10-04'), food('2026-10-05', { calories: 500 }), food('2026-10-12')]);
      expect(w.start).toBe('2026-10-05');
      expect(w.end).toBe('2026-10-11');
      expect(w.total?.calories).toBe(500);
      expect(w.loggedDays).toBe(1);
    });
  });

  describe('missing data is never zero', () => {
    it('an empty week has no totals and no average', () => {
      const w = week([]);
      expect(w.days).toHaveLength(7);
      expect(w.days.every((d) => d.totals === null && d.entryCount === 0)).toBe(true);
      expect([w.loggedDays, w.total, w.average]).toEqual([0, null, null]);
    });

    it('marks days after today as upcoming (the current week so far)', () => {
      const w = week([food(TODAY)]);
      expect(w.days.map((d) => d.upcoming)).toEqual([false, false, false, false, true, true, true]);
      expect(w.elapsedDays).toBe(4);
      const past = week([], '2026-09-30');
      expect(past.elapsedDays).toBe(7);
      expect(past.days.some((d) => d.upcoming)).toBe(false);
    });

    it('ignores entries dated after today, even if stored', () => {
      const w = week([food(TODAY, { calories: 100 }), food('2026-10-10', { calories: 900 })]);
      expect(w.days[5]).toMatchObject({ date: '2026-10-10', upcoming: true, totals: null, entryCount: 0 });
      expect(w.total?.calories).toBe(100);
    });

    it('a logged 0 kcal entry makes its day logged, with real zero totals', () => {
      const w = week([food('2026-10-06', { name: 'Black coffee', calories: 0, proteinGrams: 0, carbohydrateGrams: 0, fatGrams: 0 }), food('2026-10-07', { calories: 600 })]);
      expect(w.days[1].totals).toEqual({ calories: 0, proteinGrams: 0, carbohydrateGrams: 0, fatGrams: 0 });
      expect(w.loggedDays).toBe(2);
      expect(w.average?.calories).toBe(300); // (0 + 600) / 2 logged days
    });
  });

  describe('aggregation', () => {
    it('sums each day and the week exactly (no floating-point noise)', () => {
      const w = week([
        food('2026-10-05', { calories: 100.1, proteinGrams: 0.1, carbohydrateGrams: 10, fatGrams: 0.2 }),
        food('2026-10-05', { calories: 200.2, proteinGrams: 0.2, carbohydrateGrams: 20, fatGrams: 0.1 }),
        food('2026-10-07', { calories: 0.3, proteinGrams: 0.3, carbohydrateGrams: 0.3, fatGrams: 0.3 }),
      ]);
      expect(w.days[0]).toMatchObject({ entryCount: 2, totals: { calories: 300.3, proteinGrams: 0.3, carbohydrateGrams: 30, fatGrams: 0.3 } });
      expect(w.total).toEqual({ calories: 300.6, proteinGrams: 0.6, carbohydrateGrams: 30.3, fatGrams: 0.6 });
    });

    it('averages over logged days only (the documented denominator), to one decimal', () => {
      const w = week([food('2026-10-05', { calories: 1800, proteinGrams: 120 }), food('2026-10-07', { calories: 2101, proteinGrams: 131 })]);
      expect(w.loggedDays).toBe(2);
      expect(w.elapsedDays).toBe(4);
      expect(w.average).toEqual({ calories: 1950.5, proteinGrams: 125.5, carbohydrateGrams: 40, fatGrams: 4 });
      const three = week([food('2026-10-05', { calories: 100 }), food('2026-10-06', { calories: 100 }), food('2026-10-07', { calories: 101 })]);
      expect(three.average?.calories).toBe(100.3); // 301 / 3
    });

    it('is deterministic regardless of entry order', () => {
      const entries = [food('2026-10-05'), food('2026-10-07', { calories: 50 }), food('2026-10-06', { calories: 75.5 })];
      expect(week([...entries].reverse())).toEqual(week(entries));
    });

    it('never changes the entries it summarises', () => {
      const entries = [food('2026-10-05'), food('2026-10-06')];
      const frozen = JSON.parse(JSON.stringify(entries));
      week(entries);
      expect(entries).toEqual(frozen);
    });
  });
});
