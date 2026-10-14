import {
  AGE_YEARS,
  BodyHeight,
  BodyWeight,
  GOAL_TARGET_POLICIES,
  HEIGHT_CM,
  IsoCalendarDate,
  NumericRange,
  PrimaryGoal,
  Sex,
  UnitSystem,
  WEIGHT_KG,
  ageOn,
  calendarDateOf,
  compareCalendarDates,
  formatWeight,
  heightFromCentimeters,
  heightFromFeetInches,
  isTargetWeightDirectionValid,
  isValidCalendarDate,
  isWithin,
  parseDecimal,
  parseDecimalInput,
  parseWholeNumber,
  roundTo,
  toFeetInches,
  toIsoCalendarDate,
  weightFromUnit,
  weightInUnit,
  weightUnitLabel,
} from '../../../domain/fitness-profile';
import { normalizeName } from '../../../core/identity/user-identity.service';
import { OnboardingDraft } from '../state/onboarding-draft';
import { OnboardingStepId, applicableSteps } from '../state/onboarding-steps';

/**
 * Onboarding validation. Pure functions: no Angular, no DOM. Messages are
 * user-facing, short and friendly; ranges come from the domain rules.
 */

export type ValidationResult<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly errors: E };

// --- Draft-level (can the user move past this step?) ---------------------------

export const STEP_REQUIRED_MESSAGES: Partial<Record<OnboardingStepId, string>> = {
  basics: 'Add your details to continue.',
  height: 'Set your height to continue.',
  weight: 'Set your weight to continue.',
  goal: 'Choose a goal to continue.',
  experience: 'Choose your experience level to continue.',
  frequency: 'Choose how many days you want to train.',
  location: 'Choose where you train.',
  equipment: 'Choose at least one option.',
  activity: 'Choose your activity level to continue.',
};

/** Returns a message when the step's answer is missing or inconsistent, otherwise null. */
export function validateStep(stepId: OnboardingStepId, draft: OnboardingDraft): string | null {
  const required = STEP_REQUIRED_MESSAGES[stepId] ?? null;
  switch (stepId) {
    case 'basics':
      return draft.name && draft.basics.dateOfBirth && draft.basics.sex ? null : required;
    case 'height':
      return draft.basics.height ? null : required;
    case 'weight':
      return draft.basics.weight ? null : required;
    case 'goal':
      return draft.primaryGoal ? null : required;
    case 'experience':
      return draft.trainingExperience ? null : required;
    case 'frequency':
      return draft.trainingDaysPerWeek ? null : required;
    case 'location':
      return draft.trainingLocation ? null : required;
    case 'equipment':
      return draft.equipment.length > 0 ? null : required;
    case 'activity':
      return draft.activityLevel ? null : required;
    case 'goal-target': {
      const target = draft.goalTarget.targetWeight;
      if (!target || !draft.primaryGoal || !draft.basics.weight) {
        return null;
      }
      return targetDirectionError(draft.primaryGoal, target, draft.basics.weight, draft.unitSystem);
    }
    default:
      return null;
  }
}

/** First applicable question step that still needs an answer, or null when complete. */
export function firstIncompleteStep(draft: OnboardingDraft): OnboardingStepId | null {
  const step = applicableSteps(draft).find((s) => s.kind === 'question' && validateStep(s.id, draft) !== null);
  return step?.id ?? null;
}

// --- About you: name, date of birth, sex -------------------------------------------

/** The body details a report can speak to; one note each (see report-review). */
export type BasicsField = 'dateOfBirth' | 'sex' | 'height' | 'weight';

export type AboutField = 'name' | 'dateOfBirth' | 'sex';
export type AboutErrors = Partial<Record<AboutField, string>>;

/** Raw form state: kept as entered until validated. */
export interface AboutFormInput {
  readonly name: string;
  /** From the platform date picker: YYYY-MM-DD, or '' while incomplete. */
  readonly birthDate: string;
  readonly sex: Sex | null;
}

export interface AboutAnswers {
  readonly name: string;
  readonly dateOfBirth: IsoCalendarDate;
  readonly sex: Sex;
}

export function aboutFormFromDraft(draft: OnboardingDraft): AboutFormInput {
  return { name: draft.name ?? '', birthDate: draft.basics.dateOfBirth ?? '', sex: draft.basics.sex };
}

