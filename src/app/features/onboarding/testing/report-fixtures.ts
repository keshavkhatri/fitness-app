import { IsoCalendarDate } from '../../../domain/fitness-profile';
import {
  ExtractedField,
  InBodyExtraction,
  InBodyPrefill,
  ReportIssue,
  inBodyPrefill,
  parseInBodyExtraction,
} from '../../../domain/inbody-extraction';
import { SAMPLE_INBODY380_EXTRACTION } from '../../../domain/inbody-extraction/testing/sample-inbody380-extraction';
import { ReportReading } from '../state/report-import.service';

/** After the sample report's test date (2026-10-01). */
export const REPORT_TODAY = '2026-10-11' as IsoCalendarDate;

export const uncertain = (text: string, unit: string | null, sourceLabel: string): ExtractedField => ({
  status: 'uncertain',
  text,
  unit,
  sourceLabel,
});
export const unreadable = (sourceLabel: string | null = null): ExtractedField => ({ status: 'unreadable', text: null, unit: null, sourceLabel });
export const notOnReport: ExtractedField = { status: 'not-on-report', text: null, unit: null, sourceLabel: null };

export interface ExtractionOverrides {
  readonly outcome?: InBodyExtraction['outcome'];
  readonly reportIssues?: readonly ReportIssue[];
  readonly metadata?: Partial<Record<keyof InBodyExtraction['metadata'], ExtractedField>>;
  readonly profile?: Partial<Record<keyof InBodyExtraction['profile'], ExtractedField>>;
  readonly measurements?: Partial<Record<keyof InBodyExtraction['measurements'], ExtractedField>>;
}

/** The sample report's extraction as raw JSON (the way the server sends it), with overrides. */
export function rawExtraction(overrides: ExtractionOverrides = {}): unknown {
  const sample = SAMPLE_INBODY380_EXTRACTION;
  return {
    ...sample,
    outcome: overrides.outcome ?? sample.outcome,
    reportIssues: overrides.reportIssues ?? sample.reportIssues,
    metadata: { ...sample.metadata, ...overrides.metadata },
    profile: { ...sample.profile, ...overrides.profile },
    measurements: { ...sample.measurements, ...overrides.measurements },
  };
}

/** A report the model rejected: no values at all. */
export function rejectedExtraction(outcome: 'unsupported-report' | 'insufficient-readable-information', reportIssues: readonly ReportIssue[] = []): unknown {
  const empty = (group: Record<string, unknown>) => Object.fromEntries(Object.keys(group).map((id) => [id, notOnReport]));
  const sample = SAMPLE_INBODY380_EXTRACTION;
  return {
    ...sample,
    outcome,
    reportIssues,
    metadata: empty(sample.metadata),
    profile: empty(sample.profile),
    measurements: empty(sample.measurements),
  };
}

/** A validated extraction and its suggestions, as the report import holds them. */
export function reportReading(overrides: ExtractionOverrides = {}): ReportReading {
  const parsed = parseInBodyExtraction(rawExtraction(overrides));
  if (!parsed.ok) {
    throw new Error(`Invalid test extraction: ${parsed.errors.map((e) => `${e.path} ${e.problem}`).join(', ')}`);
  }
  const prefill = inBodyPrefill(parsed.value, REPORT_TODAY);
  if (prefill.kind !== 'prefill') {
    throw new Error('Test extraction has nothing to prefill.');
  }
  return { extraction: parsed.value, prefill: prefill as InBodyPrefill };
}
