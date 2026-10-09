import { WeightEntry } from './weight-entry';
import { entriesInRange, rangeStart, weightRangeSummary } from './weight-trends';

const TODAY = '2026-10-09';
const entry = (id: string, date: string, kilograms: number, createdAt = `${date}T06:00:00.000Z`): WeightEntry => ({
  id,
  date,
  weight: { kilograms },
  createdAt,
  updatedAt: createdAt,
});
const ids = (list: readonly WeightEntry[]) => list.map((e) => e.id);

describe('weight trends', () => {
  describe('rolling windows ending today (inclusive)', () => {
    it('30 days is today and the 29 days before; 90 days likewise; all time has no start', () => {
      expect(rangeStart('30d', TODAY)).toBe('2026-09-10');
      expect(rangeStart('90d', TODAY)).toBe('2026-07-12');
      expect(rangeStart('all', TODAY)).toBeNull();
      // Across a year boundary and a leap day.
      expect(rangeStart('30d', '2027-01-15')).toBe('2026-12-17');
      expect(rangeStart('30d', '2028-03-01')).toBe('2028-02-01'); // 29 days in February 2028
      expect(rangeStart('90d', 'not-a-date')).toBeNull();
    });

    it('includes both window edges and excludes the day before', () => {
      const list = [entry('before30', '2026-09-09', 81), entry('edge30', '2026-09-10', 81), entry('today', TODAY, 80)];
      expect(ids(entriesInRange(list, '30d', TODAY))).toEqual(['edge30', 'today']);
      const ninety = [entry('before90', '2026-07-11', 84), entry('edge90', '2026-07-12', 84)];
      expect(ids(entriesInRange(ninety, '90d', TODAY))).toEqual(['edge90']);
    });

    it('all time includes everything valid', () => {
      const list = [entry('old', '2024-01-02', 90), entry('mid', '2026-07-01', 84), entry('now', TODAY, 80)];
      expect(ids(entriesInRange(list, 'all', TODAY))).toEqual(['old', 'mid', 'now']);
    });

    it('excludes invalid or future measurement dates defensively', () => {
      const list = [entry('ok', '2026-10-01', 80), entry('bad', '2026-02-30', 80), entry('junk', 'yesterday', 80), entry('future', '2026-10-10', 80)];
      for (const range of ['30d', '90d', 'all'] as const) {
        expect(ids(entriesInRange(list, range, TODAY))).toEqual(['ok']);
      }
    });

    it('orders by the existing history order, keeping same-day entries (never merged)', () => {
      const list = [
        entry('pm', '2026-10-08', 80.8, '2026-10-08T19:00:00.000Z'),
        entry('am', '2026-10-08', 80.2, '2026-10-08T06:00:00.000Z'),
        entry('first', '2026-10-01', 81),
      ];
      expect(ids(entriesInRange(list, '30d', TODAY))).toEqual(['first', 'am', 'pm']);
    });
  });

  describe('range summary', () => {
    it('first, latest and the change between them, from displayed values', () => {
      const list = [entry('c', '2026-10-09', 80.94), entry('a', '2026-09-20', 82.04), entry('b', '2026-10-01', 81.5)];
      const s = weightRangeSummary(list, '30d', TODAY, 'metric')!;
      expect(s.points.map((p) => [p.entry.id, p.value])).toEqual([
        ['a', 82],
        ['b', 81.5],
        ['c', 80.9],
      ]);
      expect([s.first.entry.id, s.latest.entry.id, s.netChange]).toEqual(['a', 'c', -1.1]);
    });

    it('uses only measurements inside the range', () => {
      const list = [entry('old', '2026-06-01', 90), entry('a', '2026-09-20', 82), entry('b', '2026-10-05', 81)];
      expect(weightRangeSummary(list, '30d', TODAY, 'metric')).toMatchObject({ first: { entry: { id: 'a' } }, netChange: -1 });
      expect(weightRangeSummary(list, 'all', TODAY, 'metric')).toMatchObject({ first: { entry: { id: 'old' } }, netChange: -9 });
    });

    it('a single measurement is both first and latest, with zero change', () => {
      const s = weightRangeSummary([entry('only', TODAY, 80)], '30d', TODAY, 'metric')!;
      expect(s.points).toHaveLength(1);
      expect(s.first).toBe(s.latest);
      expect(Object.is(s.netChange, 0)).toBe(true);
    });

    it('no measurements in range → null (no invented zero weight)', () => {
      expect(weightRangeSummary([], 'all', TODAY, 'metric')).toBeNull();
      expect(weightRangeSummary([entry('old', '2026-01-01', 80)], '90d', TODAY, 'metric')).toBeNull();
    });

    it('converts to the display unit consistently, without touching stored kilograms', () => {
      const list = [entry('a', '2026-10-01', 80), entry('b', '2026-10-08', 79.5)];
      const frozen = JSON.parse(JSON.stringify(list));
      const lb = weightRangeSummary(list, '30d', TODAY, 'imperial')!;
      expect(lb.points.map((p) => p.value)).toEqual([176.4, 175.3]);
      expect(lb.netChange).toBe(-1.1);
      expect(weightRangeSummary(list, '30d', TODAY, 'metric')!.netChange).toBe(-0.5);
      expect(list).toEqual(frozen);
      expect(lb.first.entry).toBe(list[0]);
    });

    it('equal first and latest values give exactly zero, not −0', () => {
      const s = weightRangeSummary([entry('a', '2026-10-01', 80.01), entry('b', '2026-10-02', 79.99)], '30d', TODAY, 'metric')!;
      expect(Object.is(s.netChange, 0)).toBe(true);
    });
  });
});
