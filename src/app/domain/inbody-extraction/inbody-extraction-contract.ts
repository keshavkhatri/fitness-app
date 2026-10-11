import { isOneOf } from '../fitness-profile';

/**
 * The contract for an AI model's reading of one InBody report image.
 *
 * The model must answer with JSON matching `inBodyExtractionJsonSchema()`
 * (OpenAI Structured Outputs, `strict: true`); the app never trusts that:
 * every response is re-checked by `parseInBodyExtraction`, independently of
 * the schema the model was given. A valid extraction is still not a valid
 * profile or assessment: see inbody-extraction-mapping.ts.
 *
 * Rules the contract encodes:
 * - values are transcribed, never interpreted: `text` is the number exactly
 *   as printed (no unit, no conversion, no rounding) and `unit` the unit as
 *   printed;
 * - a value the model can't see is `not-on-report`, one it can't read
 *   reliably is `unreadable`: never a guess. `uncertain` is a reading the
 *   user must check;
 * - fields are grouped as report metadata, profile details and measurements;
 * - only the scalar results of the current test are extracted. Reference
 *   ranges, history, segmental analysis, impedance, evaluations, the InBody
 *   score, weight-control advice and the device's member ID are not.
 *
 * The catalogue is based on an InBody380 result sheet (English, template
 * "BR-English-R6-A-230522"). Other InBody models print other layouts;
 * `sampleLabel` is the label as printed on that sheet.
 */

export const INBODY_EXTRACTION_SCHEMA_VERSION = 'inbody-extraction.v1';
/** The `name` sent with the JSON schema. */
export const INBODY_EXTRACTION_SCHEMA_NAME = 'inbody_extraction_v1';

/**
 * - extracted: an InBody result sheet with at least one value read;
 * - unsupported-report: not an InBody result sheet (another document, another
 *   vendor, a history-only printout, …);
 * - insufficient-readable-information: an InBody sheet, but nothing could be read.
 */
export const EXTRACTION_OUTCOMES = ['extracted', 'unsupported-report', 'insufficient-readable-information'] as const;
export type ExtractionOutcome = (typeof EXTRACTION_OUTCOMES)[number];

export const FIELD_STATUSES = ['read', 'uncertain', 'unreadable', 'not-on-report'] as const;
export type FieldStatus = (typeof FIELD_STATUSES)[number];

/** Whole-report problems, shown to the user alongside the fields. */
export const REPORT_ISSUES = ['low-image-quality', 'partially-cropped', 'multiple-reports'] as const;
export type ReportIssue = (typeof REPORT_ISSUES)[number];

export const EXTRACTION_GROUPS = ['metadata', 'profile', 'measurements'] as const;
export type ExtractionGroup = (typeof EXTRACTION_GROUPS)[number];

/** `decimal`: digits with an optional decimal point; `text`: a short printed string. */
export type FieldFormat = 'decimal' | 'text';

export interface ExtractionFieldSpec {
  readonly group: ExtractionGroup;
  readonly format: FieldFormat;
  /** Units the value may be printed in; empty when the value has no unit. */
  readonly units: readonly string[];
  readonly sampleLabel: string;
}

const MASS = ['kg', 'lb'] as const;
type FieldSpecOf<G extends ExtractionGroup> = ExtractionFieldSpec & { readonly group: G };
const decimal = <G extends ExtractionGroup>(group: G, units: readonly string[], sampleLabel: string): FieldSpecOf<G> => ({
  group,
  format: 'decimal',
  units,
  sampleLabel,
});
const text = <G extends ExtractionGroup>(group: G, sampleLabel: string): FieldSpecOf<G> => ({ group, format: 'text', units: [], sampleLabel });

