import { ImportProvenance, createBodyCompositionAssessment, parseBodyCompositionAssessment } from './body-composition-assessment';
import {
  ParsedReport,
  ReportReadResult,
  bodyCompositionInputFromReport,
  reportImportOutcome,
  unmappedFields,
} from './body-composition-import';

const TODAY = '2026-10-09';
const PROVENANCE: ImportProvenance = {
  device: 'inbody',
  entryMethod: 'import',
  format: 'test-format',
  parser: { name: 'test-parser', version: '0.0.1' },
};
const report = (normalized: Partial<ParsedReport['normalized']> = {}): ParsedReport => ({
  provenance: PROVENANCE,
  fields: [
    { label: 'Test Date', text: '08.10.2026' },
    { label: 'Weight', text: '80.2 kg' },
    { label: 'Percent Body Fat', text: '22.4 %' },
    { label: 'Visceral Fat Level', text: '7' },
  ],
  normalized: {
    date: { value: '2026-10-08', field: 0 },
    values: { weight: { value: 80.2, unit: 'kg', field: 1 }, 'body-fat-percentage': { value: 22.4, unit: '%', field: 2 } },
    ...normalized,
  },
});
const read = (r: ParsedReport): ReportReadResult => ({ kind: 'read', report: r });

describe('body composition import contract', () => {
  it('passes parser failures through unchanged', () => {
    const unsupported: ReportReadResult = { kind: 'unsupported-format', mediaType: 'image/png' };
    const unreadable: ReportReadResult = { kind: 'unreadable', reason: 'corrupt file' };
    expect(reportImportOutcome(unsupported, TODAY)).toBe(unsupported);
    expect(reportImportOutcome(unreadable, TODAY)).toBe(unreadable);
  });

  it('accepts a valid report, keeping provenance, reported fields and normalized values apart', () => {
    const r = report();
    const outcome = reportImportOutcome(read(r), TODAY);
    expect(outcome).toEqual({ kind: 'parsed', report: r });
    if (outcome.kind === 'parsed') {
      expect(outcome.report.provenance).toEqual(PROVENANCE);
      expect(outcome.report.fields[1]).toEqual({ label: 'Weight', text: '80.2 kg' });
      expect(outcome.report.normalized.values.weight).toEqual({ value: 80.2, unit: 'kg', field: 1 });
    }
  });

  it.each<[string, Partial<ParsedReport['normalized']>, Record<string, string>]>([
    ['no normalized metrics', { values: {} }, { values: 'required' }],
    ['no date on the report', { date: null }, { date: 'required' }],
    ['a future date', { date: { value: '2026-10-10', field: 0 } }, { date: 'future-date' }],
    ['an implausible value', { values: { 'body-fat-percentage': { value: 100, unit: '%', field: 2 } } }, { 'body-fat-percentage': 'out-of-range' }],
    ['a wrong unit', { values: { weight: { value: 80.2, unit: '%', field: 1 } } }, { weight: 'wrong-unit' }],
    ['a value from a missing field', { values: { weight: { value: 80.2, unit: 'kg', field: 9 } } }, { weight: 'unknown-field' }],
    ['a date from a missing field', { date: { value: '2026-10-08', field: -1 } }, { date: 'unknown-field' }],
  ])('rejects %s as invalid report data, keeping the whole report', (_, normalized, errors) => {
    const r = report(normalized);
    expect(reportImportOutcome(read(r), TODAY)).toEqual({ kind: 'invalid-report', report: r, errors });
  });

  it('lists reported fields that were not normalized, so none is silently dropped', () => {
    expect(unmappedFields(report())).toEqual([{ label: 'Visceral Fat Level', text: '7' }]);
    expect(unmappedFields(report({ date: null, values: {} }))).toHaveLength(4);
  });

  describe('assessment from a report', () => {
    it('keeps the normalized values as stated and the provenance as source, without field references', () => {
      expect(bodyCompositionInputFromReport(report())).toEqual({
        date: '2026-10-08',
        source: PROVENANCE,
        values: { weight: { value: 80.2, unit: 'kg' }, 'body-fat-percentage': { value: 22.4, unit: '%' } },
      });
    });

    it('leaves a missing date for assessment validation to reject', () => {
      const created = createBodyCompositionAssessment(bodyCompositionInputFromReport(report({ date: null })), {
        id: 'bc1',
        now: '2026-10-09T07:30:00.000Z',
        today: TODAY,
      });
      expect(created).toEqual({ ok: false, errors: { date: 'required' } });
    });

    it('stores and reads back an imported assessment with its provenance', () => {
      const created = createBodyCompositionAssessment(bodyCompositionInputFromReport(report()), {
        id: 'bc1',
        now: '2026-10-09T07:30:00.000Z',
        today: TODAY,
      });
      expect(created.ok).toBe(true);
      if (created.ok) {
        expect(created.value.source).toEqual(PROVENANCE);
        expect(parseBodyCompositionAssessment(JSON.parse(JSON.stringify(created.value)))).toEqual(created.value);
      }
    });
  });
});
