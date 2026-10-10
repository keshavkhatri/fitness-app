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
        text: '29.0',
        unit: 'L',
        sourceLabel: 'Intracellular Water',
      });
      expect(result.value.measurements['ecw-ratio'].text).toBe('0.372');
    }
  });

  it('accepts uncertain readings and labels whose value is unreadable', () => {
    expect(parseInBodyExtraction(withField('measurements', 'weight', { status: 'uncertain', text: '94.5', unit: 'kg', sourceLabel: 'Weight' })).ok).toBe(true);
    expect(parseInBodyExtraction(withField('profile', 'age', { status: 'unreadable', text: null, unit: null, sourceLabel: 'Age' })).ok).toBe(true);
  });

  it.each([
    ['not an object', [], [{ path: '', problem: 'not-an-object' }]],
    ['another schema version', { ...sample(), schemaVersion: 'inbody-extraction.v2' }, [{ path: 'schemaVersion', problem: 'unsupported-version' }]],
    ['an unknown outcome', { ...sample(), outcome: 'partial' }, [{ path: 'outcome', problem: 'invalid-value' }]],
    ['an unknown top-level key', { ...sample(), notes: 'looks fine' }, [{ path: 'notes', problem: 'unknown-key' }]],
    ['an unknown report issue', { ...sample(), reportIssues: ['blurry'] }, [{ path: 'reportIssues', problem: 'invalid-value' }]],
    ['a repeated report issue', { ...sample(), reportIssues: ['low-image-quality', 'low-image-quality'] }, [{ path: 'reportIssues', problem: 'invalid-value' }]],
  ])('rejects %s', (_, value, errors) => {
    expect(parseInBodyExtraction(value)).toEqual({ ok: false, errors });
  });

  it('rejects a missing or unknown field', () => {
    const value = sample();
    delete group(value, 'measurements')['weight'];
    group(value, 'measurements')['inbody-score'] = { status: 'read', text: '62', unit: null, sourceLabel: 'InBody Score' };
    expect(parseInBodyExtraction(value)).toEqual({
      ok: false,
      errors: [
        { path: 'measurements.weight', problem: 'missing-key' },
        { path: 'measurements.inbody-score', problem: 'unknown-key' },
      ],
    });
  });

  const weight = (field: Json) => withField('measurements', 'weight', { status: 'read', text: '94.5', unit: 'kg', sourceLabel: 'Weight', ...field });
  it.each<[string, Json, string]>([
    ['a unit inside the number', weight({ text: '94.5 kg' }), 'measurements.weight.text'],
    ['a decimal comma', weight({ text: '94,5' }), 'measurements.weight.text'],
    ['a negative number', weight({ text: '-94.5' }), 'measurements.weight.text'],
    ['a number as a JSON number', weight({ text: 94.5 }), 'measurements.weight.text'],
    ['an unknown unit', weight({ unit: 'kgs' }), 'measurements.weight.unit'],
    ['an unknown status', weight({ status: 'guessed' }), 'measurements.weight.status'],
    ['an empty label', weight({ sourceLabel: ' ' }), 'measurements.weight.sourceLabel'],
    ['a unit on a unitless value', withField('measurements', 'ecw-ratio', { status: 'read', text: '0.372', unit: '%', sourceLabel: 'ECW Ratio' }), 'measurements.ecw-ratio.unit'],
    ['prose instead of a transcription', withField('profile', 'gender', { status: 'read', text: 'The report appears to say the person is male', unit: null, sourceLabel: 'Gender' }), 'profile.gender.text'],
  ])('rejects %s as an invalid value', (_, value, path) => {
    expect(parseInBodyExtraction(value)).toEqual({ ok: false, errors: [{ path, problem: 'invalid-value' }] });
  });

  it.each<[string, Json]>([
    ['a read value without its unit', weight({ unit: null })],
    ['a read value without text', weight({ text: null })],
    ['a missing value with text', weight({ status: 'not-on-report', unit: null, sourceLabel: null })],
    ['an unreadable value with a unit', weight({ status: 'unreadable', text: null })],
    ['a label for a field not on the report', weight({ status: 'not-on-report', text: null, unit: null })],
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
    const result = parseInBodyExtraction(withField('profile', 'height', { status: 'read', text: '180 cm', unit: 'feet', sourceLabel: 'Height' }));
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/180|feet/);
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
