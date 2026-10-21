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
 * - the scalar results of the current test are extracted, including the
 *   segmental lean analysis (kg and %), the InBody score and the weight,
 *   fat and muscle control the device prints, plus the dated points of the
 *   history charts (the "Body Composition History" table and the phase angle
 *   and SMI charts, see `HISTORY_FIELDS`). Reference ranges, impedance, the
 *   device's own evaluations (nutrition, body balance) and its member ID are
 *   not.
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

/** `decimal`: digits with an optional decimal point; `signed-decimal`: the same with an optional leading minus; `text`: a short printed string. */
export type FieldFormat = 'decimal' | 'signed-decimal' | 'text';

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
const signed = <G extends ExtractionGroup>(group: G, units: readonly string[], sampleLabel: string): FieldSpecOf<G> => ({
  group,
  format: 'signed-decimal',
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
  'inbody-score': decimal('measurements', [], 'InBody Score (the number of points out of 100)'),
  'target-weight': decimal('measurements', MASS, 'Weight Control: Target Weight'),
  'weight-control': signed('measurements', MASS, 'Weight Control: Weight Control'),
  'fat-control': signed('measurements', MASS, 'Weight Control: Fat Control'),
  'muscle-control': signed('measurements', MASS, 'Weight Control: Muscle Control'),
  'segmental-lean-right-arm': decimal('measurements', MASS, 'Segmental Lean Analysis: Right Arm, the mass'),
  'segmental-lean-left-arm': decimal('measurements', MASS, 'Segmental Lean Analysis: Left Arm, the mass'),
  'segmental-lean-trunk': decimal('measurements', MASS, 'Segmental Lean Analysis: Trunk, the mass'),
  'segmental-lean-right-leg': decimal('measurements', MASS, 'Segmental Lean Analysis: Right Leg, the mass'),
  'segmental-lean-left-leg': decimal('measurements', MASS, 'Segmental Lean Analysis: Left Leg, the mass'),
  'segmental-lean-right-arm-percentage': decimal('measurements', ['%'], 'Segmental Lean Analysis: Right Arm, the percentage'),
  'segmental-lean-left-arm-percentage': decimal('measurements', ['%'], 'Segmental Lean Analysis: Left Arm, the percentage'),
  'segmental-lean-trunk-percentage': decimal('measurements', ['%'], 'Segmental Lean Analysis: Trunk, the percentage'),
  'segmental-lean-right-leg-percentage': decimal('measurements', ['%'], 'Segmental Lean Analysis: Right Leg, the percentage'),
  'segmental-lean-left-leg-percentage': decimal('measurements', ['%'], 'Segmental Lean Analysis: Left Leg, the percentage'),
} as const satisfies Record<string, ExtractionFieldSpec>;

export type ExtractionFieldId = keyof typeof EXTRACTION_FIELDS;
export type FieldsOfGroup<G extends ExtractionGroup> = {
  [K in ExtractionFieldId]: (typeof EXTRACTION_FIELDS)[K]['group'] extends G ? K : never;
}[ExtractionFieldId];

/**
 * The fields of one history point: the chart at the bottom of an InBody sheet plots weight, SMM and PBF for the
 * last few tests. Each uses the spec of the field of the same id above; the date is the label under the point.
 */
export const HISTORY_FIELDS = [
  'test-date-time',
  'weight',
  'skeletal-muscle-mass',
  'body-fat-mass',
  'percent-body-fat',
  'ecw-ratio',
  'phase-angle',
  'smi',
] as const satisfies readonly ExtractionFieldId[];
export type HistoryFieldId = (typeof HISTORY_FIELDS)[number];
/**
 * Fields added after the first release of this contract. An answer from a server that predates them (no such
 * key) still reads, as "not on the report"; the model is always asked for them.
 */
export const ADDED_LATER: ReadonlySet<ExtractionFieldId> = new Set<ExtractionFieldId>([
  'inbody-score',
  'target-weight',
  'weight-control',
  'fat-control',
  'muscle-control',
  'segmental-lean-right-arm',
  'segmental-lean-left-arm',
  'segmental-lean-trunk',
  'segmental-lean-right-leg',
  'segmental-lean-left-leg',
  'segmental-lean-right-arm-percentage',
  'segmental-lean-left-arm-percentage',
  'segmental-lean-trunk-percentage',
  'segmental-lean-right-leg-percentage',
  'segmental-lean-left-leg-percentage',
]);

/** In a history point, the series added after weight, SMM and PBF (older answers have only those). */
const ADDED_IN_HISTORY: ReadonlySet<ExtractionFieldId> = new Set<ExtractionFieldId>(['body-fat-mass', 'ecw-ratio', 'phase-angle', 'smi']);

/** More points than any sheet prints (about eight). */
export const MAX_HISTORY_POINTS = 12;

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
  /** Earlier tests from the history chart, as printed (empty when the sheet has none, or an older server answered). */
  readonly history: readonly HistoryPoint[];
}