/** Every extracted field, in schema order. */
export const EXTRACTION_FIELDS = {
  'report-model': text('metadata', 'Model name in the header, e.g. [InBody380]'),
  'test-date-time': text('metadata', 'Test Date / Time'),
  height: decimal('profile', ['cm'], 'Height'),
  age: decimal('profile', [], 'Age'),
  gender: text('profile', 'Gender'),
  weight: decimal('measurements', MASS, 'Weight'),
  'total-body-water': decimal('measurements', ['L'], 'Total Body Water'),
  protein: decimal('measurements', MASS, 'Protein'),
  minerals: decimal('measurements', MASS, 'Minerals'),
  'body-fat-mass': decimal('measurements', MASS, 'Body Fat Mass'),
  'soft-lean-mass': decimal('measurements', MASS, 'Soft Lean Mass'),
  'fat-free-mass': decimal('measurements', MASS, 'Fat Free Mass'),
  'skeletal-muscle-mass': decimal('measurements', MASS, 'SMM (Skeletal Muscle Mass)'),
  bmi: decimal('measurements', ['kg/m²'], 'BMI (Body Mass Index)'),
  'percent-body-fat': decimal('measurements', ['%'], 'PBF (Percent Body Fat)'),
  'ecw-ratio': decimal('measurements', [], 'ECW Ratio'),
  'phase-angle': decimal('measurements', ['°'], 'Whole Body Phase Angle (50 kHz)'),
  smi: decimal('measurements', ['kg/m²'], 'SMI'),
  'intracellular-water': decimal('measurements', ['L'], 'Intracellular Water'),
  'extracellular-water': decimal('measurements', ['L'], 'Extracellular Water'),
  'basal-metabolic-rate': decimal('measurements', ['kcal'], 'Basal Metabolic Rate'),
  'waist-hip-ratio': decimal('measurements', [], 'Waist-Hip Ratio'),
  'visceral-fat-level': decimal('measurements', [], 'Visceral Fat Level'),
  'obesity-degree': decimal('measurements', ['%'], 'Obesity Degree'),
  'bone-mineral-content': decimal('measurements', MASS, 'Bone Mineral Content'),
  'body-cell-mass': decimal('measurements', MASS, 'Body Cell Mass'),
} as const satisfies Record<string, ExtractionFieldSpec>;

export type ExtractionFieldId = keyof typeof EXTRACTION_FIELDS;
export type FieldsOfGroup<G extends ExtractionGroup> = {
  [K in ExtractionFieldId]: (typeof EXTRACTION_FIELDS)[K]['group'] extends G ? K : never;
}[ExtractionFieldId];

export const EXTRACTION_FIELD_IDS = Object.keys(EXTRACTION_FIELDS) as ExtractionFieldId[];
export const fieldsOfGroup = <G extends ExtractionGroup>(group: G): FieldsOfGroup<G>[] =>
  EXTRACTION_FIELD_IDS.filter((id): id is FieldsOfGroup<G> => EXTRACTION_FIELDS[id].group === group);

/** One field as the model read it. */
export interface ExtractedField {
  readonly status: FieldStatus;
  /** As printed, without its unit; null unless `read` or `uncertain`. */
  readonly text: string | null;
  /** As printed; null when the value has none or wasn't read. */
  readonly unit: string | null;
  /** The label next to the value, as printed; null when not found. */
  readonly sourceLabel: string | null;
}

export interface InBodyExtraction {
  readonly schemaVersion: typeof INBODY_EXTRACTION_SCHEMA_VERSION;
  readonly outcome: ExtractionOutcome;
  readonly reportIssues: readonly ReportIssue[];
  readonly metadata: Readonly<Record<FieldsOfGroup<'metadata'>, ExtractedField>>;
  readonly profile: Readonly<Record<FieldsOfGroup<'profile'>, ExtractedField>>;
  readonly measurements: Readonly<Record<FieldsOfGroup<'measurements'>, ExtractedField>>;
}

export const extractedField = (extraction: InBodyExtraction, id: ExtractionFieldId): ExtractedField =>
  (extraction[EXTRACTION_FIELDS[id].group] as Readonly<Record<ExtractionFieldId, ExtractedField>>)[id];

export const hasValue = (field: ExtractedField): boolean => field.status === 'read' || field.status === 'uncertain';

// --- Validation -----------------------------------------------------------------

const DECIMAL_PATTERN = '^\\d+(\\.\\d+)?$';
const DECIMAL = new RegExp(DECIMAL_PATTERN);
/** Long enough for any printed value or label; longer strings are prose, not transcription. */
const MAX_TEXT_LENGTH = 40;
const MAX_LABEL_LENGTH = 80;

/** Path segment standing in for a key the contract doesn't define. */
export const UNKNOWN_KEY = '<unknown>';

/**
 * `path` locates the problem (e.g. `measurements.weight.unit`). Errors never
 * carry the offending value, nor any model-written key (an unknown key shows
 * as `<unknown>`): extraction payloads hold personal data.
 */
export type ExtractionProblem =
  | 'not-an-object'
  | 'missing-key'
  | 'unknown-key'
  | 'unsupported-version'
  | 'invalid-value'
  | 'inconsistent';
