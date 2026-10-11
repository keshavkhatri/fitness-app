import { IsoCalendarDate, POUNDS_PER_KILOGRAM, WEIGHT_KG, isOneOf, isWithin, parseIsoCalendarDate } from '../fitness-profile';

/**
 * A body-composition assessment (e.g. one InBody report): the values a
 * report states, recorded as reported. Kept apart from body-weight history,
 * tape measurements and the profile: recording one never changes any of
 * them, and nothing is derived from them yet.
 *
 * Raw vs derived: `reported` holds only values read from the report, each
 * with the unit the report used (no conversion or rounding). Values the app
 * computes (unit conversions, lean-mass estimates, …) are never stored here;
 * they will be separate, explicitly derived types when they exist.
 *
 * The metric catalogue follows the scalar results of an InBody result sheet
 * (see inbody-extraction-contract.ts). `source` is a manual entry, or an
 * import with its provenance when the values were read from a report image
 * and saved as read (see body-composition-import.ts).
 */

/**
 * Supported metrics, in display order. Each has one quantity kind, which
 * decides its allowed units. Lean body mass and fat-free mass are separate
 * metrics: a report's "Fat Free Mass" is never stored as lean body mass.
 */
export const BODY_COMPOSITION_METRICS = [
  'weight',
  'body-fat-mass',
  'lean-body-mass',
  'body-fat-percentage',
  'skeletal-muscle-mass',
  'fat-free-mass',
  'soft-lean-mass',
  'bmi',
  'visceral-fat-level',
  'basal-metabolic-rate',
  'total-body-water',
  'intracellular-water',
  'extracellular-water',
  'ecw-ratio',
  'protein',
  'minerals',
  'bone-mineral-content',
  'body-cell-mass',
  'smi',
  'phase-angle',
  'waist-hip-ratio',
  'obesity-degree',
] as const;
export type BodyCompositionMetric = (typeof BODY_COMPOSITION_METRICS)[number];
export const isBodyCompositionMetric = isOneOf(BODY_COMPOSITION_METRICS);

/** The metrics shown first (history rows, the entry form); the rest are report details. */
export const KEY_BODY_COMPOSITION_METRICS = [
  'weight',
  'body-fat-percentage',
  'body-fat-mass',
  'skeletal-muscle-mass',
  'fat-free-mass',
] as const satisfies readonly BodyCompositionMetric[];

/** `index`: kg/m² (BMI, SMI); `ratio` / `level`: unitless numbers. */
export type BodyCompositionQuantity = 'mass' | 'percentage' | 'volume' | 'index' | 'energy' | 'angle' | 'ratio' | 'level';
export const METRIC_QUANTITY: Readonly<Record<BodyCompositionMetric, BodyCompositionQuantity>> = {
  weight: 'mass',
  'body-fat-mass': 'mass',
  'lean-body-mass': 'mass',
  'body-fat-percentage': 'percentage',
  'skeletal-muscle-mass': 'mass',
  'fat-free-mass': 'mass',
  'soft-lean-mass': 'mass',
  bmi: 'index',
  'visceral-fat-level': 'level',
  'basal-metabolic-rate': 'energy',
  'total-body-water': 'volume',
  'intracellular-water': 'volume',
  'extracellular-water': 'volume',
  'ecw-ratio': 'ratio',
  protein: 'mass',
  minerals: 'mass',
  'bone-mineral-content': 'mass',
  'body-cell-mass': 'mass',
  smi: 'index',
  'phase-angle': 'angle',
  'waist-hip-ratio': 'ratio',
  'obesity-degree': 'percentage',
};

export const MASS_UNITS = ['kg', 'lb'] as const;
/** `none`: a unitless value (a ratio or a level). */
export const REPORTED_UNITS = [...MASS_UNITS, '%', 'L', 'kg/m²', 'kcal', '°', 'none'] as const;
export type ReportedUnit = (typeof REPORTED_UNITS)[number];
export const isReportedUnit = isOneOf(REPORTED_UNITS);