/** One earlier test from the history chart. */
export type HistoryPoint = Readonly<Record<HistoryFieldId, ExtractedField>>;

export const extractedField = (extraction: InBodyExtraction, id: ExtractionFieldId): ExtractedField =>
  (extraction[EXTRACTION_FIELDS[id].group] as Readonly<Record<ExtractionFieldId, ExtractedField>>)[id];

export const hasValue = (field: ExtractedField): boolean => field.status === 'read' || field.status === 'uncertain';

// --- Validation -----------------------------------------------------------------

const DECIMAL_PATTERN = '^\\d+(\\.\\d+)?$';
const DECIMAL = new RegExp(DECIMAL_PATTERN);
const SIGNED_DECIMAL_PATTERN = '^-?\\d+(\\.\\d+)?$';
const SIGNED_DECIMAL = new RegExp(SIGNED_DECIMAL_PATTERN);
const NOT_ON_REPORT: ExtractedField = { status: 'not-on-report', text: null, unit: null, sourceLabel: null };
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
function checkKeys(value: Record<string, unknown>, keys: readonly string[], path: string, errors: ExtractionError[], optional: readonly string[] = []): void {
  for (const key of keys) {
    if (!(key in value) && !optional.includes(key)) {
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
  const numberPattern = spec.format === 'signed-decimal' ? SIGNED_DECIMAL : DECIMAL;
  if (printed !== null && !(isBoundedString(printed, MAX_TEXT_LENGTH) && (spec.format === 'text' || numberPattern.test(printed)))) {
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

/**
 * A field added after the first release: if the model's entry for it can't be used (a shape or consistency problem
 * in this one field), only that value is dropped ("not on the report"): one odd extra field must not discard a
 * whole report. The core fields stay strict.
 */
function parseAddedField(id: ExtractionFieldId, raw: unknown, path: string): ExtractedField {
  return parseField(id, raw, path, []) ?? NOT_ON_REPORT;
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
  checkKeys(raw, ids, `${group}.`, errors, ids.filter((id) => ADDED_LATER.has(id)));
  const fields: Partial<Record<ExtractionFieldId, ExtractedField>> = {};
  for (const id of ids) {
    if (ADDED_LATER.has(id)) {
      fields[id] = id in raw ? parseAddedField(id, raw[id], `${group}.${id}`) : NOT_ON_REPORT;
    } else if (id in raw) {
      const field = parseField(id, raw[id], `${group}.${id}`, errors);
      if (field) {
        fields[id] = field;
      }
    }
  }
  return fields;
}

const TOP_LEVEL_KEYS = ['schemaVersion', 'outcome', 'reportIssues', ...EXTRACTION_GROUPS] as const;
/** `history` is required of the model but optional when reading, so an answer from a server that predates it still reads. */
const RESPONSE_KEYS = [...TOP_LEVEL_KEYS, 'history'] as const;

function parseHistory(raw: unknown, errors: ExtractionError[]): HistoryPoint[] {
  if (!Array.isArray(raw) || raw.length > MAX_HISTORY_POINTS) {
    errors.push({ path: 'history', problem: 'invalid-value' });
    return [];
  }
  const points: HistoryPoint[] = [];
  raw.forEach((item, index) => {
    const path = `history.${index}`;
    if (!isRecord(item)) {
      errors.push({ path, problem: 'not-an-object' });
      return;
    }
    const before = errors.length;
    checkKeys(item, HISTORY_FIELDS, `${path}.`, errors, HISTORY_FIELDS.filter((id) => ADDED_IN_HISTORY.has(id)));
    const fields: Partial<Record<HistoryFieldId, ExtractedField>> = {};
    for (const id of HISTORY_FIELDS) {
      if (ADDED_IN_HISTORY.has(id)) {
        fields[id] = id in item ? parseAddedField(id, item[id], `${path}.${id}`) : NOT_ON_REPORT;
      } else if (id in item) {
        const field = parseField(id, item[id], `${path}.${id}`, errors);
        if (field) {
          fields[id] = field;
        }
      }
    }
    if (errors.length === before) {
      points.push(fields as HistoryPoint);
    }
  });
  return points;
}

// --- Repairs the sheet itself justifies ---------------------------------------------

const MASS_UNITS_ON_SHEET: readonly string[] = MASS;

/** The mass unit this sheet uses: the one every mass value that states a unit agrees on; null if none or mixed. */
function sheetMassUnit(value: Record<string, unknown>): string | null {
  const seen = new Set<string>();
  const fields: unknown[] = [];
  if (isRecord(value['measurements'])) {
    fields.push(...Object.values(value['measurements']));
  }
  for (const field of fields) {
    if (isRecord(field) && (field['status'] === 'read' || field['status'] === 'uncertain') && typeof field['unit'] === 'string' && MASS_UNITS_ON_SHEET.includes(field['unit'])) {
      seen.add(field['unit']);
    }
  }
  return seen.size === 1 ? [...seen][0] : null;
}

/**
 * Two kinds of slip the model makes, mended before the strict check (neither can create a value that the model
 * did not read):
 * - a value it read but gave no unit for: the unit is the field's only possible unit (%, kcal, L, kg/m², °), or, for a
 *   mass, the unit every other mass on the same sheet states (a sheet prints one mass unit, and merged cells often
 *   leave it off); with nothing to go on the field stays as it is and is rejected;
 * - a field with no value that still carries a unit, or (not on the report) a label: those are dropped.
 */
function repairField(id: ExtractionFieldId, raw: Record<string, unknown>, massUnit: string | null): Record<string, unknown> {
  const spec: ExtractionFieldSpec = EXTRACTION_FIELDS[id];
  const hasReading = raw['status'] === 'read' || raw['status'] === 'uncertain';
  if (hasReading && typeof raw['text'] === 'string' && raw['unit'] === null && spec.units.length > 0) {
    const unit = spec.units.length === 1 ? spec.units[0] : spec.units.every((u) => MASS_UNITS_ON_SHEET.includes(u)) ? massUnit : null;
    return unit ? { ...raw, unit } : raw;
  }
  if ((raw['status'] === 'not-on-report' || raw['status'] === 'unreadable') && raw['text'] === null) {
    return { ...raw, unit: null, ...(raw['status'] === 'not-on-report' ? { sourceLabel: null } : {}) };
  }
  return raw;
}

function repairFields(fields: Record<string, unknown>, massUnit: string | null): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, raw]) => [key, key in EXTRACTION_FIELDS && isRecord(raw) ? repairField(key as ExtractionFieldId, raw, massUnit) : raw]),
  );
}