export interface ExtractionError {
  readonly path: string;
  readonly problem: ExtractionProblem;
}
export type ExtractionParseResult =
  | { readonly ok: true; readonly value: InBodyExtraction }
  | { readonly ok: false; readonly errors: readonly ExtractionError[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isOutcome = isOneOf(EXTRACTION_OUTCOMES);
const isFieldStatus = isOneOf(FIELD_STATUSES);
const isReportIssue = isOneOf(REPORT_ISSUES);

const isBoundedString = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim() !== '' && value.length <= max;

/** Exactly `keys`, no more and no fewer; problems are appended to `errors`. */
function checkKeys(value: Record<string, unknown>, keys: readonly string[], path: string, errors: ExtractionError[]): void {
  for (const key of keys) {
    if (!(key in value)) {
      errors.push({ path: `${path}${key}`, problem: 'missing-key' });
    }
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) {
      // The key itself is model-written text (it could quote the report), so
      // the path names its position only, never the key.
      errors.push({ path: `${path}${UNKNOWN_KEY}`, problem: 'unknown-key' });
    }
  }
}

const FIELD_KEYS = ['status', 'text', 'unit', 'sourceLabel'] as const;

function parseField(id: ExtractionFieldId, raw: unknown, path: string, errors: ExtractionError[]): ExtractedField | null {
  if (!isRecord(raw)) {
    errors.push({ path, problem: 'not-an-object' });
    return null;
  }
  const before = errors.length;
  checkKeys(raw, FIELD_KEYS, `${path}.`, errors);
  if (errors.length > before) {
    return null;
  }
  const { status, text: printed, unit, sourceLabel } = raw;
  const spec: ExtractionFieldSpec = EXTRACTION_FIELDS[id];
  if (!isFieldStatus(status)) {
    errors.push({ path: `${path}.status`, problem: 'invalid-value' });
  }
  if (sourceLabel !== null && !isBoundedString(sourceLabel, MAX_LABEL_LENGTH)) {
    errors.push({ path: `${path}.sourceLabel`, problem: 'invalid-value' });
  }
  if (printed !== null && !(isBoundedString(printed, MAX_TEXT_LENGTH) && (spec.format === 'text' || DECIMAL.test(printed)))) {
    errors.push({ path: `${path}.text`, problem: 'invalid-value' });
  }
  if (unit !== null && !(typeof unit === 'string' && spec.units.includes(unit))) {
    errors.push({ path: `${path}.unit`, problem: 'invalid-value' });
  }
  if (errors.length > before) {
    return null;
  }
  const field: ExtractedField = {
    status: status as FieldStatus,
    text: printed as string | null,
    unit: unit as string | null,
    sourceLabel: sourceLabel as string | null,
  };
  // A value needs its text, and its unit when the field has units; no value means no text, unit or (if absent) label.
  const consistent = hasValue(field)
    ? field.text !== null && (spec.units.length === 0) === (field.unit === null)
    : field.text === null && field.unit === null && (field.status === 'unreadable' || field.sourceLabel === null);
  if (!consistent) {
    errors.push({ path, problem: 'inconsistent' });
    return null;
  }
  return field;
}

function parseGroup(
  group: ExtractionGroup,
  raw: unknown,
  errors: ExtractionError[],
): Partial<Record<ExtractionFieldId, ExtractedField>> {
  if (!isRecord(raw)) {
    errors.push({ path: group, problem: 'not-an-object' });
    return {};
  }
  const ids = fieldsOfGroup(group);
  checkKeys(raw, ids, `${group}.`, errors);
  const fields: Partial<Record<ExtractionFieldId, ExtractedField>> = {};
  for (const id of ids) {
    if (id in raw) {
      const field = parseField(id, raw[id], `${group}.${id}`, errors);
      if (field) {
        fields[id] = field;
      }
    }
  }
  return fields;
}

const TOP_LEVEL_KEYS = ['schemaVersion', 'outcome', 'reportIssues', ...EXTRACTION_GROUPS] as const;

/**
 * Strict check of a model response (already JSON-decoded). Every problem is
 * reported; the extraction is returned only when there are none.
 *
 * Beyond shape: `extracted` needs at least one value, and the other
 * outcomes may not carry any (nothing is prefilled from a report the model
 * itself rejected).
 */
export function parseInBodyExtraction(value: unknown): ExtractionParseResult {
  if (!isRecord(value)) {
    return { ok: false, errors: [{ path: '', problem: 'not-an-object' }] };
  }
  const errors: ExtractionError[] = [];
  checkKeys(value, TOP_LEVEL_KEYS, '', errors);
  if (value['schemaVersion'] !== INBODY_EXTRACTION_SCHEMA_VERSION && 'schemaVersion' in value) {
    // Anything else in a response of another version can't be read with these rules.
    return { ok: false, errors: [{ path: 'schemaVersion', problem: 'unsupported-version' }] };
  }
  const outcome = value['outcome'];
  if ('outcome' in value && !isOutcome(outcome)) {
    errors.push({ path: 'outcome', problem: 'invalid-value' });
  }
  const issues = value['reportIssues'];
  if (
    'reportIssues' in value &&
    !(Array.isArray(issues) && issues.every(isReportIssue) && new Set(issues).size === issues.length)
  ) {
    errors.push({ path: 'reportIssues', problem: 'invalid-value' });
  }
  const groups = EXTRACTION_GROUPS.map((group) => (group in value ? parseGroup(group, value[group], errors) : {}));
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const [metadata, profile, measurements] = groups;
  const extraction = {
    schemaVersion: INBODY_EXTRACTION_SCHEMA_VERSION,
    outcome: outcome as ExtractionOutcome,
    reportIssues: [...(issues as ReportIssue[])],
    metadata,
    profile,
    measurements,
  } as InBodyExtraction;
  const anyValue = EXTRACTION_FIELD_IDS.some((id) => hasValue(extractedField(extraction, id)));
  if (anyValue !== (extraction.outcome === 'extracted')) {
    return { ok: false, errors: [{ path: 'outcome', problem: 'inconsistent' }] };
  }
  return { ok: true, value: extraction };
}

// --- JSON schema for the model ------------------------------------------------------

const nullableString = (extra: Record<string, unknown> = {}) => ({ type: ['string', 'null'], ...extra });

function fieldSchema(id: ExtractionFieldId): Record<string, unknown> {
  const spec: ExtractionFieldSpec = EXTRACTION_FIELDS[id];
  const unitHint = spec.units.length > 0 ? `unit as printed (one of ${spec.units.join(', ')})` : 'no unit (unit must be null)';
  return {
    type: 'object',
    description: `Printed label: "${spec.sampleLabel}". The current test's value only, never a reference range or history value; ${unitHint}.`,
    additionalProperties: false,
    required: [...FIELD_KEYS],
    properties: {
      status: { type: 'string', enum: [...FIELD_STATUSES] },
      text: nullableString(
        spec.format === 'decimal'
          ? { pattern: DECIMAL_PATTERN, description: 'The number exactly as printed, without unit, rounding or conversion.' }
          : { description: 'The text exactly as printed.' },
      ),
      unit: spec.units.length > 0 ? { type: ['string', 'null'], enum: [...spec.units, null] } : { type: 'null' },
      sourceLabel: nullableString({ description: 'The label printed next to the value.' }),
    },
  };
}

/**
 * The JSON schema to send as `text.format` (`type: "json_schema"`,
 * `name: INBODY_EXTRACTION_SCHEMA_NAME`, `strict: true`) in the OpenAI
 * Responses API. Built from `EXTRACTION_FIELDS`, so it can't drift from
 * `parseInBodyExtraction`. Within the Structured Outputs subset: object
 * root, every property required, `additionalProperties: false`, nullable
 * values as type unions.
 */
export function inBodyExtractionJsonSchema(): Record<string, unknown> {
  const group = (name: ExtractionGroup) => {
    const ids = fieldsOfGroup(name);
    return {
      type: 'object',
      additionalProperties: false,
      required: ids,
      properties: Object.fromEntries(ids.map((id) => [id, fieldSchema(id)])),
    };
  };
  return {
    type: 'object',
    additionalProperties: false,
    required: [...TOP_LEVEL_KEYS],
    properties: {
      schemaVersion: { type: 'string', enum: [INBODY_EXTRACTION_SCHEMA_VERSION] },
      outcome: { type: 'string', enum: [...EXTRACTION_OUTCOMES] },
      reportIssues: { type: 'array', items: { type: 'string', enum: [...REPORT_ISSUES] } },
      metadata: group('metadata'),
      profile: group('profile'),
      measurements: group('measurements'),
    },
  };
}
