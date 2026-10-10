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
 * Provisional on purpose (no report format is established yet):
 * - the metric catalogue holds only general body-composition quantities;
 *   further report fields need a confirmed report format;
 * - `source` is a manual entry from an InBody report or an import with its
 *   provenance (see body-composition-import.ts); no parser exists yet.
 */

/** Supported metrics, in display order. Each has one quantity kind, which decides its allowed units. */
export const BODY_COMPOSITION_METRICS = ['weight', 'body-fat-mass', 'lean-body-mass', 'body-fat-percentage'] as const;
export type BodyCompositionMetric = (typeof BODY_COMPOSITION_METRICS)[number];
export const isBodyCompositionMetric = isOneOf(BODY_COMPOSITION_METRICS);

export type BodyCompositionQuantity = 'mass' | 'percentage';
export const METRIC_QUANTITY: Readonly<Record<BodyCompositionMetric, BodyCompositionQuantity>> = {
  weight: 'mass',
  'body-fat-mass': 'mass',
  'lean-body-mass': 'mass',
  'body-fat-percentage': 'percentage',
};

export const MASS_UNITS = ['kg', 'lb'] as const;
export const REPORTED_UNITS = [...MASS_UNITS, '%'] as const;
export type ReportedUnit = (typeof REPORTED_UNITS)[number];
export const isReportedUnit = isOneOf(REPORTED_UNITS);

const UNITS_BY_QUANTITY: Readonly<Record<BodyCompositionQuantity, readonly ReportedUnit[]>> = {
  mass: MASS_UNITS,
  percentage: ['%'],
};

/** Whether `unit` is a valid unit for `metric` (a mass in kg/lb, a percentage in %). */
export function isUnitFor(metric: BodyCompositionMetric, unit: ReportedUnit): boolean {
  return UNITS_BY_QUANTITY[METRIC_QUANTITY[metric]].includes(unit);
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

export type BodyCompositionProblem = 'not-a-number' | 'out-of-range' | 'wrong-unit' | 'required' | 'invalid-date' | 'future-date';
/** `values: 'required'` means no metric was filled in. */
export type BodyCompositionErrors = Readonly<Partial<Record<BodyCompositionMetric | 'values' | 'date', BodyCompositionProblem>>>;
export type BodyCompositionResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: BodyCompositionErrors };

/**
 * Plausibility only (typos, impossible values), not reference ranges:
 * - weight: the profile's body-weight range;
 * - other masses: above 0, at most the largest plausible body weight;
 * - percentages: above 0 and below 100.
 * Values are never checked against each other (that would need a formula).
 */
function isPlausible(metric: BodyCompositionMetric, { value, unit }: ReportedValue): boolean {
  if (unit === '%') {
    return value > 0 && value < 100;
  }
  const kilograms = unit === 'kg' ? value : value / POUNDS_PER_KILOGRAM;
  return metric === 'weight' ? isWithin(kilograms, WEIGHT_KG) : kilograms > 0 && kilograms <= WEIGHT_KG.max;
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

/** A new version of an assessment: same id and creation time; everything else replaced. */
export function updateBodyCompositionAssessment(
  assessment: BodyCompositionAssessment,
  input: BodyCompositionInput,
  { now, today }: Omit<BodyCompositionContext, 'id'>,
): BodyCompositionResult<BodyCompositionAssessment> {
  const created = createBodyCompositionAssessment(input, { id: assessment.id, now, today });
  return created.ok ? { ok: true, value: { ...created.value, createdAt: assessment.createdAt } } : created;
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
