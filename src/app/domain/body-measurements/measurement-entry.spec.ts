import {
  MeasurementEntry,
  MeasurementEntryInput,
  circumferenceFromUnit,
  circumferenceInUnit,
  compareMeasurementEntries,
  createMeasurementEntry,
  lengthUnitLabel,
  parseMeasurementEntry,
  sortMeasurementEntries,
  updateMeasurementEntry,
  validateMeasurementEntryInput,
} from './measurement-entry';

const TODAY = '2026-10-09';
const NOW = '2026-10-09T07:30:00.000Z';
const cm = (values: MeasurementEntryInput['values'], date = '2026-10-08'): MeasurementEntryInput => ({ values, unitSystem: 'metric', date });
const inches = (values: MeasurementEntryInput['values'], date = '2026-10-08'): MeasurementEntryInput => ({
  values,
  unitSystem: 'imperial',
  date,
});
const entry = (id: string, date: string, createdAt = `${date}T07:00:00.000Z`): MeasurementEntry => ({
  id,
  date,
  values: { waist: { centimeters: 82 } },
  createdAt,
  updatedAt: createdAt,
});
const created = (input: MeasurementEntryInput, id = 'm1') => {
  const r = createMeasurementEntry(input, { id, now: NOW, today: TODAY });
  if (!r.ok) {
    throw new Error(JSON.stringify(r.errors));
  }
  return r.value;
};

