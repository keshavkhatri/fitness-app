import {
  BODY_COMPOSITION_METRICS,
  BodyCompositionAssessment,
  BodyCompositionErrors,
  BodyCompositionInput,
  BodyCompositionMetric,
  BodyCompositionSource,
  MANUAL_INBODY_SOURCE,
  METRIC_QUANTITY,
  PLAUSIBLE_MAX,
  ReportedUnit,
  ReportedValue,
  fixedUnitOf,
} from '../../domain/body-composition';
import { INBODY_AI_PROVENANCE, InBodyPrefill } from '../../domain/inbody-extraction';
import { IsoCalendarDate, UnitSystem, WEIGHT_KG, parseDecimalInput, weightInUnit } from '../../domain/fitness-profile';
import { NUMBER_FORMAT_ERROR } from '../nutrition/nutrition-content';
import { weightRangeText } from '../onboarding/validation/onboarding-validation';
import { BODY_COMPOSITION_COPY } from './body-composition-content';

/**
 * Presentation for the body-composition form (typed in, or prefilled from
 * an uploaded report for review). Validation comes from
 * the domain; this only maps typed text to domain input and domain problems
 * to messages. Values are kept exactly as typed, in the report's unit: no
 * conversion or rounding.
 */

const copy = BODY_COMPOSITION_COPY;

export type MassUnit = 'kg' | 'lb';

/** As typed: each metric as printed on the report (blank = not on the report); date YYYY-MM-DD. */
export type BodyCompositionFormValues = Readonly<Record<BodyCompositionMetric | 'date', string>> & { readonly massUnit: MassUnit };

/** `values` is the "enter at least one" message for the whole group. */
export type BodyCompositionFormErrors = Readonly<Partial<Record<BodyCompositionMetric | 'date' | 'values', string>>>;

/** The report's mass unit is usually the one the user reads weights in. */
export const defaultMassUnit = (unitSystem: UnitSystem | null): MassUnit => (unitSystem === 'imperial' ? 'lb' : 'kg');

export function emptyBodyCompositionForm(today: IsoCalendarDate, massUnit: MassUnit): BodyCompositionFormValues {
  const blank = Object.fromEntries(BODY_COMPOSITION_METRICS.map((metric) => [metric, ''])) as Record<BodyCompositionMetric, string>;
  return { ...blank, date: today, massUnit };
}

/** The unit a metric's field is entered in: the report's mass unit for masses, else the metric's only unit. */
export const formUnitOf = (metric: BodyCompositionMetric, massUnit: MassUnit): ReportedUnit => fixedUnitOf(metric) ?? massUnit;

/** The unit shown next to a field or value; nothing for unitless values. */
export const unitLabelOf = (unit: ReportedUnit): string => (unit === 'none' ? '' : unit);

export interface ReadBodyCompositionForm {
  readonly input: BodyCompositionInput;
  /** Metrics whose text was ambiguous ("1,234"); never saved. */
  readonly formatErrors: Readonly<Partial<Record<BodyCompositionMetric, string>>>;
}

/**
 * Typed text → domain input via the shared strict decimal parser. Saved as
 * a manual entry unless `source` says otherwise (values saved exactly as
 * read from a report).
 */
export function readBodyCompositionForm(
  form: BodyCompositionFormValues,
  source: BodyCompositionSource = MANUAL_INBODY_SOURCE,
): ReadBodyCompositionForm {
  const values: Partial<Record<BodyCompositionMetric, ReportedValue | null>> = {};
  const formatErrors: Partial<Record<BodyCompositionMetric, string>> = {};
  for (const metric of BODY_COMPOSITION_METRICS) {
    const parsed = parseDecimalInput(form[metric]);
    if (parsed.kind === 'empty') {
      values[metric] = null;
      continue;
    }
    if (parsed.kind === 'ambiguous') {
      formatErrors[metric] = NUMBER_FORMAT_ERROR;
    }
    values[metric] = { value: parsed.kind === 'number' ? parsed.value : Number.NaN, unit: formUnitOf(metric, form.massUnit) };
  }
  return { input: { date: form.date, source, values }, formatErrors };
}

const unitSystemOf = (massUnit: MassUnit): UnitSystem => (massUnit === 'lb' ? 'imperial' : 'metric');

/** Component masses are checked against the largest plausible body weight; rounded down so the shown value is accepted. */
const maxMassText = (massUnit: MassUnit): string =>
  `${Math.floor(weightInUnit({ kilograms: WEIGHT_KG.max }, unitSystemOf(massUnit))).toLocaleString('en-US')} ${massUnit}`;

