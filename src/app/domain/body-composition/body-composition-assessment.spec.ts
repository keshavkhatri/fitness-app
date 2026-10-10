import {
  BODY_COMPOSITION_METRICS,
  BodyCompositionAssessment,
  BodyCompositionInput,
  MANUAL_INBODY_SOURCE,
  ReportedValue,
  compareBodyCompositionAssessments,
  createBodyCompositionAssessment,
  isUnitFor,
  parseBodyCompositionAssessment,
  sortBodyCompositionAssessments,
  updateBodyCompositionAssessment,
  validateBodyCompositionInput,
} from './body-composition-assessment';

const TODAY = '2026-10-09';
const NOW = '2026-10-09T07:30:00.000Z';
const kg = (value: number): ReportedValue => ({ value, unit: 'kg' });
const lb = (value: number): ReportedValue => ({ value, unit: 'lb' });
const pct = (value: number): ReportedValue => ({ value, unit: '%' });
const input = (values: BodyCompositionInput['values'], date = '2026-10-08'): BodyCompositionInput => ({
  date,
  source: MANUAL_INBODY_SOURCE,
  values,
});
const created = (i: BodyCompositionInput, id = 'bc1') => {
  const r = createBodyCompositionAssessment(i, { id, now: NOW, today: TODAY });
  if (!r.ok) {
    throw new Error(JSON.stringify(r.errors));
  }
  return r.value;
};
const assessment = (id: string, date: string, createdAt = `${date}T07:00:00.000Z`): BodyCompositionAssessment => ({
  id,
  date,
  source: MANUAL_INBODY_SOURCE,
  reported: { 'body-fat-percentage': pct(22.4) },
  createdAt,
  updatedAt: createdAt,
});

