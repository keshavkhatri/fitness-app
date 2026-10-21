import { createBodyCompositionAssessment } from '../body-composition';
import { ExtractedField, InBodyExtraction, parseInBodyExtraction } from './inbody-extraction-contract';
import { inBodyPrefill } from './inbody-extraction-mapping';
import { SAMPLE_INBODY380_EXTRACTION } from './testing/sample-inbody380-extraction';

/**
 * Everything else an InBody380 sheet prints beyond the first catalogue: the segmental lean analysis (kg and %), the
 * InBody score, the weight control block, and history charts for body fat mass, ECW ratio, phase angle and SMI.
 * All values here are fictional.
 */

const TODAY = '2026-10-22';
const read = (text: string, unit: string | null): ExtractedField => ({ status: 'read', text, unit, sourceLabel: 'label' });
const NONE: ExtractedField = { status: 'not-on-report', text: null, unit: null, sourceLabel: null };

type Raw = Record<string, Record<string, unknown>> & { history: Record<string, unknown>[] };

function fullSheet(): Raw {
  const raw = structuredClone(SAMPLE_INBODY380_EXTRACTION) as unknown as Raw;
  Object.assign(raw['measurements'], {
    'inbody-score': read('71', null),
    'target-weight': read('66.0', 'kg'),
    'weight-control': read('-2.4', 'kg'),
    'fat-control': read('-2.4', 'kg'),
    'muscle-control': read('0.0', 'kg'),
    'segmental-lean-right-arm': read('2.65', 'kg'),
    'segmental-lean-left-arm': read('2.61', 'kg'),
    'segmental-lean-trunk': read('21.8', 'kg'),
    'segmental-lean-right-leg': read('7.45', 'kg'),
    'segmental-lean-left-leg': read('7.38', 'kg'),
    'segmental-lean-right-arm-percentage': read('98.2', '%'),
    'segmental-lean-left-arm-percentage': read('96.7', '%'),
    'segmental-lean-trunk-percentage': read('101.4', '%'),
    'segmental-lean-right-leg-percentage': read('99.0', '%'),
    'segmental-lean-left-leg-percentage': read('98.1', '%'),
  });
  raw.history = [
    {
      'test-date-time': read('26.06.02. 08:02', null),
      weight: read('70.2', 'kg'),
      'skeletal-muscle-mass': read('25.1', 'kg'),
      'body-fat-mass': read('23.0', 'kg'),
      'percent-body-fat': read('32.8', '%'),
      'ecw-ratio': read('0.381', null),
      'phase-angle': NONE,
      smi: NONE,
    },
    {
      'test-date-time': read('26.07.01. 07:59', null),
      weight: read('69.1', 'kg'),
      'skeletal-muscle-mass': read('25.8', 'kg'),
      'body-fat-mass': read('21.9', 'kg'),
      'percent-body-fat': read('31.7', '%'),
      'ecw-ratio': read('0.379', null),
      'phase-angle': read('5.4', '°'),
      smi: read('7.0', 'kg/m²'),
    },
  ];
  return raw;
}
const parse = (raw: unknown): InBodyExtraction => {
  const result = parseInBodyExtraction(raw);
  if (!result.ok) {
    throw new Error(JSON.stringify(result.errors));
  }
  return result.value;
};
const prefill = (raw: Raw) => {
  const result = inBodyPrefill(parse(raw), TODAY);
  if (result.kind !== 'prefill') {
    throw new Error('expected a prefill');
  }
  return result;
};
const valueOf = (p: ReturnType<typeof prefill>, metric: string) => {
  const entry = (p.assessment.values as Record<string, { kind: string; value?: unknown }>)[metric];
  return entry.kind === 'prefilled' ? entry.value : null;
};

