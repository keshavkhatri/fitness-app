import { toFeetInches, weightInUnit } from '../../../domain/fitness-profile';
import {
  ExtractedField,
  InBodyExtraction,
  Prefill,
  PrefillProblem,
  ReportIssue,
  extractedField,
  hasValue,
} from '../../../domain/inbody-extraction';
import { BasicsField, BasicsFormInput } from '../validation/onboarding-validation';
import { ReportImportFailure, ReportReading } from './report-import.service';

/**
 * What the onboarding screens say about an uploaded InBody report: the
 * prefilled basics form, a note per field and the copy for every failure.
 * Pure: no Angular, no DOM.
 *
 * Only height, weight and sex come from the report (see inBodyPrefill). The
 * date of birth never does: an age can't give one. Report measurements stay
 * on the report: nothing here adds them to the profile or the weight history.
 */

/**
 * The basics form with the report's values in place of the user's. Fields
 * the report couldn't fill keep whatever the user already entered.
 */
export function applyReportPrefill(form: BasicsFormInput, { profile }: ReportReading['prefill']): BasicsFormInput {
  let next = form;
  if (profile.sex.kind === 'prefilled') {
    next = { ...next, sex: profile.sex.value };
  }
  if (profile.height.kind === 'prefilled') {
    const height = profile.height.value;
    const { feet, inches } = toFeetInches(height);
    // To 0.1 cm, as printed: the form's own whole-cm rounding would change the reading.
    next = { ...next, heightCm: String(Math.round(height.centimeters * 10) / 10), heightFeet: String(feet), heightInches: String(inches) };
  }
  if (profile.weight.kind === 'prefilled') {
    next = { ...next, weight: String(weightInUnit(profile.weight.value, next.unitSystem)) };
  }
  return next;
}

/**
 * - read: filled in from the report;
 * - check: filled in, but the reading was uncertain: the user must check it;
 * - missing: not filled in from the report: the user enters it.
 */
export type ReportNoteTone = 'read' | 'check' | 'missing';

export interface ReportFieldNote {
  readonly tone: ReportNoteTone;
  readonly text: string;
}

/** The value as printed, e.g. "180 cm" or "Male". */
const printed = (field: ExtractedField): string => [field.text, field.unit].filter(Boolean).join(' ');

const MISSING_NOTES: Readonly<Record<PrefillProblem, (value: string) => string>> = {
  'not-on-report': () => 'Not found on your report. Enter it yourself.',
  unreadable: () => "Couldn't be read from your report. Enter it yourself.",
  unrecognised: (value) => `Your report shows “${value}”, which couldn't be used. Enter it yourself.`,
  'out-of-range': (value) => `Your report shows ${value}, which is outside the range the app accepts. Check it and enter it yourself.`,
};

function fieldNote(prefill: Prefill<unknown>, extraction: InBodyExtraction): ReportFieldNote {
  const value = printed(extractedField(extraction, prefill.field));
  if (prefill.kind === 'missing') {
    return { tone: 'missing', text: MISSING_NOTES[prefill.reason](value) };
  }
  return prefill.needsReview
    ? { tone: 'check', text: `Check this: the report reading (${value}) may not be accurate.` }
    : { tone: 'read', text: `From your report: ${value}` };
}

/** A note for each basics field, saying what the report gave for it. */
export function reportFieldNotes({ extraction, prefill }: ReportReading): Readonly<Record<BasicsField, ReportFieldNote>> {
  const age = extractedField(extraction, 'age');
  return {
    dateOfBirth: {
      tone: 'missing',
      text: hasValue(age)
        ? `Your report lists age ${age.text}. Enter your date of birth: it isn't worked out from an age.`
        : "Your report doesn't include a date of birth. Enter it yourself.",
    },
    sex: fieldNote(prefill.profile.sex, extraction),
    height: fieldNote(prefill.profile.height, extraction),
    weight: fieldNote(prefill.profile.weight, extraction),
  };
}

const REPORT_ISSUE_TEXT: Readonly<Record<ReportIssue, string>> = {
  'low-image-quality': 'The image quality was low, so values may have been misread.',
  'partially-cropped': 'Part of the report was cut off.',
  'multiple-reports': 'The image showed more than one report.',
};

export const reportIssueText = (issues: readonly ReportIssue[]): string[] => issues.map((issue) => REPORT_ISSUE_TEXT[issue]);

const reportDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export interface ReportReviewSummary {
  /** The report's test date, for display only; null when it couldn't be used. */
  readonly testDate: string | null;
  /** Basics filled in from the report, and how many of those need checking. */
  readonly filled: number;
  readonly needsCheck: number;
  /** Whole-report problems the user should know about before trusting any value. */
  readonly warnings: readonly string[];
}

export function reportReviewSummary({ prefill }: ReportReading): ReportReviewSummary {
  const fields = [prefill.profile.sex, prefill.profile.height, prefill.profile.weight];
  const date = prefill.assessment.date;
  return {
    testDate: date.kind === 'prefilled' ? reportDate.format(new Date(`${date.value}T00:00:00Z`)) : null,
    filled: fields.filter((field) => field.kind === 'prefilled').length,
    needsCheck: fields.filter((field) => field.kind === 'prefilled' && field.needsReview).length,
    warnings: [
      ...reportIssueText(prefill.reportIssues),
      ...(prefill.unverifiedReportModel ? ["This report layout hasn't been checked with the app yet. Check every value carefully."] : []),
    ],
  };
}

export interface ReportFailureCopy {
  readonly title: string;
  readonly message: string;
}

const MANUAL = 'or enter your details manually.';

/** What went wrong, and what the user can do about it. */
export const REPORT_FAILURE_COPY: Readonly<Record<ReportImportFailure, ReportFailureCopy>> = {
  'unsupported-type': {
    title: "This file type isn't supported",
    message: "Choose a PNG, JPEG or WEBP image of your report. PDFs aren't supported yet.",
  },
  'too-large': {
    title: 'This image is too large',
    message: 'Choose an image under 8 MB, such as a screenshot or a smaller photo of the report.',
  },
  empty: { title: 'This file is empty', message: 'Choose the report image again.' },
  'rejected-file': {
    title: "This image couldn't be opened",
    message: `Choose another PNG, JPEG or WEBP image of your report, ${MANUAL}`,
  },
  'unsupported-report': {
    title: "This doesn't look like an InBody report",
    message: `Upload a photo of an InBody results sheet, ${MANUAL}`,
  },
  'insufficient-readable-information': {
    title: "We couldn't read this report",
    message: `Try a sharp, well-lit photo of the whole sheet, ${MANUAL}`,
  },
  network: {
    title: "Couldn't reach the report service",
    message: `Check your connection and try again, ${MANUAL}`,
  },
  busy: {
    title: 'Too many uploads right now',
    message: `Wait a few minutes and try again, ${MANUAL}`,
  },
  refused: {
    title: "The AI service didn't read this image",
    message: `Try again or choose another image, ${MANUAL}`,
  },
  service: {
    title: 'Something went wrong reading your report',
    message: `Try again in a moment, ${MANUAL}`,
  },
  'invalid-response': {
    title: "We couldn't use the result",
    message: `The report was read, but the result didn't pass our checks, so nothing was filled in. Try again, ${MANUAL}`,
  },
  unavailable: {
    title: "Report upload isn't available",
    message: 'Enter your details manually instead.',
  },
};
