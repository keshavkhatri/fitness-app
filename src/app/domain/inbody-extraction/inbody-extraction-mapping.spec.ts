import { MANUAL_INBODY_SOURCE, createBodyCompositionAssessment } from '../body-composition';
import { ExtractedField, InBodyExtraction, parseInBodyExtraction } from './inbody-extraction-contract';
import { InBodyPrefill, MANUAL_PROFILE_ANSWERS, inBodyPrefill } from './inbody-extraction-mapping';
import { SAMPLE_INBODY380_EXTRACTION } from './testing/sample-inbody380-extraction';

const TODAY = '2026-10-10';
type Changes = Partial<Record<'metadata' | 'profile' | 'measurements', Record<string, ExtractedField>>>;

/** The validated sample, with some fields replaced (the change must itself be valid). */
function extraction(changes: Changes = {}, outcome?: string): InBodyExtraction {
  const raw = structuredClone(SAMPLE_INBODY380_EXTRACTION) as unknown as Record<string, Record<string, unknown>>;
  for (const [name, fields] of Object.entries(changes)) {
    Object.assign(raw[name], fields);
  }
  const parsed = parseInBodyExtraction(outcome ? { ...raw, outcome } : raw);
  if (!parsed.ok) {
    throw new Error(`invalid test extraction: ${JSON.stringify(parsed.errors)}`);
  }
  return parsed.value;
}
const prefillOf = (value: InBodyExtraction, today = TODAY): InBodyPrefill => {
  const result = inBodyPrefill(value, today);
  if (result.kind !== 'prefill') {
    throw new Error('expected a prefill');
  }
  return result;
};
const read = (text: string, unit: string | null = null): ExtractedField => ({ status: 'read', text, unit, sourceLabel: 'label' });
const NOT_ON_REPORT: ExtractedField = { status: 'not-on-report', text: null, unit: null, sourceLabel: null };