describe('InBody sheet: everything it prints', () => {
  it('reads the segmental lean analysis, the score and the weight control block as printed', () => {
    const p = prefill(fullSheet());
    expect(valueOf(p, 'inbody-score')).toEqual({ value: 71, unit: 'none' });
    expect(valueOf(p, 'target-weight')).toEqual({ value: 66, unit: 'kg' });
    expect(valueOf(p, 'segmental-lean-trunk')).toEqual({ value: 21.8, unit: 'kg' });
    expect(valueOf(p, 'segmental-lean-right-arm-percentage')).toEqual({ value: 98.2, unit: '%' });
    expect(valueOf(p, 'segmental-lean-left-leg')).toEqual({ value: 7.38, unit: 'kg' });
  });

  it('keeps the sign of the controls, and accepts zero', () => {
    const p = prefill(fullSheet());
    expect(valueOf(p, 'weight-control')).toEqual({ value: -2.4, unit: 'kg' });
    expect(valueOf(p, 'fat-control')).toEqual({ value: -2.4, unit: 'kg' });
    expect(valueOf(p, 'muscle-control')).toEqual({ value: 0, unit: 'kg' });
  });

  it('reads a positive control too (gain muscle), and never reads a minus out of nowhere', () => {
    const raw = fullSheet();
    raw['measurements']['muscle-control'] = read('1.2', 'kg');
    expect(valueOf(prefill(raw), 'muscle-control')).toEqual({ value: 1.2, unit: 'kg' });
  });

  it('suggests values the assessment accepts, signs and all', () => {
    const p = prefill(fullSheet());
    const values = Object.fromEntries(Object.entries(p.assessment.values).flatMap(([k, v]) => (v.kind === 'prefilled' ? [[k, v.value]] : [])));
    const created = createBodyCompositionAssessment(
      { date: '2026-10-01', source: { device: 'inbody', entryMethod: 'manual' }, values },
      { id: 'a', now: '2026-10-22T08:00:00.000Z', today: TODAY },
    );
    expect(created.ok).toBe(true);
  });

  it('does not accept an impossible score, control or segmental percentage', () => {
    const base = { date: '2026-10-01', source: { device: 'inbody', entryMethod: 'manual' } as const };
    const ctx = { id: 'a', now: '2026-10-22T08:00:00.000Z', today: TODAY };
    for (const values of [
      { 'inbody-score': { value: 150, unit: 'none' } },
      { 'weight-control': { value: -900, unit: 'kg' } },
      { 'segmental-lean-trunk-percentage': { value: 900, unit: '%' } },
      { 'target-weight': { value: 5, unit: 'kg' } },
      { 'fat-control': { value: -2, unit: '%' } },
    ] as const) {
      expect(createBodyCompositionAssessment({ ...base, values }, ctx).ok).toBe(false);
    }
  });

  it('suggests the earlier tests with every series the history charts print', () => {
    const p = prefill(fullSheet());
    expect(p.history).toEqual([
      {
        date: '2026-06-02',
        values: {
          weight: { value: 70.2, unit: 'kg' },
          'skeletal-muscle-mass': { value: 25.1, unit: 'kg' },
          'body-fat-mass': { value: 23, unit: 'kg' },
          'body-fat-percentage': { value: 32.8, unit: '%' },
          'ecw-ratio': { value: 0.381, unit: 'none' },
        },
        needsReview: false,
      },
      {
        date: '2026-07-01',
        values: {
          weight: { value: 69.1, unit: 'kg' },
          'skeletal-muscle-mass': { value: 25.8, unit: 'kg' },
          'body-fat-mass': { value: 21.9, unit: 'kg' },
          'body-fat-percentage': { value: 31.7, unit: '%' },
          'ecw-ratio': { value: 0.379, unit: 'none' },
          'phase-angle': { value: 5.4, unit: '°' },
          smi: { value: 7, unit: 'kg/m²' },
        },
        needsReview: false,
      },
    ]);
  });

  describe('answers from before these fields existed', () => {
    it('still read: the missing keys are "not on the report"', () => {
      const old = structuredClone(SAMPLE_INBODY380_EXTRACTION) as unknown as Raw;
      for (const key of Object.keys(old['measurements']).filter((k) => k.startsWith('segmental') || ['inbody-score', 'target-weight', 'weight-control', 'fat-control', 'muscle-control'].includes(k))) {
        delete old['measurements'][key];
      }
      old.history = old.history.map((point) => {
        const { 'body-fat-mass': _a, 'ecw-ratio': _b, 'phase-angle': _c, smi: _d, ...rest } = point;
        return rest;
      });
      const extraction = parse(old);
      expect(extraction.measurements['inbody-score']).toEqual(NONE);
      expect(extraction.history[0]['smi']).toEqual(NONE);
      expect(extraction.history[0].weight.text).toBe('71.9');
    });
  });

  describe('a bad entry in one of the added fields', () => {
    it('drops only that value instead of discarding the report', () => {
      const raw = fullSheet();
      raw['measurements']['inbody-score'] = { status: 'not-on-report', text: null, unit: 'kg', sourceLabel: 'InBody Score' }; // inconsistent
      raw.history[0]['smi'] = { status: 'read', text: 'not a number', unit: 'kg/m²', sourceLabel: 'SMI' };
      raw.history[0]['phase-angle'] = { status: 'not-on-report', text: null, unit: '°', sourceLabel: 'Phase angle' }; // as the model really answers
      const extraction = parse(raw);
      expect(extraction.measurements['inbody-score']).toEqual(NONE);
      expect(extraction.history[0]['smi']).toEqual(NONE);
      expect(extraction.history[0]['phase-angle']).toEqual(NONE);
      expect(extraction.history[0].weight.text).toBe('70.2');
      expect(extraction.measurements['target-weight'].text).toBe('66.0');
    });

    it('while the original fields stay strict', () => {
      const raw = fullSheet();
      raw['measurements']['ecw-ratio'] = { status: 'read', text: '0.378', unit: '%', sourceLabel: 'ECW Ratio' };
      expect(parseInBodyExtraction(raw).ok).toBe(false);
    });

    it('and a minus is only allowed where a value can be negative', () => {
      const raw = fullSheet();
      raw['measurements']['weight'] = read('-68.4', 'kg');
      expect(parseInBodyExtraction(raw).ok).toBe(false);
    });
  });
});
