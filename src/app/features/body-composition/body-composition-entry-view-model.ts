import {
  BODY_COMPOSITION_METRICS,
  BodyCompositionErrors,
  BodyCompositionInput,
  BodyCompositionMetric,
  MANUAL_INBODY_SOURCE,
  METRIC_QUANTITY,
  ReportedValue,
} from '../../domain/body-composition';
import { IsoCalendarDate, UnitSystem, WEIGHT_KG, parseDecimalInput, weightInUnit } from '../../domain/fitness-profile';
import { NUMBER_FORMAT_ERROR } from '../nutrition/nutrition-content';
import { weightRangeText } from '../onboarding/validation/onboarding-validation';
import { BODY_COMPOSITION_COPY } from './body-composition-content';

/**
 * Presentation for the manual body-composition form. Validation comes from
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
  return { weight: '', 'body-fat-mass': '', 'lean-body-mass': '', 'body-fat-percentage': '', date: today, massUnit };
}

export interface ReadBodyCompositionForm {
  readonly input: BodyCompositionInput;
  /** Metrics whose text was ambiguous ("1,234"); never saved. */
  readonly formatErrors: Readonly<Partial<Record<BodyCompositionMetric, string>>>;
}

/** Typed text → manual-entry domain input via the shared strict decimal parser. */
export function readBodyCompositionForm(form: BodyCompositionFormValues): ReadBodyCompositionForm {
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
    const unit = METRIC_QUANTITY[metric] === 'percentage' ? '%' : form.massUnit;
    values[metric] = { value: parsed.kind === 'number' ? parsed.value : Number.NaN, unit };
  }
  return { input: { date: form.date, source: MANUAL_INBODY_SOURCE, values }, formatErrors };
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
      if (METRIC_QUANTITY[metric] === 'percentage') {
        messages[metric] = e.percentageRange;
      } else if (metric === 'weight') {
        messages[metric] = e.weightRange(weightRangeText(unitSystemOf(massUnit)));
      } else {
        messages[metric] = e.massRange(label, maxMassText(massUnit));
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
