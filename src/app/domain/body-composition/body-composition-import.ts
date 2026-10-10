import { IsoCalendarDate } from '../fitness-profile';
import {
  BODY_COMPOSITION_METRICS,
  BodyCompositionInput,
  BodyCompositionMetric,
  BodyCompositionProblem,
  ImportProvenance,
  ReportedValue,
  validateBodyCompositionInput,
} from './body-composition-assessment';

/**
 * The contract for importing a body-composition report (e.g. an InBody
 * PDF or export). No parser exists yet: no report format or field
 * definitions are established, so this only fixes what a parser hands back
 * and how the app classifies it. Nothing here reads files or creates or
 * stores an assessment.
 *
 * Four layers, never mixed:
 * - raw: the report content itself (`RawReport`), kept by the caller;
 * - reported: every field the parser found, label and text exactly as
 *   printed (`ReportedField`);
 * - normalized: the parser's reading of some of those fields as supported
 *   metrics (value + unit as stated, no conversion or rounding), each
 *   pointing back at its reported field;
 * - calculated: values the app computes are never part of an import.
 */

/** The report content as received, before any parsing. */
export interface RawReport {
  /** Declared media type, e.g. `application/pdf`. */
  readonly mediaType: string;
  readonly content: string | Uint8Array;
}

/** One field exactly as the report prints it. */
export interface ReportedField {
  readonly label: string;
  readonly text: string;
}

/** A normalized value: as stated by the report, plus the index of the field it was read from. */
export interface NormalizedValue extends ReportedValue {
  readonly field: number;
}

export interface ParsedReport {
  readonly provenance: ImportProvenance;
  /** Every field found, in report order; fields the parser could not map stay here. */
  readonly fields: readonly ReportedField[];
  readonly normalized: {
    /** The assessment date as a local calendar date; null when the report states none. */
    readonly date: { readonly value: string; readonly field: number } | null;
    readonly values: Readonly<Partial<Record<BodyCompositionMetric, NormalizedValue>>>;
  };
}

/** What a parser returns for one raw report. */
export type ReportReadResult =
  | { readonly kind: 'unsupported-format'; readonly mediaType: string }
  | { readonly kind: 'unreadable'; readonly reason: string }
  | { readonly kind: 'read'; readonly report: ParsedReport };

/** `unknown-field`: a normalized value points at a field the report does not have. */
export type ReportImportProblem = BodyCompositionProblem | 'unknown-field';
export type ReportImportErrors = Readonly<Partial<Record<BodyCompositionMetric | 'values' | 'date', ReportImportProblem>>>;

/**
 * - unsupported-format / unreadable: passed through from the parser;
 * - invalid-report: read, but the normalized data fails assessment
 *   validation; the full report is kept so nothing is silently dropped;
 * - parsed: read and valid.
 */
export type ReportImportOutcome =
  | Exclude<ReportReadResult, { readonly kind: 'read' }>
  | { readonly kind: 'invalid-report'; readonly report: ParsedReport; readonly errors: ReportImportErrors }
  | { readonly kind: 'parsed'; readonly report: ParsedReport };

const isFieldIndex = (report: ParsedReport, field: number): boolean =>
  Number.isInteger(field) && field >= 0 && field < report.fields.length;

/** Classifies a parser result with the same rules as manual entry; `today` is the user's local date. */
export function reportImportOutcome(read: ReportReadResult, today: IsoCalendarDate): ReportImportOutcome {
  if (read.kind !== 'read') {
    return read;
  }
  const { report } = read;
  const { date, values } = report.normalized;
  const errors: Partial<Record<BodyCompositionMetric | 'values' | 'date', ReportImportProblem>> = {
    ...validateBodyCompositionInput({ date: date?.value ?? '', values }, today),
  };
  for (const metric of BODY_COMPOSITION_METRICS) {
    const value = values[metric];
    if (value && !isFieldIndex(report, value.field)) {
      errors[metric] = 'unknown-field';
    }
  }
  if (date && !isFieldIndex(report, date.field)) {
    errors.date = 'unknown-field';
  }
  return Object.keys(errors).length > 0 ? { kind: 'invalid-report', report, errors } : { kind: 'parsed', report };
}

/** Reported fields no normalized value was read from, in report order. */
export function unmappedFields(report: ParsedReport): ReportedField[] {
  const used = new Set(BODY_COMPOSITION_METRICS.flatMap((metric) => report.normalized.values[metric]?.field ?? []));
  if (report.normalized.date) {
    used.add(report.normalized.date.field);
  }
  return report.fields.filter((_, index) => !used.has(index));
}

/**
 * The assessment input for a report: the normalized date and values (field
 * references dropped) with the report's provenance as source. Reported
 * fields and raw content are not carried over. Creating the assessment
 * validates the input again.
 */
export function bodyCompositionInputFromReport(report: ParsedReport): BodyCompositionInput {
  const values: Partial<Record<BodyCompositionMetric, ReportedValue>> = {};
  for (const metric of BODY_COMPOSITION_METRICS) {
    const value = report.normalized.values[metric];
    if (value) {
      values[metric] = { value: value.value, unit: value.unit };
    }
  }
  return { date: report.normalized.date?.value ?? '', source: report.provenance, values };
}
