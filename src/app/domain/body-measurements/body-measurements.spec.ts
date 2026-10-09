import { parseDecimalInput, weightInUnit } from '../fitness-profile';
import {
  WeightEntry,
  WeightEntryInput,
  createWeightEntry,
  parseWeightEntry,
  updateWeightEntry,
  validateWeightEntryInput,
} from './weight-entry';
import { compareWeightEntries, sortWeightEntries, weightHistory } from './weight-history';

const TODAY = '2026-10-09';
const NOW = '2026-10-09T07:30:00.000Z';
const kg = (weight: number | null, date = '2026-10-08'): WeightEntryInput => ({ weight, unitSystem: 'metric', date });
const lb = (weight: number | null, date = '2026-10-08'): WeightEntryInput => ({ weight, unitSystem: 'imperial', date });
const entry = (id: string, date: string, kilograms: number, createdAt = `${date}T07:00:00.000Z`): WeightEntry => ({
  id,
  date,
  weight: { kilograms },
  createdAt,
  updatedAt: createdAt,
});
const created = (input: WeightEntryInput, id = 'w1') => {
  const r = createWeightEntry(input, { id, now: NOW, today: TODAY });
  if (!r.ok) {
    throw new Error(JSON.stringify(r.errors));
  }
  return r.value;
};