describe('body composition domain', () => {
  describe('units', () => {
    it('allows kg/lb for masses and % for percentages only', () => {
      expect(isUnitFor('weight', 'kg')).toBe(true);
      expect(isUnitFor('lean-body-mass', 'lb')).toBe(true);
      expect(isUnitFor('body-fat-mass', '%')).toBe(false);
      expect(isUnitFor('body-fat-percentage', '%')).toBe(true);
      expect(isUnitFor('body-fat-percentage', 'kg')).toBe(false);
    });
  });

  describe('validation', () => {
    it('accepts any non-empty subset of metrics, in either mass unit, today or earlier', () => {
      expect(validateBodyCompositionInput(input({ 'body-fat-percentage': pct(22.4) }), TODAY)).toEqual({});
      expect(
        validateBodyCompositionInput(
          input({ weight: kg(80.2), 'body-fat-mass': kg(18), 'lean-body-mass': kg(62.2), 'body-fat-percentage': pct(22.4) }, TODAY),
          TODAY,
        ),
      ).toEqual({});
      expect(validateBodyCompositionInput(input({ weight: lb(176.8), 'body-fat-mass': null }), TODAY)).toEqual({});
    });

    it.each<[string, BodyCompositionInput, Record<string, string>]>([
      ['no metrics at all', input({}), { values: 'required' }],
      ['only blank metrics', input({ weight: null }), { values: 'required' }],
      ['NaN', input({ weight: kg(Number.NaN) }), { weight: 'not-a-number' }],
      ['Infinity', input({ 'lean-body-mass': kg(Infinity) }), { 'lean-body-mass': 'not-a-number' }],
      ['a mass in %', input({ 'body-fat-mass': pct(18) }), { 'body-fat-mass': 'wrong-unit' }],
      ['a percentage in kg', input({ 'body-fat-percentage': kg(22) }), { 'body-fat-percentage': 'wrong-unit' }],
      ['an unknown unit', input({ weight: { value: 80, unit: 'st' } as unknown as ReportedValue }), { weight: 'wrong-unit' }],
      ['weight below the profile range', input({ weight: kg(19.9) }), { weight: 'out-of-range' }],
      ['weight above the profile range (lb)', input({ weight: lb(1103) }), { weight: 'out-of-range' }],
      ['zero fat mass', input({ 'body-fat-mass': kg(0) }), { 'body-fat-mass': 'out-of-range' }],
      ['negative lean mass', input({ 'lean-body-mass': kg(-1) }), { 'lean-body-mass': 'out-of-range' }],
      ['0 %', input({ 'body-fat-percentage': pct(0) }), { 'body-fat-percentage': 'out-of-range' }],
      ['100 %', input({ 'body-fat-percentage': pct(100) }), { 'body-fat-percentage': 'out-of-range' }],
      ['missing date', input({ weight: kg(80) }, ' '), { date: 'required' }],
      ['impossible date', input({ weight: kg(80) }, '2026-02-30'), { date: 'invalid-date' }],
      ['future date', input({ weight: kg(80) }, '2026-10-10'), { date: 'future-date' }],
    ])('rejects %s', (_, i, expected) => {
      expect(validateBodyCompositionInput(i, TODAY)).toEqual(expected);
    });

    it('accepts small component masses (no formula ties them to weight)', () => {
      expect(validateBodyCompositionInput(input({ weight: kg(80), 'body-fat-mass': kg(1.2), 'lean-body-mass': kg(30) }), TODAY)).toEqual({});
    });
  });

  describe('create and update', () => {
    it('keeps values exactly as reported: no conversion, rounding or derived metrics', () => {
      const a = created(input({ weight: lb(176.83), 'body-fat-percentage': pct(22.45) }));
      expect(a).toEqual({
        id: 'bc1',
        date: '2026-10-08',
        source: { device: 'inbody', entryMethod: 'manual' },
        reported: { weight: { value: 176.83, unit: 'lb' }, 'body-fat-percentage': { value: 22.45, unit: '%' } },
        createdAt: NOW,
        updatedAt: NOW,
      });
      expect(Object.keys(a.reported)).not.toContain('lean-body-mass');
      expect(Object.keys(a.reported)).not.toContain('body-fat-mass');
    });

    it('returns the errors instead of an assessment for invalid input', () => {
      expect(createBodyCompositionAssessment(input({}), { id: 'x', now: NOW, today: TODAY })).toEqual({
        ok: false,
        errors: { values: 'required' },
      });
    });

    it('updates keep the id and creation time and replace everything else', () => {
      const original = created(input({ weight: kg(80) }));
      const later = '2026-10-09T09:00:00.000Z';
      const result = updateBodyCompositionAssessment(original, input({ 'lean-body-mass': kg(61) }, '2026-10-07'), { now: later, today: TODAY });
      expect(result).toEqual({
        ok: true,
        value: { ...original, date: '2026-10-07', reported: { 'lean-body-mass': kg(61) }, updatedAt: later },
      });
    });
  });

  describe('parsing stored assessments', () => {
    const stored = () => JSON.parse(JSON.stringify(created(input({ weight: kg(80.2), 'body-fat-percentage': pct(22.4) }))));

    it('round-trips a created assessment', () => {
      expect(parseBodyCompositionAssessment(stored())).toEqual(created(input({ weight: kg(80.2), 'body-fat-percentage': pct(22.4) })));
    });

    it.each<[string, (v: Record<string, any>) => void]>([
      ['missing id', (v) => delete v['id']],
      ['bad date', (v) => (v['date'] = '2026-13-01')],
      ['unknown source device', (v) => (v['source'] = { device: 'other', entryMethod: 'manual' })],
      ['unknown entry method', (v) => (v['source'] = { device: 'inbody', entryMethod: 'ocr' })],
      ['unknown metric', (v) => (v['reported']['skeletal-muscle-mass'] = { value: 35, unit: 'kg' })],
      ['unknown unit', (v) => (v['reported']['weight'] = { value: 80, unit: 'st' })],
      ['unit of the wrong quantity', (v) => (v['reported']['weight'] = { value: 80, unit: '%' })],
      ['out-of-range value', (v) => (v['reported']['body-fat-percentage'] = { value: 120, unit: '%' })],
      ['non-numeric value', (v) => (v['reported']['weight'] = { value: '80', unit: 'kg' })],
      ['empty values', (v) => (v['reported'] = {})],
      ['bad createdAt', (v) => (v['createdAt'] = 'yesterday')],
    ])('rejects %s', (_, mutate) => {
      const v = stored();
      mutate(v);
      expect(parseBodyCompositionAssessment(v)).toBeNull();
    });

    it('rejects non-objects', () => {
      expect(parseBodyCompositionAssessment(null)).toBeNull();
      expect(parseBodyCompositionAssessment([])).toBeNull();
      expect(parseBodyCompositionAssessment('x')).toBeNull();
    });
  });

  describe('ordering', () => {
    it('orders by date, then creation time, then id', () => {
      const a = assessment('b', '2026-10-01');
      const b = assessment('a', '2026-10-02', '2026-10-02T06:00:00.000Z');
      const c = assessment('c', '2026-10-02', '2026-10-02T08:00:00.000Z');
      const d = assessment('d', '2026-10-02', '2026-10-02T08:00:00.000Z');
      expect(sortBodyCompositionAssessments([d, c, b, a]).map((x) => x.id)).toEqual(['b', 'a', 'c', 'd']);
      expect(compareBodyCompositionAssessments(a, a)).toBe(0);
    });
  });

  it('lists every metric once', () => {
    expect(new Set(BODY_COMPOSITION_METRICS).size).toBe(BODY_COMPOSITION_METRICS.length);
  });
});