export function validateAboutForm(input: AboutFormInput, now: Date = new Date()): ValidationResult<AboutAnswers, AboutErrors> {
  const errors: AboutErrors = {};
  const name = normalizeName(input.name);
  if (!name) {
    errors.name = 'Add your name to continue.';
  }
  const dob = validateBirthDateInput(input.birthDate, now);
  if (!dob.ok) {
    errors.dateOfBirth = dob.errors;
  }
  if (!input.sex) {
    errors.sex = 'Choose an option.';
  }
  if (!name || !dob.ok || !input.sex) {
    return { ok: false, errors };
  }
  return { ok: true, value: { name, dateOfBirth: dob.value, sex: input.sex } };
}

/**
 * A date of birth from the date picker (YYYY-MM-DD). Checked like a typed
 * one: a real date, not in the future, and an adult's.
 */
export function validateBirthDateInput(value: string, now: Date = new Date()): ValidationResult<IsoCalendarDate, string> {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return { ok: false, errors: value.trim() === '' ? 'Enter your date of birth.' : 'Enter your full date of birth.' };
  }
  const [, year, month, day] = match;
  return validateDateOfBirthInput(day, month, year, now);
}

/**
 * Validates a date of birth typed as separate day / month / year fields.
 * `now` is injectable so age checks are deterministic in tests.
 */
export function validateDateOfBirthInput(
  day: string,
  month: string,
  year: string,
  now: Date = new Date(),
): ValidationResult<IsoCalendarDate, string> {
  const fail = (errors: string) => ({ ok: false, errors }) as const;
  if ([day, month, year].every((part) => part.trim() === '')) {
    return fail('Enter your date of birth.');
  }
  const parts = { day: parseWholeNumber(day), month: parseWholeNumber(month), year: parseWholeNumber(year) };
  if (parts.day === null || parts.month === null || parts.year === null) {
    return fail('Enter your full date of birth as numbers.');
  }
  if (year.trim().length !== 4) {
    return fail('Enter the year with 4 digits.');
  }
  const date = { day: parts.day, month: parts.month, year: parts.year };
  if (!isValidCalendarDate(date)) {
    return fail("That date doesn't exist. Check the day and month.");
  }
  const today = calendarDateOf(now);
  if (compareCalendarDates(date, today) > 0) {
    return fail("Date of birth can't be in the future.");
  }
  const age = ageOn(date, today);
  if (age < AGE_YEARS.min) {
    return fail(`You need to be ${AGE_YEARS.min} or older to use this app.`);
  }
  if (age > AGE_YEARS.max) {
    return fail('Check the year of your date of birth.');
  }
  return { ok: true, value: toIsoCalendarDate(date) as IsoCalendarDate };
}

// --- Height and weight, typed in ----------------------------------------------------

/** Height as typed: centimeters, or feet and inches. */
export interface HeightTextInput {
  readonly unitSystem: UnitSystem;
  readonly cm: string;
  readonly feet: string;
  readonly inches: string;
}

/** The typing fields for a height, in the given units (to 0.1 cm, or whole inches). */
export function heightText(height: BodyHeight | null, unitSystem: UnitSystem): HeightTextInput {
  if (!height) {
    return { unitSystem, cm: '', feet: '', inches: '' };
  }
  const { feet, inches } = toFeetInches(height);
  return { unitSystem, cm: String(roundTo(height.centimeters, 1)), feet: String(feet), inches: String(inches) };
}

export function validateHeightInput(input: HeightTextInput): ValidationResult<BodyHeight, string> {
  const fail = (errors: string) => ({ ok: false, errors }) as const;
  const blank = input.unitSystem === 'metric' ? input.cm.trim() === '' : input.feet.trim() === '';
  if (blank) {
    return fail('Enter your height.');
  }
  if (input.unitSystem === 'imperial' && parseInches(input.inches).kind === 'ambiguous') {
    return fail(AMBIGUOUS_NUMBER);
  }
  const height = parseHeight(input);
  if (!height) {
    return fail(input.unitSystem === 'metric' ? 'Enter your height in centimeters.' : 'Enter feet, and inches from 0 to 11.');
  }
  if (!isWithin(height.centimeters, HEIGHT_CM)) {
    return fail(`Enter a height between ${heightRangeText(input.unitSystem)}.`);
  }
  return { ok: true, value: height };
}

/** The typing field for a weight, in the given unit (to 0.1). */
export function weightText(weight: BodyWeight | null, unitSystem: UnitSystem): string {
  return weight ? String(weightInUnit(weight, unitSystem)) : '';
}