describe('body measurements domain', () => {
  describe('validation', () => {
    it('accepts any non-empty subset of sites, in either unit, today or earlier', () => {
      expect(validateMeasurementEntryInput(cm({ waist: 82.5 }), TODAY)).toEqual({});
      expect(validateMeasurementEntryInput(cm({ waist: 82, chest: 100, hips: 98, arm: 34, thigh: 58 }, TODAY), TODAY)).toEqual({});
      expect(validateMeasurementEntryInput(inches({ arm: 13.5, waist: null }), TODAY)).toEqual({});
    });

    it.each<[string, MeasurementEntryInput, Record<string, string>]>([
      ['no sites at all', cm({}), { values: 'required' }],
      ['only blank sites', cm({ waist: null, chest: null }), { values: 'required' }],
      ['NaN', cm({ waist: Number.NaN }), { waist: 'not-a-number' }],
      ['Infinity', cm({ chest: Infinity }), { chest: 'not-a-number' }],
      ['zero', cm({ hips: 0 }), { hips: 'out-of-range' }],
      ['negative', cm({ arm: -30 }), { arm: 'out-of-range' }],
      ['below the minimum', cm({ arm: 9.9 }), { arm: 'out-of-range' }],
      ['above the maximum', cm({ waist: 300.1 }), { waist: 'out-of-range' }],
      ['inches below the minimum (3.9 in ≈ 9.9 cm)', inches({ arm: 3.9 }), { arm: 'out-of-range' }],
      ['inches above the maximum (118.2 in ≈ 300.2 cm)', inches({ waist: 118.2 }), { waist: 'out-of-range' }],
      ['one bad site among good ones', cm({ waist: 82, thigh: 900 }), { thigh: 'out-of-range' }],
      ['missing date', cm({ waist: 82 }, ' '), { date: 'required' }],
      ['impossible date', cm({ waist: 82 }, '2026-02-30'), { date: 'invalid-date' }],
      ['malformed date', cm({ waist: 82 }, '8/10/2026'), { date: 'invalid-date' }],
      ['future date', cm({ waist: 82 }, '2026-10-10'), { date: 'future-date' }],
    ])('rejects %s', (_, input, errors) => {
      expect(validateMeasurementEntryInput(input, TODAY)).toEqual(errors);
      expect(createMeasurementEntry(input, { id: 'x', now: NOW, today: TODAY }).ok).toBe(false);
    });

    it('accepts the range boundaries in both units', () => {
      expect(validateMeasurementEntryInput(cm({ arm: 10, waist: 300 }), TODAY)).toEqual({});
      expect(validateMeasurementEntryInput(inches({ arm: 4, waist: 118.1 }), TODAY)).toEqual({});
    });
  });

  describe('canonical centimeters', () => {
    it('stores only the measured sites, in centimeters, whatever the input unit', () => {
      expect(created(cm({ waist: 82.456, chest: null }, '2026-10-01'))).toEqual({
        id: 'm1',
        date: '2026-10-01',
        values: { waist: { centimeters: 82.46 } },
        createdAt: NOW,
        updatedAt: NOW,
      });
      expect(created(inches({ waist: 32.3, arm: 13 })).values).toEqual({ waist: { centimeters: 82.04 }, arm: { centimeters: 33.02 } });
    });

    it('inch input round-trips at display precision', () => {
      for (const value of [4, 13.7, 32.3, 45.9, 118.1]) {
        expect(circumferenceInUnit(circumferenceFromUnit(value, 'imperial'), 'imperial')).toBe(value);
      }
      expect(circumferenceInUnit({ centimeters: 82.04 }, 'metric')).toBe(82);
      expect(lengthUnitLabel('metric')).toBe('cm');
      expect(lengthUnitLabel('imperial')).toBe('in');
    });
  });

  describe('editing', () => {
    it('keeps the id and creation time; replaces values (removed sites disappear), date and update time', () => {
      const original = created(cm({ waist: 82, chest: 100 }));
      const later = '2026-10-09T09:00:00.000Z';
      expect(updateMeasurementEntry(original, cm({ waist: 81, chest: null }, '2026-10-07'), { now: later, today: TODAY })).toEqual({
        ok: true,
        value: { id: 'm1', date: '2026-10-07', values: { waist: { centimeters: 81 } }, createdAt: NOW, updatedAt: later },
      });
      expect(updateMeasurementEntry(original, cm({}), { now: later, today: TODAY })).toEqual({ ok: false, errors: { values: 'required' } });
    });
  });

  describe('stored entries', () => {
    it('round-trips through JSON and rejects anything malformed or unknown', () => {
      const original = created(cm({ waist: 82, hips: 98.5 }));
      const stored = JSON.parse(JSON.stringify(original));
      expect(parseMeasurementEntry(stored)).toEqual(original);
      for (const broken of [
        { ...stored, id: '' },
        { ...stored, id: 4 },
        { ...stored, date: '2026-13-01' },
        { ...stored, values: {} },
        { ...stored, values: [] },
        { ...stored, values: null },
        { ...stored, values: { waist: { centimeters: '82' } } },
        { ...stored, values: { waist: { centimeters: 5 } } },
        { ...stored, values: { waist: { inches: 32 } } },
        { ...stored, values: { waist: 82 } },
        { ...stored, values: { waist: { centimeters: 82 }, neck: { centimeters: 38 } } },
        { ...stored, createdAt: 'yesterday' },
        { ...stored, updatedAt: undefined },
        null,
        [],
        'measurement',
      ]) {
        expect(parseMeasurementEntry(broken)).toBeNull();
      }
    });
  });

  describe('ordering', () => {
    it('orders by measurement date, then record creation time, then id; edits never reorder', () => {
      const a = entry('a', '2026-10-05');
      const sameDayEarly = entry('z', '2026-10-07', '2026-10-07T06:00:00.000Z');
      const sameDayLate = { ...entry('b', '2026-10-07', '2026-10-07T20:00:00.000Z'), updatedAt: '2026-10-09T10:00:00.000Z' };
      const twinA = entry('m1', '2026-10-08');
      const twinB = entry('m2', '2026-10-08');
      const ordered = [a, sameDayEarly, sameDayLate, twinA, twinB];
      expect(sortMeasurementEntries([twinB, sameDayLate, a, twinA, sameDayEarly])).toEqual(ordered);
      expect(sortMeasurementEntries([...ordered].reverse())).toEqual(ordered);
      expect(compareMeasurementEntries(twinA, twinA)).toBe(0);
    });
  });
});
