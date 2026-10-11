import {
  BODY_COMPOSITION_METRICS,
  BodyCompositionMetric,
  ImportProvenance,
  ReportedValue,
  isReportedUnit,
  validateBodyCompositionInput,
} from '../body-composition';
import {
  BodyHeight,
  BodyWeight,
  IsoCalendarDate,
  Sex,
  UserFitnessProfile,
  heightFromCentimeters,
  parseBodyHeight,
  parseBodyWeight,
  parseDecimal,
  toIsoCalendarDate,
  weightFromKilograms,
  weightFromPounds,
} from '../fitness-profile';
import {
  EXTRACTION_FIELD_IDS,
  ExtractedField,
  INBODY_EXTRACTION_SCHEMA_VERSION,
  ExtractionFieldId,
  ExtractionOutcome,
  InBodyExtraction,
  ReportIssue,
  extractedField,
  hasValue,
} from './inbody-extraction-contract';

/**
 * From a validated extraction to suggestions for the existing models: the
 * onboarding answers a report can state, and the values of a body-composition
 * assessment. Suggestions only: nothing here saves, replaces a profile or
 * touches the weight history, and every suggestion is for the user to
 * review and correct before anything is saved.
 *
 * Mapped (supported by the InBody380 sample):
 * - Height (cm) → profile height; Gender (Male/Female) → profile sex;
 *   Weight (kg/lb) → profile weight, converted to the profile's kilograms;
 * - Test Date / Time → assessment date; every measurement → the assessment
 *   metric of the same quantity, as reported (PBF → `body-fat-percentage`,
 *   unitless values in unit `none`).
 *
 * Not mapped:
 * - Age: the profile stores a date of birth, which an age can't give;
 * - lean body mass: no report field is that quantity. Fat Free Mass is its
 *   own metric and is never stored as lean body mass.
 * Values calculated by the app (assessments, targets, …) are never read
 * from a report.
 */

/**
 * - not-on-report / unreadable: as the model said;
 * - unrecognised: read, but not in a form this version understands
 *   (e.g. a gender other than Male/Female, a date in another format);
 * - out-of-range: outside the app's plausibility rules (or a future date).
 */
export type PrefillProblem = 'not-on-report' | 'unreadable' | 'unrecognised' | 'out-of-range';

/** A suggested answer, pointing at the report field it came from. */
export type Prefill<T> =
  | {
      readonly kind: 'prefilled';
      readonly value: T;
      readonly field: ExtractionFieldId;
      /** The model was unsure of this reading: highlight it for the user to check. */
      readonly needsReview: boolean;
    }
  | { readonly kind: 'missing'; readonly field: ExtractionFieldId; readonly reason: PrefillProblem };

/** Onboarding answers a report never states: always asked for. */
export const MANUAL_PROFILE_ANSWERS = [
  'primaryGoal',
  'dateOfBirth',
  'trainingExperience',
  'trainingDaysPerWeek',
  'trainingLocation',
  'equipment',
  'activityLevel',
  'goalTarget',
] as const satisfies readonly (keyof UserFitnessProfile)[];

/** Assessment metric ← report field. `lean-body-mass` has no source (see above). */
export const ASSESSMENT_FIELDS: Readonly<Partial<Record<BodyCompositionMetric, ExtractionFieldId>>> = {
  weight: 'weight',
  'body-fat-mass': 'body-fat-mass',
  'body-fat-percentage': 'percent-body-fat',
  'skeletal-muscle-mass': 'skeletal-muscle-mass',
  'fat-free-mass': 'fat-free-mass',
  'soft-lean-mass': 'soft-lean-mass',
  bmi: 'bmi',
  'visceral-fat-level': 'visceral-fat-level',
  'basal-metabolic-rate': 'basal-metabolic-rate',
  'total-body-water': 'total-body-water',
  'intracellular-water': 'intracellular-water',
  'extracellular-water': 'extracellular-water',
  'ecw-ratio': 'ecw-ratio',
  protein: 'protein',
  minerals: 'minerals',
  'bone-mineral-content': 'bone-mineral-content',
  'body-cell-mass': 'body-cell-mass',
  smi: 'smi',
  'phase-angle': 'phase-angle',
  'waist-hip-ratio': 'waist-hip-ratio',
  'obesity-degree': 'obesity-degree',
};

/**
 * The source of an assessment saved exactly as read from a report image.
 * Values the user changed or added are never labelled with it: such an
 * assessment is saved as a manual entry.
 */
export const INBODY_AI_PROVENANCE: ImportProvenance = {
  device: 'inbody',
  entryMethod: 'import',
  format: INBODY_EXTRACTION_SCHEMA_VERSION,
  parser: { name: 'inbody-ai-extraction', version: '1' },
};

const PROFILE_FIELDS = ['height', 'gender', 'weight'] as const satisfies readonly ExtractionFieldId[];
/** The only layout this mapping has been checked against. */
export const VERIFIED_REPORT_MODELS = ['InBody380'] as const;

export interface InBodyPrefill {
  readonly kind: 'prefill';
  readonly reportIssues: readonly ReportIssue[];
  /** The report's model isn't one this mapping was checked against: review everything with extra care. */
  readonly unverifiedReportModel: boolean;
  readonly profile: {
    readonly sex: Prefill<Sex>;
    readonly height: Prefill<BodyHeight>;
    readonly weight: Prefill<BodyWeight>;
  };
  readonly assessment: {
    readonly date: Prefill<IsoCalendarDate>;
    readonly values: Readonly<Partial<Record<BodyCompositionMetric, Prefill<ReportedValue>>>>;
  };
  /** Fields with a value that nothing above uses (shown for reference, never saved). */
  readonly unmapped: readonly ExtractionFieldId[];
}

