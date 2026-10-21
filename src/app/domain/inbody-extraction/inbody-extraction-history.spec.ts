import { ExtractedField, INBODY_EXTRACTION_SCHEMA_NAME, InBodyExtraction, inBodyExtractionJsonSchema, parseInBodyExtraction } from './inbody-extraction-contract';
import { inBodyPrefill } from './inbody-extraction-mapping';
import { INBODY_EXTRACTION_INSTRUCTIONS } from './inbody-extraction-request';
import { SAMPLE_INBODY380_EXTRACTION } from './testing/sample-inbody380-extraction';

const TODAY = '2026-10-10';
type Raw = Record<string, unknown> & { history?: unknown[] };

const read = (text: string, unit: string | null = null): ExtractedField => ({ status: 'read', text, unit, sourceLabel: 'label' });
const uncertain = (text: string, unit: string | null = null): ExtractedField => ({ status: 'uncertain', text, unit, sourceLabel: 'label' });
const NONE: ExtractedField = { status: 'not-on-report', text: null, unit: null, sourceLabel: null };
const point = (date: ExtractedField, weight: ExtractedField = NONE, smm: ExtractedField = NONE, pbf: ExtractedField = NONE) => ({
  'test-date-time': date,
  weight,
  'skeletal-muscle-mass': smm,
  'percent-body-fat': pbf,
});

const withHistory = (history: unknown[] | undefined): Raw => {
  const raw = structuredClone(SAMPLE_INBODY380_EXTRACTION) as unknown as Raw;
  if (history === undefined) {
    delete raw.history;
  } else {
    raw.history = history;
  }
  return raw;
};
const parsed = (raw: Raw): InBodyExtraction => {
  const result = parseInBodyExtraction(raw);
  if (!result.ok) {
    throw new Error(JSON.stringify(result.errors));
  }
  return result.value;
};
const suggestions = (history: unknown[], today = TODAY) => {
  const prefill = inBodyPrefill(parsed(withHistory(history)), today);
  if (prefill.kind !== 'prefill') {
    throw new Error('expected a prefill');
  }
  return prefill.history;
};

describe('InBody report history (the chart at the bottom of the sheet)', () => {
  describe('contract', () => {
    it('reads the history points as printed, oldest first', () => {
      const extraction = parsed(withHistory(structuredClone(SAMPLE_INBODY380_EXTRACTION.history) as unknown as unknown[]));
      expect(extraction.history).toHaveLength(4);
      expect(extraction.history[0]['test-date-time'].text).toBe('2026.03.14');
      expect(extraction.history[0].weight).toMatchObject({ text: '71.9', unit: 'kg' });
    });

    it('still reads an answer without history (a server that predates it)', () => {
      expect(parsed(withHistory(undefined)).history).toEqual([]);
    });

    it('rejects a malformed point, a point with an unknown key, or too many points', () => {
      expect(parseInBodyExtraction(withHistory([{ weight: read('70', 'kg') }])).ok).toBe(false);
      expect(parseInBodyExtraction(withHistory([{ ...point(read('2026.03.14')), extra: NONE }])).ok).toBe(false);
      expect(parseInBodyExtraction(withHistory([point(read('2026.03.14'), read('70', 'lbs'))])).ok).toBe(false);
      expect(parseInBodyExtraction(withHistory(Array.from({ length: 13 }, () => point(read('2026.03.14'))))).ok).toBe(false);
      expect(parseInBodyExtraction(withHistory('x' as unknown as unknown[])).ok).toBe(false);
    });

    it('never counts history as the report’s own values', () => {
      const raw = withHistory([point(read('2026.03.14'), read('70', 'kg'))]);
      raw['outcome'] = 'extracted';
      for (const group of ['metadata', 'profile', 'measurements'] as const) {
        for (const key of Object.keys(raw[group] as object)) {
          (raw[group] as Record<string, ExtractedField>)[key] = NONE;
        }
      }
      // History alone is not an extraction: the model must have read at least one current value.
      expect(parseInBodyExtraction(raw)).toMatchObject({ ok: false });
    });

    it('asks the model for it, requiring the property in the strict schema', () => {
      const schema = inBodyExtractionJsonSchema() as { required: string[]; properties: Record<string, { type: string; maxItems: number; items: { required: string[] } }> };
      expect(INBODY_EXTRACTION_SCHEMA_NAME).toBe('inbody_extraction_v1');
      expect(schema.required).toContain('history');
      expect(schema.properties['history'].type).toBe('array');
      expect(schema.properties['history'].maxItems).toBe(12);
      expect(schema.properties['history'].items.required).toEqual([
        'test-date-time',
        'weight',
        'skeletal-muscle-mass',
        'body-fat-mass',
        'percent-body-fat',
        'ecw-ratio',
        'phase-angle',
        'smi',
      ]);
      expect(INBODY_EXTRACTION_INSTRUCTIONS).toContain('history chart');
    });
  });

  describe('mapping', () => {
    it('suggests the earlier tests, oldest first, leaving out the current test (it is the main assessment)', () => {
      const list = suggestions(structuredClone(SAMPLE_INBODY380_EXTRACTION.history) as unknown as unknown[]);
      expect(list.map((s) => s.date)).toEqual(['2026-03-14', '2026-05-09', '2026-07-18']);
      expect(list[0]).toEqual({
        date: '2026-03-14',
        values: { weight: { value: 71.9, unit: 'kg' }, 'skeletal-muscle-mass': { value: 25.4, unit: 'kg' }, 'body-fat-percentage': { value: 33.6, unit: '%' } },
        needsReview: false,
      });
    });

    it('has none when the sheet printed no history', () => {
      expect(suggestions([])).toEqual([]);
    });

    it('reads a two-digit year only when the current test’s date is year first', () => {
      const two = suggestions([point(read('26.03.14'), read('71.9', 'kg')), point(read('’26.05.09'), read('70.6', 'kg')), point(read("'26.07.18"), read('69.3', 'kg'))]);
      expect(two.map((s) => s.date)).toEqual(['2026-03-14', '2026-05-09', '2026-07-18']);
    });

    it('never guesses a day-first, month-first or year-less label', () => {
      expect(suggestions([point(read('14.03.2026'), read('71', 'kg')), point(read('03.14'), read('71', 'kg')), point(read('14/03/2026'), read('71', 'kg'))])).toEqual([]);
    });

    it('drops a point with no usable date, no usable value, a future date or a repeated date', () => {
      const list = suggestions([
        point(NONE, read('70', 'kg')),
        point(read('2026.03.14')),
        point(read('2026.03.15'), read('9999', 'kg')),
        point(read('2026.12.01'), read('70', 'kg')),
        point(read('2026.02.01'), read('71.0', 'kg')),
        point(read('2026.02.01'), read('99.0', 'kg')),
      ]);
      expect(list).toEqual([{ date: '2026-02-01', values: { weight: { value: 71, unit: 'kg' } }, needsReview: false }]);
    });

    it('keeps the values it can use, and flags an uncertain reading for a closer look', () => {
      const [only] = suggestions([point(read('2026.03.14'), read('71.9', 'kg'), uncertain('25.4', 'kg'))]);
      expect(only.values).toEqual({ weight: { value: 71.9, unit: 'kg' }, 'skeletal-muscle-mass': { value: 25.4, unit: 'kg' } });
      expect(only.needsReview).toBe(true);
    });

    it('does not offer a point on or after the current test’s date', () => {
      const list = suggestions([point(read('2026.09.14'), read('68.4', 'kg')), point(read('2026.09.20'), read('68', 'kg'))]);
      expect(list).toEqual([]);
    });
  });
});