function repairExtraction(value: Record<string, unknown>): Record<string, unknown> {
  const massUnit = sheetMassUnit(value);
  const repaired: Record<string, unknown> = { ...value };
  for (const group of EXTRACTION_GROUPS) {
    if (isRecord(value[group])) {
      repaired[group] = repairFields(value[group], massUnit);
    }
  }
  if (Array.isArray(value['history'])) {
    repaired['history'] = value['history'].map((point: unknown) => (isRecord(point) ? repairFields(point, massUnit) : point));
  }
  return repaired;
}

/**
 * Strict check of a model response (already JSON-decoded), after the repairs above. Every problem is
 * reported; the extraction is returned only when there are none.
 *
 * Beyond shape: `extracted` needs at least one value, and the other
 * outcomes may not carry any (nothing is prefilled from a report the model
 * itself rejected).
 */
export function parseInBodyExtraction(input: unknown): ExtractionParseResult {
  if (!isRecord(input)) {
    return { ok: false, errors: [{ path: '', problem: 'not-an-object' }] };
  }
  const value = repairExtraction(input);
  const errors: ExtractionError[] = [];
  checkKeys(value, 'history' in value ? RESPONSE_KEYS : TOP_LEVEL_KEYS, '', errors);
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
  const history = 'history' in value ? parseHistory(value['history'], errors) : [];
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
    history,
  } as InBodyExtraction;
  const anyValue = EXTRACTION_FIELD_IDS.some((id) => hasValue(extractedField(extraction, id)));
  if (anyValue !== (extraction.outcome === 'extracted')) {
    return { ok: false, errors: [{ path: 'outcome', problem: 'inconsistent' }] };
  }
  return { ok: true, value: extraction };
}