const UNITS_BY_QUANTITY: Readonly<Record<BodyCompositionQuantity, readonly ReportedUnit[]>> = {
  mass: MASS_UNITS,
  percentage: ['%'],
  volume: ['L'],
  index: ['kg/m²'],
  energy: ['kcal'],
  angle: ['°'],
  ratio: ['none'],
  level: ['none'],
};

/** Whether `unit` is a valid unit for `metric` (a mass in kg/lb, a percentage in %, …). */
export function isUnitFor(metric: BodyCompositionMetric, unit: ReportedUnit): boolean {
  return UNITS_BY_QUANTITY[METRIC_QUANTITY[metric]].includes(unit);
}

/** The one unit a non-mass metric is recorded in; null for masses (kg or lb). */
export function fixedUnitOf(metric: BodyCompositionMetric): ReportedUnit | null {
  const units = UNITS_BY_QUANTITY[METRIC_QUANTITY[metric]];
  return units.length === 1 ? units[0] : null;
}

/** A value exactly as the report states it. */
export interface ReportedValue {
  readonly value: number;
  readonly unit: ReportedUnit;
}

export type BodyCompositionValues = Readonly<Partial<Record<BodyCompositionMetric, ReportedValue>>>;

/** Values typed in by hand from an InBody report: no parser metadata. */
export interface ManualSource {
  readonly device: 'inbody';
  readonly entryMethod: 'manual';
}

/** Values read from a report by a parser. */
export interface ImportProvenance {
  readonly device: 'inbody';
  readonly entryMethod: 'import';
  /** The report format the parser recognised (an identifier the parser defines). */
  readonly format: string;
  readonly parser: { readonly name: string; readonly version: string };
}

/** Where the values came from. */
export type BodyCompositionSource = ManualSource | ImportProvenance;

export const MANUAL_INBODY_SOURCE: ManualSource = { device: 'inbody', entryMethod: 'manual' };

/**
 * - `date` is the user's local calendar date of the assessment.
 * - `reported` holds only the metrics the report stated (never empty).
 * - `createdAt` / `updatedAt` are record times (ISO instants), used only to
 *   order same-day assessments.
 */
export interface BodyCompositionAssessment {
  readonly id: string;
  readonly date: IsoCalendarDate;
  readonly source: BodyCompositionSource;
  readonly reported: BodyCompositionValues;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Already-parsed input: blank or missing metrics are null/absent. */
export interface BodyCompositionInput {
  readonly date: string;
  readonly source: BodyCompositionSource;
  readonly values: Readonly<Partial<Record<BodyCompositionMetric, ReportedValue | null>>>;
}

export type BodyCompositionProblem =
  | 'not-a-number'
  | 'out-of-range'
  | 'wrong-unit'
  | 'required'
  | 'invalid-date'
  | 'future-date'
  | 'imported-source';
/**
 * `values: 'required'` means no metric was filled in. `source:
 * 'imported-source'` means an update would label edited values as imported
 * (see updateBodyCompositionAssessment).
 */
export type BodyCompositionErrors = Readonly<Partial<Record<BodyCompositionMetric | 'values' | 'date' | 'source', BodyCompositionProblem>>>;
export type BodyCompositionResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: BodyCompositionErrors };

/**
 * Upper bounds (inclusive; every value must also be above 0) for metrics
 * that aren't masses, in their only unit. Plausibility only (typos,
 * impossible values), not reference ranges.
 */
export const PLAUSIBLE_MAX: Readonly<Partial<Record<BodyCompositionMetric, number>>> = {
  'obesity-degree': 500,
  bmi: 150,
  smi: 50,
  'visceral-fat-level': 100,
  'basal-metabolic-rate': 10_000,
  'total-body-water': 200,
  'intracellular-water': 200,
  'extracellular-water': 200,
  'phase-angle': 30,
  'waist-hip-ratio': 5,
};

/**
 * Plausibility only (typos, impossible values), not reference ranges:
 * - weight: the profile's body-weight range;
 * - other masses: above 0, at most the largest plausible body weight;
 * - body fat percentage and the ECW ratio: above 0 and below 100 / 1;
 * - everything else: above 0, up to PLAUSIBLE_MAX.
 * Values are never checked against each other (that would need a formula).
 */