export function bodyCompositionFormErrorsOf(
  errors: BodyCompositionErrors,
  massUnit: MassUnit,
  formatErrors: ReadBodyCompositionForm['formatErrors'] = {},
): BodyCompositionFormErrors {
  const e = copy.form.errors;
  const messages: Partial<Record<BodyCompositionMetric | 'date' | 'values', string>> = {};
  for (const metric of BODY_COMPOSITION_METRICS) {
    const label = copy.metrics[metric];
    if (formatErrors[metric]) {
      messages[metric] = formatErrors[metric];
    } else if (errors[metric] === 'not-a-number') {
      messages[metric] = e.number(label);
    } else if (errors[metric] === 'out-of-range' || errors[metric] === 'wrong-unit') {
      if (metric === 'body-fat-percentage') {
        messages[metric] = e.percentageRange;
      } else if (metric === 'ecw-ratio') {
        messages[metric] = e.ratioRange(label);
      } else if (metric === 'weight') {
        messages[metric] = e.weightRange(weightRangeText(unitSystemOf(massUnit)));
      } else if (METRIC_QUANTITY[metric] === 'mass' || METRIC_QUANTITY[metric] === 'mass-change') {
        messages[metric] = e.massRange(label, maxMassText(massUnit));
      } else {
        const unit = unitLabelOf(formUnitOf(metric, massUnit));
        messages[metric] = e.range(label, `${(PLAUSIBLE_MAX[metric] ?? 0).toLocaleString('en-US')}${unit ? ` ${unit}` : ''}`);
      }
    }
  }
  if (errors.values === 'required') {
    messages.values = e.required;
  }
  switch (errors.date) {
    case 'required':
      messages.date = e.dateRequired;
      break;
    case 'invalid-date':
      messages.date = e.dateInvalid;
      break;
    case 'future-date':
      messages.date = e.dateFuture;
      break;
  }
  return messages;
}

/** A field filled in from an uploaded report; `check` marks an uncertain reading. */
export type ReportPrefillNotes = Readonly<Partial<Record<BodyCompositionMetric, 'read' | 'check'>>>;

export interface ReportPrefilledForm {
  readonly form: BodyCompositionFormValues;
  readonly notes: ReportPrefillNotes;
  readonly filled: number;
  readonly toCheck: number;
}

/**
 * The form filled in from a report reading, for review. Masses use the
 * unit of the report's first mass value; a mass printed in the other unit
 * is left blank (values are never converted). Fields the report didn't give
 * are left blank, and the date stays as it was without a usable test date.
 */
export function prefillBodyCompositionForm(
  { assessment }: InBodyPrefill,
  today: IsoCalendarDate,
  fallbackMassUnit: MassUnit,
): ReportPrefilledForm {
  const prefilled = BODY_COMPOSITION_METRICS.flatMap((metric) => {
    const p = assessment.values[metric];
    return p?.kind === 'prefilled' ? [{ metric, value: p.value, check: p.needsReview }] : [];
  });
  const firstMass = prefilled.find(({ value }) => value.unit === 'kg' || value.unit === 'lb');
  const massUnit = (firstMass?.value.unit as MassUnit | undefined) ?? fallbackMassUnit;
  const date = assessment.date.kind === 'prefilled' ? assessment.date.value : today;
  let form: BodyCompositionFormValues = emptyBodyCompositionForm(date, massUnit);
  const notes: Partial<Record<BodyCompositionMetric, 'read' | 'check'>> = {};
  for (const { metric, value, check } of prefilled) {
    if (value.unit !== formUnitOf(metric, massUnit)) {
      continue;
    }
    form = { ...form, [metric]: String(value.value) };
    notes[metric] = check ? 'check' : 'read';
  }
  const values = Object.values(notes);
  return { form, notes, filled: values.length, toCheck: values.filter((n) => n === 'check').length };
}

const BODY_COMPOSITION_FIELDS = [...BODY_COMPOSITION_METRICS, 'date', 'massUnit'] as const;

/** Saved as read from the report only when nothing was changed or added; otherwise it is the user's entry. */
export const reviewedSource = (form: BodyCompositionFormValues, prefilled: BodyCompositionFormValues | null): BodyCompositionSource =>
  prefilled && BODY_COMPOSITION_FIELDS.every((field) => form[field] === prefilled[field]) ? INBODY_AI_PROVENANCE : MANUAL_INBODY_SOURCE;

/**
 * A saved assessment as the form shows it, for editing: each value exactly
 * as stored (no conversion), masses in the unit the report used.
 */
export function bodyCompositionFormOf(assessment: BodyCompositionAssessment, fallbackMassUnit: MassUnit): BodyCompositionFormValues {
  const firstMass = BODY_COMPOSITION_METRICS.map((metric) => assessment.reported[metric]?.unit).find((unit) => unit === 'kg' || unit === 'lb');
  let form: BodyCompositionFormValues = emptyBodyCompositionForm(assessment.date, firstMass ?? fallbackMassUnit);
  for (const metric of BODY_COMPOSITION_METRICS) {
    const reported = assessment.reported[metric];
    if (reported) {
      form = { ...form, [metric]: String(reported.value) };
    }
  }
  return form;
}

/** An edit keeps the assessment's source while its values are unchanged (a corrected date only); any value change makes it a manual entry. */
export const editedSource = (form: BodyCompositionFormValues, saved: BodyCompositionFormValues, source: BodyCompositionSource): BodyCompositionSource =>
  [...BODY_COMPOSITION_METRICS, 'massUnit' as const].every((field) => form[field] === saved[field]) ? source : MANUAL_INBODY_SOURCE;