/** The model rejected the report: nothing to prefill, manual entry only. */
export interface NoPrefill {
  readonly kind: 'no-prefill';
  readonly outcome: Exclude<ExtractionOutcome, 'extracted'>;
  readonly reportIssues: readonly ReportIssue[];
}

const missing = (field: ExtractionFieldId, reason: PrefillProblem): Prefill<never> => ({ kind: 'missing', field, reason });

/** A reader's result: the value, or why the printed text can't be used. */
type Reading<T> = { readonly value: T } | { readonly problem: PrefillProblem };
type PrintedValue = { readonly text: string; readonly unit: string | null };

/** Reads one field's value with `read`, or says why there is none. */
function prefill<T>(
  extraction: InBodyExtraction,
  id: ExtractionFieldId,
  read: (printed: PrintedValue) => Reading<T>,
): Prefill<T> {
  const field: ExtractedField = extractedField(extraction, id);
  if (!hasValue(field) || field.text === null) {
    return missing(id, field.status === 'unreadable' ? 'unreadable' : 'not-on-report');
  }
  const reading = read({ text: field.text, unit: field.unit });
  return 'problem' in reading
    ? missing(id, reading.problem)
    : { kind: 'prefilled', value: reading.value, field: id, needsReview: field.status === 'uncertain' };
}

const problem = (reason: PrefillProblem) => ({ problem: reason });
const orProblem = <T>(value: T | null, reason: PrefillProblem): Reading<T> => (value === null ? problem(reason) : { value });

const SEX_BY_GENDER: Readonly<Record<string, Sex>> = { male: 'male', female: 'female' };

function readSex({ text }: PrintedValue): Reading<Sex> {
  return orProblem(SEX_BY_GENDER[text.trim().toLowerCase()] ?? null, 'unrecognised');
}

function readHeight({ text }: PrintedValue): Reading<BodyHeight> {
  const centimeters = parseDecimal(text);
  return centimeters === null ? problem('unrecognised') : orProblem(parseBodyHeight(heightFromCentimeters(centimeters)), 'out-of-range');
}

function readProfileWeight({ text, unit }: PrintedValue): Reading<BodyWeight> {
  const value = parseDecimal(text);
  if (value === null) {
    return problem('unrecognised');
  }
  return orProblem(parseBodyWeight(unit === 'lb' ? weightFromPounds(value) : weightFromKilograms(value)), 'out-of-range');
}

/** "2026.09.14. 07:42" (year first, as InBody prints it); other date orders are never guessed. */
const PRINTED_DATE = /^(\d{4})\.(\d{2})\.(\d{2})\.?(?:\s+\d{2}:\d{2})?$/;

function readDate(today: IsoCalendarDate) {
  return ({ text }: PrintedValue): Reading<IsoCalendarDate> => {
    const match = PRINTED_DATE.exec(text.trim());
    const date = match && toIsoCalendarDate({ year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) });
    if (!date) {
      return problem('unrecognised');
    }
    return date > today ? problem('out-of-range') : { value: date };
  };
}

/** As reported (no conversion), and only if manual entry would accept it. */
function readReported(metric: BodyCompositionMetric, today: IsoCalendarDate) {
  return ({ text, unit }: PrintedValue): Reading<ReportedValue> => {
    const value = parseDecimal(text);
    unit ??= 'none';
    if (value === null || !isReportedUnit(unit)) {
      return problem('unrecognised');
    }
    const reported: ReportedValue = { value, unit };
    const errors = validateBodyCompositionInput({ date: today, values: { [metric]: reported } }, today);
    return errors[metric] ? problem('out-of-range') : { value: reported };
  };
}

/**
 * Suggestions from a validated extraction; `today` is the user's local date
 * (a report dated later is not used).
 */
export function inBodyPrefill(extraction: InBodyExtraction, today: IsoCalendarDate): InBodyPrefill | NoPrefill {
  if (extraction.outcome !== 'extracted') {
    return { kind: 'no-prefill', outcome: extraction.outcome, reportIssues: extraction.reportIssues };
  }
  const values: Partial<Record<BodyCompositionMetric, Prefill<ReportedValue>>> = {};
  for (const metric of BODY_COMPOSITION_METRICS) {
    const id = ASSESSMENT_FIELDS[metric];
    if (id) {
      values[metric] = prefill(extraction, id, readReported(metric, today));
    }
  }
  const used = new Set<ExtractionFieldId>([...PROFILE_FIELDS, 'test-date-time', 'report-model', ...Object.values(ASSESSMENT_FIELDS)]);
  const model = extractedField(extraction, 'report-model');
  return {
    kind: 'prefill',
    reportIssues: extraction.reportIssues,
    unverifiedReportModel: !(model.status === 'read' && (VERIFIED_REPORT_MODELS as readonly string[]).includes(model.text?.trim() ?? '')),
    profile: {
      sex: prefill(extraction, 'gender', readSex),
      height: prefill(extraction, 'height', readHeight),
      weight: prefill(extraction, 'weight', readProfileWeight),
    },
    assessment: { date: prefill(extraction, 'test-date-time', readDate(today)), values },
    unmapped: EXTRACTION_FIELD_IDS.filter((id) => !used.has(id) && hasValue(extractedField(extraction, id))),
  };
}
