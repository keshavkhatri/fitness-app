import {
  MEASUREMENT_CM,
  MEASUREMENT_SITES,
  MeasurementEntry,
  MeasurementEntryErrors,
  MeasurementEntryInput,
  MeasurementSite,
  circumferenceFromUnit,
  circumferenceInUnit,
  lengthUnitLabel,
} from '../../domain/body-measurements';
import { CM_PER_INCH, IsoCalendarDate, UnitSystem, parseDecimalInput } from '../../domain/fitness-profile';
import { NUMBER_FORMAT_ERROR } from '../nutrition/nutrition-content';
import { MEASUREMENT_COPY } from './measurement-content';

/**
 * Presentation for the measurement entry form. Validation and conversion
 * come from the domain; this only maps typed text to domain input and
 * domain problems to messages, in the user's unit.
 */

const copy = MEASUREMENT_COPY;

/** As typed: each site in the unit system's length unit (blank = not measured); date YYYY-MM-DD. */
export type MeasurementFormValues = Readonly<Record<MeasurementSite | 'date', string>>;

/** `values` is the "enter at least one" message for the whole group. */
export type MeasurementFormErrors = Readonly<Partial<Record<MeasurementSite | 'date' | 'values', string>>>;

export function emptyMeasurementForm(today: IsoCalendarDate): MeasurementFormValues {
  return { waist: '', chest: '', hips: '', arm: '', thigh: '', date: today };
}

const siteText = (entry: MeasurementEntry, site: MeasurementSite, unitSystem: UnitSystem) => {
  const value = entry.values[site];
  return value ? String(circumferenceInUnit(value, unitSystem)) : '';
};

export function measurementFormOf(entry: MeasurementEntry, unitSystem: UnitSystem): MeasurementFormValues {
  const form: Record<MeasurementSite | 'date', string> = { ...emptyMeasurementForm(entry.date) };
  for (const site of MEASUREMENT_SITES) {
    form[site] = siteText(entry, site, unitSystem);
  }
  return form;
}

export interface ReadMeasurementForm {
  readonly input: MeasurementEntryInput;
  /** Sites whose text was ambiguous ("1,234"); never saved. */
  readonly formatErrors: Readonly<Partial<Record<MeasurementSite, string>>>;
}

/**
 * Typed text → domain input via the shared strict parser. When editing, the
 * input is given in centimeters so that sites whose text is unchanged keep
 * their stored centimeters exactly (not re-rounded through inches); changed
 * sites are converted with the domain's conversion.
 */
export function readMeasurementForm(values: MeasurementFormValues, unitSystem: UnitSystem, original?: MeasurementEntry): ReadMeasurementForm {
  const sites: Partial<Record<MeasurementSite, number | null>> = {};
  const formatErrors: Partial<Record<MeasurementSite, string>> = {};
  for (const site of MEASUREMENT_SITES) {
    const stored = original?.values[site];
    if (original && stored && values[site] === siteText(original, site, unitSystem)) {
      sites[site] = stored.centimeters;
      continue;
    }
    const parsed = parseDecimalInput(values[site]);
    const value = parsed.kind === 'number' ? parsed.value : parsed.kind === 'empty' ? null : Number.NaN;
    if (parsed.kind === 'ambiguous') {
      formatErrors[site] = NUMBER_FORMAT_ERROR;
    }
    sites[site] = original && value !== null && Number.isFinite(value) ? circumferenceFromUnit(value, unitSystem).centimeters : value;
  }
  return { input: { values: sites, unitSystem: original ? 'metric' : unitSystem, date: values.date }, formatErrors };
}

/** "10 and 300 cm" / "4 and 118 in": whole numbers inside the allowed range. */
export function measurementRangeText(unitSystem: UnitSystem): string {
  const toUnit = (centimeters: number) => (unitSystem === 'metric' ? centimeters : centimeters / CM_PER_INCH);
  return `${Math.ceil(toUnit(MEASUREMENT_CM.min))} and ${Math.floor(toUnit(MEASUREMENT_CM.max))} ${lengthUnitLabel(unitSystem)}`;
}

export function measurementFormErrorsOf(
  errors: MeasurementEntryErrors,
  unitSystem: UnitSystem,
  formatErrors: ReadMeasurementForm['formatErrors'] = {},
): MeasurementFormErrors {
  const e = copy.form.errors;
  const messages: Partial<Record<MeasurementSite | 'date' | 'values', string>> = {};
  for (const site of MEASUREMENT_SITES) {
    const label = copy.sites[site];
    if (formatErrors[site]) {
      messages[site] = formatErrors[site];
    } else if (errors[site] === 'not-a-number') {
      messages[site] = e.number(label);
    } else if (errors[site] === 'out-of-range') {
      messages[site] = e.range(label, measurementRangeText(unitSystem));
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
