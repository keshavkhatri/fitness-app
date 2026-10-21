import {
  EXTRACTION_FIELDS,
  EXTRACTION_FIELD_IDS,
  EXTRACTION_GROUPS,
  INBODY_EXTRACTION_SCHEMA_VERSION,
  inBodyExtractionJsonSchema,
  parseInBodyExtraction,
} from './inbody-extraction-contract';
import { SAMPLE_INBODY380_EXTRACTION } from './testing/sample-inbody380-extraction';

type Json = Record<string, unknown>;
const sample = (): Json => structuredClone(SAMPLE_INBODY380_EXTRACTION) as unknown as Json;
const group = (value: Json, name: string) => value[name] as Json;
/** The sample with one field replaced. */
const withField = (name: string, id: string, field: unknown): Json => {
  const value = sample();
  group(value, name)[id] = field;
  return value;
};
const nothingRead = (outcome: string): Json => {
  const value = sample();
  value['outcome'] = outcome;
  for (const name of EXTRACTION_GROUPS) {
    for (const id of Object.keys(group(value, name))) {
      group(value, name)[id] = { status: 'not-on-report', text: null, unit: null, sourceLabel: null };
    }
  }
  return value;
};

describe('InBody extraction contract', () => {
  it('accepts the InBody380 sample, keeping every value exactly as printed', () => {
    const result = parseInBodyExtraction(sample());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(SAMPLE_INBODY380_EXTRACTION);
      expect(result.value.measurements['intracellular-water']).toEqual({
        status: 'read',
        text: '21.6',
        unit: 'L',
        sourceLabel: 'Intracellular Water',
      });
      expect(result.value.measurements['ecw-ratio'].text).toBe('0.378');
    }
  });

  it('accepts uncertain readings and labels whose value is unreadable', () => {
    expect(parseInBodyExtraction(withField('measurements', 'weight', { status: 'uncertain', text: '68.4', unit: 'kg', sourceLabel: 'Weight' })).ok).toBe(true);
    expect(parseInBodyExtraction(withField('profile', 'age', { status: 'unreadable', text: null, unit: null, sourceLabel: 'Age' })).ok).toBe(true);
  });

  it.each([
    ['not an object', [], [{ path: '', problem: 'not-an-object' }]],
    ['another schema version', { ...sample(), schemaVersion: 'inbody-extraction.v2' }, [{ path: 'schemaVersion', problem: 'unsupported-version' }]],
    ['an unknown outcome', { ...sample(), outcome: 'partial' }, [{ path: 'outcome', problem: 'invalid-value' }]],
    ['an unknown top-level key', { ...sample(), notes: 'looks fine' }, [{ path: '<unknown>', problem: 'unknown-key' }]],
    ['an unknown report issue', { ...sample(), reportIssues: ['blurry'] }, [{ path: 'reportIssues', problem: 'invalid-value' }]],
    ['a repeated report issue', { ...sample(), reportIssues: ['low-image-quality', 'low-image-quality'] }, [{ path: 'reportIssues', problem: 'invalid-value' }]],
  ])('rejects %s', (_, value, errors) => {
    expect(parseInBodyExtraction(value)).toEqual({ ok: false, errors });
  });

  it('rejects a missing or unknown field', () => {
    const value = sample();
    delete group(value, 'measurements')['weight'];
    group(value, 'measurements')['blood-pressure'] = { status: 'read', text: '120', unit: null, sourceLabel: 'Blood Pressure' };
    expect(parseInBodyExtraction(value)).toEqual({
      ok: false,
      errors: [
        { path: 'measurements.weight', problem: 'missing-key' },
        { path: 'measurements.<unknown>', problem: 'unknown-key' },
      ],
    });
  });

  describe('slips the sheet itself can mend', () => {
    it('gives a mass read without a unit the unit the rest of the sheet states', () => {
      const value = weight({ unit: null });
      const parsed = parseInBodyExtraction(value);
      expect(parsed.ok && parsed.value.measurements.weight).toMatchObject({ status: 'read', text: '68.4', unit: 'kg' });
    });

    it('gives a value with only one possible unit that unit', () => {
      const value = withField('measurements', 'percent-body-fat', { status: 'read', text: '30.8', unit: null, sourceLabel: 'PBF' });
      const parsed = parseInBodyExtraction(value);
      expect(parsed.ok && parsed.value.measurements['percent-body-fat'].unit).toBe('%');
    });

    it('does not guess a mass unit when the sheet states none (or two)', () => {
      const unitless = sample() as Json;
      for (const field of Object.values(group(unitless, 'measurements')) as Record<string, unknown>[]) {
        if (field['unit'] === 'kg') {
          field['unit'] = null;
        }
      }
      expect(parseInBodyExtraction(unitless).ok).toBe(false);
      const mixed = sample() as Json;
      group(mixed, 'measurements')['protein'] = { status: 'read', text: '20.7', unit: 'lb', sourceLabel: 'Protein' };
      group(mixed, 'measurements')['minerals'] = { status: 'read', text: '3.0', unit: null, sourceLabel: 'Minerals' };
      expect(parseInBodyExtraction(mixed).ok).toBe(false);
    });

    it('drops a unit or a label from a field that has no value', () => {
      const unreadable = parseInBodyExtraction(weight({ status: 'unreadable', text: null }));
      expect(unreadable.ok && unreadable.value.measurements.weight).toEqual({ status: 'unreadable', text: null, unit: null, sourceLabel: 'Weight' });
      const absent = parseInBodyExtraction(weight({ status: 'not-on-report', text: null, unit: 'kg', sourceLabel: 'Weight' }));
      expect(absent.ok && absent.value.measurements.weight).toEqual({ status: 'not-on-report', text: null, unit: null, sourceLabel: null });
    });

    it('never invents a value: a missing value with text is still rejected', () => {
      expect(parseInBodyExtraction(weight({ status: 'not-on-report', unit: null, sourceLabel: null })).ok).toBe(false);
    });
  });

  it('never echoes a model-written key: it could quote the report', () => {
    const value = sample();
    value['Name: Jane Example, DOB 1990-01-01'] = 'x';
    group(value, 'measurements')['weight 81.2 kg'] = { status: 'read', text: '81.2', unit: 'kg', sourceLabel: 'Weight' };
    const result = parseInBodyExtraction(value);
    expect(result).toEqual({
      ok: false,
      errors: [
        { path: '<unknown>', problem: 'unknown-key' },
        { path: 'measurements.<unknown>', problem: 'unknown-key' },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/Jane|1990|81\.2/);
  });

  const weight = (field: Json) => withField('measurements', 'weight', { status: 'read', text: '68.4', unit: 'kg', sourceLabel: 'Weight', ...field });
  it.each<[string, Json, string]>([
    ['a unit inside the number', weight({ text: '68.4 kg' }), 'measurements.weight.text'],
    ['a decimal comma', weight({ text: '94,5' }), 'measurements.weight.text'],
    ['a negative number', weight({ text: '-68.4' }), 'measurements.weight.text'],
    ['a number as a JSON number', weight({ text: 68.4 }), 'measurements.weight.text'],
    ['an unknown unit', weight({ unit: 'kgs' }), 'measurements.weight.unit'],
    ['an unknown status', weight({ status: 'guessed' }), 'measurements.weight.status'],
    ['an empty label', weight({ sourceLabel: ' ' }), 'measurements.weight.sourceLabel'],
    ['a unit on a unitless value', withField('measurements', 'ecw-ratio', { status: 'read', text: '0.378', unit: '%', sourceLabel: 'ECW Ratio' }), 'measurements.ecw-ratio.unit'],
    ['prose instead of a transcription', withField('profile', 'gender', { status: 'read', text: 'The report appears to say the person is male', unit: null, sourceLabel: 'Gender' }), 'profile.gender.text'],
  ])('rejects %s as an invalid value', (_, value, path) => {
    expect(parseInBodyExtraction(value)).toEqual({ ok: false, errors: [{ path, problem: 'invalid-value' }] });
  });

  it.each<[string, Json]>([
    ['a read value without text', weight({ text: null })],
    ['a missing value with text', weight({ status: 'not-on-report', unit: null, sourceLabel: null })],
  ])('rejects %s as inconsistent', (_, value) => {
    expect(parseInBodyExtraction(value)).toEqual({ ok: false, errors: [{ path: 'measurements.weight', problem: 'inconsistent' }] });
  });

  it('requires values for an extracted report, and none for a rejected one', () => {
    expect(parseInBodyExtraction(nothingRead('extracted'))).toEqual({ ok: false, errors: [{ path: 'outcome', problem: 'inconsistent' }] });
    expect(parseInBodyExtraction({ ...sample(), outcome: 'unsupported-report' })).toEqual({
      ok: false,
      errors: [{ path: 'outcome', problem: 'inconsistent' }],
    });
    expect(parseInBodyExtraction(nothingRead('unsupported-report')).ok).toBe(true);
    expect(parseInBodyExtraction(nothingRead('insufficient-readable-information')).ok).toBe(true);
  });

  it('never repeats extracted values in its errors', () => {
    const result = parseInBodyExtraction(withField('profile', 'height', { status: 'read', text: '172 cm', unit: 'feet', sourceLabel: 'Height' }));
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/172|feet/);
  });

  describe('JSON schema for the model', () => {
    const schema = inBodyExtractionJsonSchema() as Json;

    /** OpenAI Structured Outputs (strict): every object closed and every property required, no unsupported composition. */
    const strictProblems = (node: unknown, path = '$'): string[] => {
      if (Array.isArray(node)) {
        return node.flatMap((item, index) => strictProblems(item, `${path}[${index}]`));
      }
      if (typeof node !== 'object' || node === null) {
        return [];
      }
      const record = node as Json;
      const problems = ['allOf', 'not', 'if', 'then', 'else', 'oneOf'].filter((key) => key in record).map((key) => `${path}: ${key}`);
      if (record['type'] === 'object') {
        const keys = Object.keys(record['properties'] as Json);
        if (record['additionalProperties'] !== false) {
          problems.push(`${path}: open object`);
        }
        if (JSON.stringify(record['required']) !== JSON.stringify(keys)) {
          problems.push(`${path}: not every property required`);
        }
      }
      return [...problems, ...Object.entries(record).flatMap(([key, value]) => strictProblems(value, `${path}.${key}`))];
    };

    it('stays within the strict Structured Outputs subset, with an object root', () => {
      expect(schema['type']).toBe('object');
      expect(strictProblems(schema)).toEqual([]);
    });

    it('lists exactly the validated fields, in their groups, with the current version', () => {
      const properties = schema['properties'] as Json;
      expect(properties['schemaVersion']).toEqual({ type: 'string', enum: [INBODY_EXTRACTION_SCHEMA_VERSION] });
      for (const name of EXTRACTION_GROUPS) {
        const fields = Object.keys((properties[name] as Json)['properties'] as Json);
        expect(fields).toEqual(EXTRACTION_FIELD_IDS.filter((id) => EXTRACTION_FIELDS[id].group === name));
      }
    });

    it('asks for numbers as printed text and allows only the units the report prints', () => {
      const weight = ((((schema['properties'] as Json)['measurements'] as Json)['properties'] as Json)['weight'] as Json)['properties'] as Json;
      expect(weight['text']).toMatchObject({ type: ['string', 'null'], pattern: '^\\d+(\\.\\d+)?$' });
      expect(weight['unit']).toEqual({ type: ['string', 'null'], enum: ['kg', 'lb', null] });
      const age = ((((schema['properties'] as Json)['profile'] as Json)['properties'] as Json)['age'] as Json)['properties'] as Json;
      expect(age['unit']).toEqual({ type: 'null' });
    });
  });
});