// --- JSON schema for the model ------------------------------------------------------

const nullableString = (extra: Record<string, unknown> = {}) => ({ type: ['string', 'null'], ...extra });

function fieldSchema(id: ExtractionFieldId, scope: 'current' | 'history' = 'current'): Record<string, unknown> {
  const spec: ExtractionFieldSpec = EXTRACTION_FIELDS[id];
  const unitHint = spec.units.length > 0 ? `unit as printed (one of ${spec.units.join(', ')})` : 'no unit (unit must be null)';
  return {
    type: 'object',
    description:
      scope === 'history'
        ? `Printed label: "${spec.sampleLabel}" (for the date, the label under the point on the history chart, exactly as printed). This earlier test's value only; ${unitHint}.`
        : `Printed label: "${spec.sampleLabel}". The current test's value only, never a reference range or history value; ${unitHint}.`,
    additionalProperties: false,
    required: [...FIELD_KEYS],
    properties: {
      status: { type: 'string', enum: [...FIELD_STATUSES] },
      text: nullableString(
        spec.format === 'decimal'
          ? { pattern: DECIMAL_PATTERN, description: 'The number exactly as printed, without unit, rounding or conversion.' }
          : spec.format === 'signed-decimal'
            ? {
                pattern: SIGNED_DECIMAL_PATTERN,
                description: 'The number exactly as printed, without unit, rounding or conversion; a negative number starts with a minus sign and no space after it (for example -20.5).',
              }
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
    required: [...RESPONSE_KEYS],
    properties: {
      schemaVersion: { type: 'string', enum: [INBODY_EXTRACTION_SCHEMA_VERSION] },
      outcome: { type: 'string', enum: [...EXTRACTION_OUTCOMES] },
      reportIssues: { type: 'array', items: { type: 'string', enum: [...REPORT_ISSUES] } },
      metadata: group('metadata'),
      profile: group('profile'),
      measurements: group('measurements'),
      history: {
        type: 'array',
        description:
          'The dated points of the history chart at the bottom of the sheet (weight, SMM and PBF of earlier tests), oldest first, one entry per printed test date, including the current test if it is plotted. Empty when the sheet has no history chart. Transcribe only what is printed; never invent a point or a value.',
        maxItems: MAX_HISTORY_POINTS,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [...HISTORY_FIELDS],
          properties: Object.fromEntries(HISTORY_FIELDS.map((id) => [id, fieldSchema(id, 'history')])),
        },
      },
    },
  };
}