export function validateWeightInput(text: string, unitSystem: UnitSystem): ValidationResult<BodyWeight, string> {
  if (text.trim() === '') {
    return { ok: false, errors: 'Enter your weight.' };
  }
  const weight = parseWeightInput(text, unitSystem);
  if (!weight) {
    return { ok: false, errors: 'Enter your weight as a number.' };
  }
  if (!isWithin(weight.kilograms, WEIGHT_KG)) {
    return { ok: false, errors: `Enter a weight between ${weightRangeText(unitSystem)}.` };
  }
  return { ok: true, value: weight };
}

function parseHeight(input: HeightTextInput): BodyHeight | null {
  if (input.unitSystem === 'metric') {
    const cm = parseDecimal(input.cm);
    return cm === null ? null : heightFromCentimeters(cm);
  }
  const feet = parseWholeNumber(input.feet);
  const inches = parseInches(input.inches);
  if (feet === null || inches.kind !== 'ok' || inches.value >= 12) {
    return null;
  }
  return heightFromFeetInches(feet, inches.value);
}

const AMBIGUOUS_NUMBER = "Check number format. Use one decimal separator. Thousands separators aren't supported.";

type InchesInput = { readonly kind: 'ok'; readonly value: number } | { readonly kind: 'ambiguous' } | { readonly kind: 'invalid' };

/**
 * The inches part of a feet-and-inches height. Blank means 0. Uses the strict
 * shared parser so "1,234" or "1.234" is never read as 1.234 inches; decimal
 * inches with a dot or comma ("5.5", "5,5") stay valid. Negative is invalid.
 */
function parseInches(text: string): InchesInput {
  const parsed = parseDecimalInput(text);
  switch (parsed.kind) {
    case 'empty':
      return { kind: 'ok', value: 0 };
    case 'number':
      return text.trim().startsWith('-') ? { kind: 'invalid' } : { kind: 'ok', value: parsed.value };
    default:
      return { kind: parsed.kind };
  }
}

function parseWeightInput(text: string, unitSystem: UnitSystem): BodyWeight | null {
  const value = parseDecimal(text);
  return value === null ? null : weightFromUnit(value, unitSystem);
}

function heightRangeText(unitSystem: UnitSystem): string {
  if (unitSystem === 'metric') {
    return `${HEIGHT_CM.min} and ${HEIGHT_CM.max} cm`;
  }
  const min = toFeetInches(heightFromCentimeters(HEIGHT_CM.min));
  const max = toFeetInches(heightFromCentimeters(HEIGHT_CM.max));
  return `${min.feet} ft ${min.inches} in and ${max.feet} ft ${max.inches} in`;
}

/** Range in the user's unit, rounded inwards so every shown value is accepted. */
export function weightRangeText(unitSystem: UnitSystem, range: NumericRange = WEIGHT_KG): string {
  const toUnit = (kg: number) => weightInUnit({ kilograms: kg }, unitSystem);
  return `${Math.ceil(toUnit(range.min))} and ${Math.floor(toUnit(range.max)).toLocaleString('en-US')} ${weightUnitLabel(unitSystem)}`;
}

// --- Goal target form ------------------------------------------------------------

export function validateTargetWeightInput(
  text: string,
  goal: PrimaryGoal,
  unitSystem: UnitSystem,
  currentWeight: BodyWeight | null,
): ValidationResult<BodyWeight | null, string> {
  if (text.trim() === '') {
    return { ok: true, value: null }; // Optional.
  }
  const target = parseWeightInput(text, unitSystem);
  if (!target) {
    return { ok: false, errors: 'Enter your target weight as a number.' };
  }
  if (!isWithin(target.kilograms, WEIGHT_KG)) {
    return { ok: false, errors: `Enter a weight between ${weightRangeText(unitSystem)}.` };
  }
  const directionError = currentWeight ? targetDirectionError(goal, target, currentWeight, unitSystem) : null;
  return directionError ? { ok: false, errors: directionError } : { ok: true, value: target };
}

function targetDirectionError(
  goal: PrimaryGoal,
  target: BodyWeight,
  current: BodyWeight,
  unitSystem: UnitSystem,
): string | null {
  if (isTargetWeightDirectionValid(goal, target, current)) {
    return null;
  }
  const relation = GOAL_TARGET_POLICIES[goal].targetWeightDirection === 'below-current' ? 'below' : 'above';
  return `For this goal, your target should be ${relation} your current weight (${formatWeight(current, unitSystem)}).`;
}