function isPlausible(metric: BodyCompositionMetric, { value, unit }: ReportedValue): boolean {
  if (value <= 0) {
    return false;
  }
  if (metric === 'body-fat-percentage') {
    return value < 100;
  }
  if (metric === 'ecw-ratio') {
    return value < 1;
  }
  if (unit === 'kg' || unit === 'lb') {
    const kilograms = unit === 'kg' ? value : value / POUNDS_PER_KILOGRAM;
    return metric === 'weight' ? isWithin(kilograms, WEIGHT_KG) : kilograms <= WEIGHT_KG.max;
  }
  return value <= (PLAUSIBLE_MAX[metric] ?? Number.POSITIVE_INFINITY);
}

function valueProblem(metric: BodyCompositionMetric, reported: ReportedValue): BodyCompositionProblem | null {
  if (!Number.isFinite(reported.value)) {
    return 'not-a-number';
  }
  if (!isReportedUnit(reported.unit) || !isUnitFor(metric, reported.unit)) {
    return 'wrong-unit';
  }
  return isPlausible(metric, reported) ? null : 'out-of-range';
}

const isInstant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

/** Field-level validation; `today` is the user's local date (no future assessments). */
export function validateBodyCompositionInput(
  input: Pick<BodyCompositionInput, 'date' | 'values'>,
  today: IsoCalendarDate,
): BodyCompositionErrors {
  const errors: Partial<Record<BodyCompositionMetric | 'values' | 'date', BodyCompositionProblem>> = {};
  let filled = 0;
  for (const metric of BODY_COMPOSITION_METRICS) {
    const reported = input.values[metric];
    if (reported === null || reported === undefined) {
      continue;
    }
    filled++;
    const problem = valueProblem(metric, reported);
    if (problem) {
      errors[metric] = problem;
    }
  }
  if (filled === 0) {
    errors.values = 'required';
  }
  if (input.date.trim() === '') {
    errors.date = 'required';
  } else if (!parseIsoCalendarDate(input.date)) {
    errors.date = 'invalid-date';
  } else if (input.date > today) {
    errors.date = 'future-date';
  }
  return errors;
}

export interface BodyCompositionContext {
  readonly id: string;
  /** ISO instant of this change. */
  readonly now: string;
  readonly today: IsoCalendarDate;
}

export function createBodyCompositionAssessment(
  input: BodyCompositionInput,
  { id, now, today }: BodyCompositionContext,
): BodyCompositionResult<BodyCompositionAssessment> {
  const errors = validateBodyCompositionInput(input, today);
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  const reported: Partial<Record<BodyCompositionMetric, ReportedValue>> = {};
  for (const metric of BODY_COMPOSITION_METRICS) {
    const value = input.values[metric];
    if (value !== null && value !== undefined) {
      reported[metric] = { value: value.value, unit: value.unit };
    }
  }
  return { ok: true, value: { id, date: input.date, source: copySource(input.source), reported, createdAt: now, updatedAt: now } };
}

/** Only the defined provenance fields, so what is stored is exactly what the stored-data parser reads back. */
const copySource = (source: BodyCompositionSource): BodyCompositionSource =>
  source.entryMethod === 'manual'
    ? MANUAL_INBODY_SOURCE
    : {
        device: source.device,
        entryMethod: source.entryMethod,
        format: source.format,
        parser: { name: source.parser.name, version: source.parser.version },
      };

/**
 * A new version of an assessment after a user edit: same id and creation
 * time; everything else replaced. Edited values are never labelled as
 * parser output: the result may keep an imported source only when it is the
 * assessment's own provenance and every reported value is unchanged (e.g.
 * only the date was corrected). Otherwise the input must be a manual entry.
 */
export function updateBodyCompositionAssessment(
  assessment: BodyCompositionAssessment,
  input: BodyCompositionInput,
  { now, today }: Omit<BodyCompositionContext, 'id'>,
): BodyCompositionResult<BodyCompositionAssessment> {
  const created = createBodyCompositionAssessment(input, { id: assessment.id, now, today });
  if (!created.ok) {
    return created;
  }
  if (
    input.source.entryMethod !== 'manual' &&
    !(isSame(created.value.source, assessment.source) && isSame(created.value.reported, assessment.reported))
  ) {
    return { ok: false, errors: { source: 'imported-source' } };
  }
  return { ok: true, value: { ...created.value, createdAt: assessment.createdAt } };
}