describe('InBody extraction mapping', () => {
  it('suggests the profile details and assessment values the InBody380 sample states', () => {
    expect(prefillOf(extraction())).toEqual({
      kind: 'prefill',
      reportIssues: [],
      unverifiedReportModel: false,
      profile: {
        sex: { kind: 'prefilled', value: 'male', field: 'gender', needsReview: false },
        height: { kind: 'prefilled', value: { centimeters: 180 }, field: 'height', needsReview: false },
        weight: { kind: 'prefilled', value: { kilograms: 94.5 }, field: 'weight', needsReview: false },
      },
      assessment: {
        date: { kind: 'prefilled', value: '2026-10-01', field: 'test-date-time', needsReview: false },
        values: {
          weight: { kind: 'prefilled', value: { value: 94.5, unit: 'kg' }, field: 'weight', needsReview: false },
          'body-fat-mass': { kind: 'prefilled', value: { value: 31.6, unit: 'kg' }, field: 'body-fat-mass', needsReview: false },
          'body-fat-percentage': { kind: 'prefilled', value: { value: 33.4, unit: '%' }, field: 'percent-body-fat', needsReview: false },
        },
      },
      unmapped: [
        'age',
        'total-body-water',
        'protein',
        'minerals',
        'soft-lean-mass',
        'fat-free-mass',
        'skeletal-muscle-mass',
        'bmi',
        'ecw-ratio',
        'phase-angle',
        'smi',
        'intracellular-water',
        'extracellular-water',
        'basal-metabolic-rate',
        'waist-hip-ratio',
        'visceral-fat-level',
        'obesity-degree',
        'bone-mineral-content',
        'body-cell-mass',
      ],
    });
  });

  it('never suggests a date of birth or lean body mass: age and Fat Free Mass stay unmapped', () => {
    const prefill = prefillOf(extraction());
    expect(MANUAL_PROFILE_ANSWERS).toContain('dateOfBirth');
    expect(prefill.profile).not.toHaveProperty('dateOfBirth');
    expect(prefill.assessment.values).not.toHaveProperty('lean-body-mass');
    expect(prefill.unmapped).toEqual(expect.arrayContaining(['age', 'fat-free-mass']));
  });

  it('gives assessment values that manual entry accepts unchanged', () => {
    const { assessment } = prefillOf(extraction());
    const values = Object.fromEntries(
      Object.entries(assessment.values).map(([metric, prefill]) => [metric, prefill.kind === 'prefilled' ? prefill.value : null]),
    );
    const date = assessment.date.kind === 'prefilled' ? assessment.date.value : '';
    const created = createBodyCompositionAssessment(
      { date, source: MANUAL_INBODY_SOURCE, values },
      { id: 'a1', now: '2026-10-10T09:00:00.000Z', today: TODAY },
    );
    expect(created.ok).toBe(true);
  });

  it('flags uncertain readings for review', () => {
    const prefill = prefillOf(extraction({ measurements: { weight: { status: 'uncertain', text: '94.5', unit: 'kg', sourceLabel: 'Weight' } } }));
    expect(prefill.profile.weight).toMatchObject({ kind: 'prefilled', needsReview: true });
    expect(prefill.assessment.values.weight).toMatchObject({ kind: 'prefilled', needsReview: true });
    expect(prefill.profile.height).toMatchObject({ needsReview: false });
  });

  it('leaves missing and unreadable values for the user to enter', () => {
    const prefill = prefillOf(
      extraction({
        profile: { height: NOT_ON_REPORT, gender: { status: 'unreadable', text: null, unit: null, sourceLabel: 'Gender' } },
      }),
    );
    expect(prefill.profile.height).toEqual({ kind: 'missing', field: 'height', reason: 'not-on-report' });
    expect(prefill.profile.sex).toEqual({ kind: 'missing', field: 'gender', reason: 'unreadable' });
  });

  it.each<[string, Changes, (p: InBodyPrefill) => unknown, string]>([
    ['a gender other than Male/Female', { profile: { gender: read('Other') } }, (p) => p.profile.sex, 'unrecognised'],
    ['a day-first date', { metadata: { 'test-date-time': read('01.10.2026. 08:06') } }, (p) => p.assessment.date, 'unrecognised'],
    ['an impossible date', { metadata: { 'test-date-time': read('2026.02.30. 08:06') } }, (p) => p.assessment.date, 'unrecognised'],
    ['a future date', { metadata: { 'test-date-time': read('2026.10.11. 08:06') } }, (p) => p.assessment.date, 'out-of-range'],
    ['an implausible height', { profile: { height: read('30', 'cm') } }, (p) => p.profile.height, 'out-of-range'],
    ['an implausible weight (profile)', { measurements: { weight: read('900', 'kg') } }, (p) => p.profile.weight, 'out-of-range'],
    ['an implausible weight (assessment)', { measurements: { weight: read('900', 'kg') } }, (p) => p.assessment.values.weight, 'out-of-range'],
    ['an implausible percentage', { measurements: { 'percent-body-fat': read('100', '%') } }, (p) => p.assessment.values['body-fat-percentage'], 'out-of-range'],
  ])('does not suggest %s', (_, changes, pick, reason) => {
    expect(pick(prefillOf(extraction(changes)))).toMatchObject({ kind: 'missing', reason });
  });

  it('keeps pounds as reported for the assessment and converts only the profile weight to kilograms', () => {
    const prefill = prefillOf(extraction({ measurements: { weight: read('208.3', 'lb') } }));
    expect(prefill.assessment.values.weight).toMatchObject({ value: { value: 208.3, unit: 'lb' } });
    expect(prefill.profile.weight).toMatchObject({ value: { kilograms: 94.48 } });
  });

  it('flags a report model the mapping was not checked against', () => {
    expect(prefillOf(extraction({ metadata: { 'report-model': read('InBody570') } })).unverifiedReportModel).toBe(true);
    expect(prefillOf(extraction({ metadata: { 'report-model': NOT_ON_REPORT } })).unverifiedReportModel).toBe(true);
  });

  it('passes report issues through for the review screen', () => {
    const raw = { ...structuredClone(SAMPLE_INBODY380_EXTRACTION), reportIssues: ['low-image-quality'] };
    const parsed = parseInBodyExtraction(raw);
    expect(parsed.ok && prefillOf(parsed.value).reportIssues).toEqual(['low-image-quality']);
  });

  it('suggests nothing for a report the model rejected', () => {
    const raw = structuredClone(SAMPLE_INBODY380_EXTRACTION) as unknown as Record<string, Record<string, ExtractedField>>;
    for (const name of ['metadata', 'profile', 'measurements']) {
      for (const id of Object.keys(raw[name])) {
        raw[name][id] = NOT_ON_REPORT;
      }
    }
    const parsed = parseInBodyExtraction({ ...raw, outcome: 'unsupported-report' });
    expect(parsed.ok && inBodyPrefill(parsed.value, TODAY)).toEqual({ kind: 'no-prefill', outcome: 'unsupported-report', reportIssues: [] });
  });
});