describe('body-weight history domain', () => {
  describe('validation', () => {
    it('accepts plausible weights in either unit, today or earlier', () => {
      expect(validateWeightEntryInput(kg(80.4), TODAY)).toEqual({});
      expect(validateWeightEntryInput(lb(177.2), TODAY)).toEqual({});
      expect(validateWeightEntryInput(kg(80, TODAY), TODAY)).toEqual({});
    });

    it.each<[string, WeightEntryInput, Record<string, string>]>([
      ['missing weight', kg(null), { weight: 'required' }],
      ['NaN', kg(Number.NaN), { weight: 'not-a-number' }],
      ['Infinity', kg(Infinity), { weight: 'not-a-number' }],
      ['zero', kg(0), { weight: 'out-of-range' }],
      ['negative', kg(-80), { weight: 'out-of-range' }],
      ['below the profile minimum', kg(19.9), { weight: 'out-of-range' }],
      ['above the profile maximum', kg(500.1), { weight: 'out-of-range' }],
      ['pounds below the minimum (44 lb ≈ 19.96 kg)', lb(44), { weight: 'out-of-range' }],
      ['pounds above the maximum (1,103 lb ≈ 500.3 kg)', lb(1103), { weight: 'out-of-range' }],
      ['missing date', kg(80, ' '), { date: 'required' }],
      ['impossible date', kg(80, '2026-02-30'), { date: 'invalid-date' }],
      ['malformed date', kg(80, '8/10/2026'), { date: 'invalid-date' }],
      ['future date', kg(80, '2026-10-10'), { date: 'future-date' }],
    ])('rejects %s', (_, input, errors) => {
      expect(validateWeightEntryInput(input, TODAY)).toEqual(errors);
      expect(createWeightEntry(input, { id: 'x', now: NOW, today: TODAY }).ok).toBe(false);
    });

    it('accepts the range boundaries in both units', () => {
      expect(validateWeightEntryInput(kg(20), TODAY)).toEqual({});
      expect(validateWeightEntryInput(kg(500), TODAY)).toEqual({});
      expect(validateWeightEntryInput(lb(44.1), TODAY)).toEqual({});
      expect(validateWeightEntryInput(lb(1102), TODAY)).toEqual({});
    });

    it('typed text goes through the strict shared parser (never guessing at separators)', () => {
      expect(parseDecimalInput('80,4')).toEqual({ kind: 'number', value: 80.4 });
      expect(parseDecimalInput('80.4')).toEqual({ kind: 'number', value: 80.4 });
      expect(parseDecimalInput('1,234')).toEqual({ kind: 'ambiguous' });
      expect(parseDecimalInput('80.400')).toEqual({ kind: 'ambiguous' });
    });
  });

  describe('canonical kilograms', () => {
    it('stores kilograms at the profile precision, whatever the input unit', () => {
      expect(created(kg(80.456)).weight).toEqual({ kilograms: 80.46 });
      expect(created(lb(180)).weight).toEqual({ kilograms: 81.65 });
      // Round trip back to the display unit.
      expect(weightInUnit(created(lb(180)).weight, 'imperial')).toBe(180);
      expect(weightInUnit(created(lb(180)).weight, 'metric')).toBe(81.7);
    });

    it('a new entry records its measurement date separately from creation time', () => {
      expect(created(kg(80.4, '2026-10-01'))).toEqual({
        id: 'w1',
        date: '2026-10-01',
        weight: { kilograms: 80.4 },
        createdAt: NOW,
        updatedAt: NOW,
      });
    });
  });

  describe('editing', () => {
    it('keeps the id and creation time; changes weight, date and update time', () => {
      const original = created(kg(80.4));
      const later = '2026-10-09T09:00:00.000Z';
      expect(updateWeightEntry(original, lb(176, '2026-10-07'), { now: later, today: TODAY })).toEqual({
        ok: true,
        value: { id: 'w1', date: '2026-10-07', weight: { kilograms: 79.83 }, createdAt: NOW, updatedAt: later },
      });
      expect(updateWeightEntry(original, kg(5), { now: later, today: TODAY })).toEqual({ ok: false, errors: { weight: 'out-of-range' } });
    });
  });

  describe('stored entries', () => {
    it('round-trips through JSON and rejects anything malformed', () => {
      const stored = JSON.parse(JSON.stringify(created(kg(80.4))));
      expect(parseWeightEntry(stored)).toEqual(created(kg(80.4)));
      for (const broken of [
        { ...stored, id: '' },
        { ...stored, id: 4 },
        { ...stored, date: '2026-13-01' },
        { ...stored, weight: { kilograms: '80' } },
        { ...stored, weight: { kilograms: 5 } },
        { ...stored, weight: { pounds: 180 } },
        { ...stored, createdAt: 'yesterday' },
        { ...stored, updatedAt: undefined },
        null,
        [],
        'weight',
      ]) {
        expect(parseWeightEntry(broken)).toBeNull();
      }
    });
  });

  describe('ordering', () => {
    it('orders by measurement date, then record creation time, then id', () => {
      const a = entry('a', '2026-10-05', 80);
      const sameDayEarly = entry('z', '2026-10-07', 80, '2026-10-07T06:00:00.000Z');
      const sameDayLate = entry('b', '2026-10-07', 79.5, '2026-10-07T20:00:00.000Z');
      const twinA = entry('m1', '2026-10-08', 79, '2026-10-08T07:00:00.000Z');
      const twinB = entry('m2', '2026-10-08', 79, '2026-10-08T07:00:00.000Z');
      const ordered = [a, sameDayEarly, sameDayLate, twinA, twinB];
      expect(sortWeightEntries([twinB, sameDayLate, a, twinA, sameDayEarly]).map((e) => e.id)).toEqual(['a', 'z', 'b', 'm1', 'm2']);
      expect(sortWeightEntries([...ordered].reverse())).toEqual(ordered);
      expect(compareWeightEntries(twinA, twinA)).toBe(0);
    });

    it('editing (updatedAt) never reorders; changing the measurement date does', () => {
      const first = entry('a', '2026-10-05', 80);
      const second = { ...entry('b', '2026-10-06', 79), updatedAt: '2026-10-09T10:00:00.000Z' };
      expect(sortWeightEntries([second, first]).map((e) => e.id)).toEqual(['a', 'b']);
      expect(sortWeightEntries([{ ...first, date: '2026-10-07' }, second]).map((e) => e.id)).toEqual(['b', 'a']);
    });
  });

  describe('change since the previous entry', () => {
    it('newest first; the first recorded entry has no comparison', () => {
      const items = weightHistory([entry('b', '2026-10-07', 79.6), entry('a', '2026-10-05', 80), entry('c', '2026-10-09', 80.04)], 'metric');
      expect(items.map((i) => [i.entry.id, i.displayWeight, i.changeSincePrevious, i.sameDayAsPrevious])).toEqual([
        ['c', 80, 0.4, false],
        ['b', 79.6, -0.4, false],
        ['a', 80, null, false],
      ]);
      expect(weightHistory([], 'metric')).toEqual([]);
      expect(weightHistory([entry('only', '2026-10-01', 80)], 'imperial')[0].changeSincePrevious).toBeNull();
    });

    it('is computed in the display unit from displayed values (no kg/lb mixing)', () => {
      const items = weightHistory([entry('a', '2026-10-05', 80.04), entry('b', '2026-10-06', 80.46)], 'metric');
      expect(items[0]).toMatchObject({ displayWeight: 80.5, changeSincePrevious: 0.5 }); // 80.0 → 80.5 on screen
      const pounds = weightHistory([entry('a', '2026-10-05', 80), entry('b', '2026-10-06', 79.5)], 'imperial');
      expect(pounds.map((i) => [i.displayWeight, i.changeSincePrevious])).toEqual([
        [175.3, -1.1],
        [176.4, null],
      ]);
    });

    it('same-day measurements are compared but flagged as same-day', () => {
      const items = weightHistory(
        [entry('am', '2026-10-08', 80.2, '2026-10-08T06:00:00.000Z'), entry('pm', '2026-10-08', 81, '2026-10-08T19:00:00.000Z')],
        'metric',
      );
      expect(items[0]).toMatchObject({ entry: { id: 'pm' }, changeSincePrevious: 0.8, sameDayAsPrevious: true });
    });

    it('no change is zero, not negative zero', () => {
      const [latest] = weightHistory([entry('a', '2026-10-05', 80), entry('b', '2026-10-06', 80.01)], 'metric');
      expect(Object.is(latest.changeSincePrevious, 0)).toBe(true);
    });
  });
});