/** Deep equality of plain JSON-like values, ignoring key order. */
function isSame(a: unknown, b: unknown): boolean {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return a === b;
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const keys = Object.keys(aRecord);
  return keys.length === Object.keys(bRecord).length && keys.every((key) => Object.hasOwn(bRecord, key) && isSame(aRecord[key], bRecord[key]));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

/**
 * Whether a stored object has no fields beyond `allowed`. A field this
 * version doesn't know (e.g. extra provenance from a newer version) makes
 * the assessment unreadable, so it is kept as stored instead of being shown
 * without that field.
 */
const hasOnlyKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(value).every((key) => allowed.includes(key));

function parseSource(value: unknown): BodyCompositionSource | null {
  if (!isRecord(value) || value['device'] !== 'inbody') {
    return null;
  }
  if (value['entryMethod'] === 'manual') {
    return hasOnlyKeys(value, ['device', 'entryMethod']) ? MANUAL_INBODY_SOURCE : null;
  }
  const parser = value['parser'];
  if (
    value['entryMethod'] !== 'import' ||
    !hasOnlyKeys(value, ['device', 'entryMethod', 'format', 'parser']) ||
    !isNonEmptyString(value['format']) ||
    !isRecord(parser) ||
    !hasOnlyKeys(parser, ['name', 'version']) ||
    !isNonEmptyString(parser['name']) ||
    !isNonEmptyString(parser['version'])
  ) {
    return null;
  }
  return { device: 'inbody', entryMethod: 'import', format: value['format'], parser: { name: parser['name'], version: parser['version'] } };
}

function parseReported(value: unknown): BodyCompositionValues | null {
  if (!isRecord(value)) {
    return null;
  }
  const reported: Partial<Record<BodyCompositionMetric, ReportedValue>> = {};
  for (const [metric, raw] of Object.entries(value)) {
    // An unknown metric or unit (e.g. from a newer app version) makes the whole assessment unreadable rather than silently dropped on edit.
    if (
      !isBodyCompositionMetric(metric) ||
      !isRecord(raw) ||
      !hasOnlyKeys(raw, ['value', 'unit']) ||
      typeof raw['value'] !== 'number' ||
      !isReportedUnit(raw['unit'])
    ) {
      return null;
    }
    const candidate: ReportedValue = { value: raw['value'], unit: raw['unit'] };
    if (valueProblem(metric, candidate)) {
      return null;
    }
    reported[metric] = candidate;
  }
  return Object.keys(reported).length > 0 ? reported : null;
}

/** Strict parser for a stored assessment; null when anything is missing, unknown or out of range. */
export function parseBodyCompositionAssessment(value: unknown): BodyCompositionAssessment | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ['id', 'date', 'source', 'reported', 'createdAt', 'updatedAt'])) {
    return null;
  }
  const source = parseSource(value['source']);
  const reported = parseReported(value['reported']);
  if (
    typeof value['id'] !== 'string' ||
    value['id'] === '' ||
    !parseIsoCalendarDate(value['date']) ||
    !source ||
    !reported ||
    !isInstant(value['createdAt']) ||
    !isInstant(value['updatedAt'])
  ) {
    return null;
  }
  return {
    id: value['id'],
    date: value['date'] as IsoCalendarDate,
    source,
    reported,
    createdAt: value['createdAt'],
    updatedAt: value['updatedAt'],
  };
}

/** Oldest first: assessment date, then record creation time, then id (stable across edits). */
export function compareBodyCompositionAssessments(a: BodyCompositionAssessment, b: BodyCompositionAssessment): number {
  if (a.date !== b.date) {
    return a.date < b.date ? -1 : 1;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export const sortBodyCompositionAssessments = (assessments: readonly BodyCompositionAssessment[]): BodyCompositionAssessment[] =>
  [...assessments].sort(compareBodyCompositionAssessments);
