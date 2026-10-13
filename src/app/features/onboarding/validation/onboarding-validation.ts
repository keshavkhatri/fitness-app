import {
  AGE_YEARS,
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
  heightInCentimeters,
  isTargetWeightDirectionValid,
  isValidCalendarDate,
  isWithin,
  parseDecimal,
  parseDecimalInput,
  parseIsoCalendarDate,
  parseWholeNumber,
  toFeetInches,
  toIsoCalendarDate,
  weightFromUnit,
  weightInUnit,
  weightUnitLabel,
} from '../../../domain/fitness-profile';
import { BasicInfo, OnboardingDraft } from '../state/onboarding-draft';
import { OnboardingStepId, applicableSteps } from '../state/onboarding-steps';

/**
 * Onboarding validation. Pure functions: no Angular, no DOM. Messages are
 * user-facing, short and friendly; ranges come from the domain rules.
 */

export type ValidationResult<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly errors: E };

// --- Draft-level (can the user move past this step?) ---------------------------

export const STEP_REQUIRED_MESSAGES: Partial<Record<OnboardingStepId, string>> = {
  name: 'Add your name to continue.',
  goal: 'Choose a goal to continue.',
  basics: 'Add your details to continue.',
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
    case 'name':
      return draft.name ? null : required;
    case 'goal':
      return draft.primaryGoal ? null : required;
    case 'basics':
      return draft.basics ? null : required;
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
      if (!target || !draft.primaryGoal || !draft.basics) {
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

// --- Basic information form ------------------------------------------------------

export type BasicsField = 'dateOfBirth' | 'sex' | 'height' | 'weight';
export type BasicsErrors = Partial<Record<BasicsField, string>>;

/** Raw form state: numbers are kept as typed text until validated. */
export interface BasicsFormInput {
  readonly unitSystem: UnitSystem;
  readonly birthDay: string;
  readonly birthMonth: string;
  readonly birthYear: string;
  readonly sex: Sex | null;
  readonly heightCm: string;
  readonly heightFeet: string;
  readonly heightInches: string;
  readonly weight: string;
}

export function basicsFormFromDraft(draft: OnboardingDraft): BasicsFormInput {
  const basics = draft.basics;
  const unitSystem = draft.unitSystem;
  const feetInches = basics ? toFeetInches(basics.height) : null;
  const dob = basics ? parseIsoCalendarDate(basics.dateOfBirth) : null;
  return {
    unitSystem,
    birthDay: dob ? String(dob.day) : '',
    birthMonth: dob ? String(dob.month) : '',
    birthYear: dob ? String(dob.year) : '',
    sex: basics?.sex ?? null,
    heightCm: basics ? String(heightInCentimeters(basics.height)) : '',
    heightFeet: feetInches ? String(feetInches.feet) : '',
    heightInches: feetInches ? String(feetInches.inches) : '',
    weight: basics ? String(weightInUnit(basics.weight, unitSystem)) : '',
  };
}

/** Switches unit system, converting whatever valid values have been typed so far. */
export function convertBasicsForm(input: BasicsFormInput, unitSystem: UnitSystem): BasicsFormInput {
  if (input.unitSystem === unitSystem) {
    return input;
  }
  const height = parseHeight(input);
  const weightValue = parseDecimal(input.weight);
  const feetInches = height ? toFeetInches(height) : null;
  return {
    ...input,
    unitSystem,
    heightCm: height ? String(heightInCentimeters(height)) : input.heightCm,
    heightFeet: feetInches ? String(feetInches.feet) : input.heightFeet,
    heightInches: feetInches ? String(feetInches.inches) : input.heightInches,
    weight:
      weightValue !== null ? String(weightInUnit(weightFromUnit(weightValue, input.unitSystem), unitSystem)) : input.weight,
  };
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

export function validateBasicsForm(
  input: BasicsFormInput,
  now: Date = new Date(),
): ValidationResult<BasicInfo, BasicsErrors> {
  const errors: BasicsErrors = {};

  const dob = validateDateOfBirthInput(input.birthDay, input.birthMonth, input.birthYear, now);
  if (!dob.ok) {
    errors.dateOfBirth = dob.errors;
  }

  if (!input.sex) {
    errors.sex = 'Choose an option.';
  }

  const height = parseHeight(input);
  const heightBlank =
    input.unitSystem === 'metric' ? input.heightCm.trim() === '' : input.heightFeet.trim() === '';
  if (heightBlank) {
    errors.height = 'Enter your height.';
  } else if (input.unitSystem === 'imperial' && parseInches(input.heightInches).kind === 'ambiguous') {
    errors.height = AMBIGUOUS_NUMBER;
  } else if (!height) {
    errors.height =
      input.unitSystem === 'metric' ? 'Enter your height in centimeters.' : 'Enter feet, and inches from 0 to 11.';
  } else if (!isWithin(height.centimeters, HEIGHT_CM)) {
    errors.height = `Enter a height between ${heightRangeText(input.unitSystem)}.`;
  }

  const weight = parseWeightInput(input.weight, input.unitSystem);
  if (input.weight.trim() === '') {
    errors.weight = 'Enter your weight.';
  } else if (!weight) {
    errors.weight = 'Enter your weight as a number.';
  } else if (!isWithin(weight.kilograms, WEIGHT_KG)) {
    errors.weight = `Enter a weight between ${weightRangeText(input.unitSystem)}.`;
  }

  if (Object.keys(errors).length > 0 || !dob.ok || !input.sex || !height || !weight) {
    return { ok: false, errors };
  }
  return { ok: true, value: { dateOfBirth: dob.value, sex: input.sex, height, weight } };
}

function parseHeight(input: BasicsFormInput) {
  if (input.unitSystem === 'metric') {
    const cm = parseDecimal(input.heightCm);
    return cm === null ? null : heightFromCentimeters(cm);
  }
  const feet = parseWholeNumber(input.heightFeet);
  const inches = parseInches(input.heightInches);
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
