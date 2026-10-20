import {
  BodyHeight,
  BodyWeight,
  CM_PER_INCH,
  HEIGHT_CM,
  INCHES_PER_FOOT,
  POUNDS_PER_KILOGRAM,
  UnitSystem,
  WEIGHT_KG,
  heightFromCentimeters,
  heightFromFeetInches,
  toFeetInches,
  weightFromUnit,
  weightInUnit,
} from '../../../domain/fitness-profile';
import { RulerScale } from '../../../shared/ui';

/**
 * The height and weight rulers in the user's units. Pure.
 *
 * The draft keeps one canonical value (cm to 0.1, kg to 0.01). A ruler only
 * shows it in the chosen unit: switching units converts for display and
 * never rewrites the stored value, so switching back and forth can't drift.
 * A value is converted back only when the user moves the ruler, and every
 * tick converts to a canonical value that shows as that same tick again.
 *
 * Ranges are the profile's own (HEIGHT_CM, WEIGHT_KG), rounded inwards in
 * imperial so every tick is accepted.
 */

/** Height: whole centimeters, or whole inches (the app shows feet and whole inches). */
export function heightScale(unitSystem: UnitSystem): RulerScale {
  return unitSystem === 'metric'
    ? { min: HEIGHT_CM.min, max: HEIGHT_CM.max, step: 1 }
    : { min: Math.ceil(HEIGHT_CM.min / CM_PER_INCH), max: Math.floor(HEIGHT_CM.max / CM_PER_INCH), step: 1 };
}

/** Where a height sits on its ruler: centimeters as stored (172.5 stays 172.5), or total inches. */
export function heightOnScale(height: BodyHeight, unitSystem: UnitSystem): number {
  if (unitSystem === 'metric') {
    return height.centimeters;
  }
  const { feet, inches } = toFeetInches(height);
  return feet * INCHES_PER_FOOT + inches;
}

export function heightFromScale(value: number, unitSystem: UnitSystem): BodyHeight {
  return unitSystem === 'metric'
    ? heightFromCentimeters(value)
    : heightFromFeetInches(Math.floor(value / INCHES_PER_FOOT), value % INCHES_PER_FOOT);
}

/** Weight: 0.1 kg or 0.1 lb, the precision weights are shown and typed in. */
export function weightScale(unitSystem: UnitSystem): RulerScale {
  if (unitSystem === 'metric') {
    return { min: WEIGHT_KG.min, max: WEIGHT_KG.max, step: 0.1 };
  }
  return {
    min: Math.ceil(WEIGHT_KG.min * POUNDS_PER_KILOGRAM * 10) / 10,
    max: Math.floor(WEIGHT_KG.max * POUNDS_PER_KILOGRAM * 10) / 10,
    step: 0.1,
  };
}

export function weightOnScale(weight: BodyWeight, unitSystem: UnitSystem): number {
  return weightInUnit(weight, unitSystem);
}

export function weightFromScale(value: number, unitSystem: UnitSystem): BodyWeight {
  return weightFromUnit(value, unitSystem);
}

/** "5′ 10″" for a total in inches. */
export function feetInchesLabel(totalInches: number): string {
  return `${Math.floor(totalInches / INCHES_PER_FOOT)}′ ${totalInches % INCHES_PER_FOOT}″`;
}

/** Spoken height on its ruler, e.g. "179 centimeters" or "5 feet 10 inches". */
export function spokenHeight(value: number, unitSystem: UnitSystem): string {
  if (unitSystem === 'metric') {
    return `${value} centimeters`;
  }
  const feet = Math.floor(value / INCHES_PER_FOOT);
  const inches = value % INCHES_PER_FOOT;
  return `${feet} ${feet === 1 ? 'foot' : 'feet'} ${inches} ${inches === 1 ? 'inch' : 'inches'}`;
}

export function spokenWeight(value: number, unitSystem: UnitSystem): string {
  return `${value} ${unitSystem === 'metric' ? 'kilograms' : 'pounds'}`;
}

/**
 * Starting points shown before a value is chosen (nothing is saved until the
 * user continues). Typical adult values, not a judgement of the user.
 */
export const DEFAULT_HEIGHT: BodyHeight = { centimeters: 170 };
export const DEFAULT_WEIGHT: BodyWeight = { kilograms: 70 };

/** The four standard adult BMI bands (WHO): under 18.5, 18.5–24.9, 25–29.9, 30 and over. */
export const BMI_BANDS = [
  { key: 'under', label: 'Underweight', min: 0, max: 18.5 },
  { key: 'normal', label: 'Normal', min: 18.5, max: 25 },
  { key: 'over', label: 'Overweight', min: 25, max: 30 },
  { key: 'obese', label: 'Obese', min: 30, max: Infinity },
] as const;

export type BmiBandKey = (typeof BMI_BANDS)[number]['key'];

export interface BmiBandView {
  readonly key: BmiBandKey;
  readonly label: string;
  /** "< 60", "60 – 80", "> 100" in the user's unit, for this height. */
  readonly range: string;
  readonly current: boolean;
}

/**
 * The weight steps' "visual reference": the BMI bands as weights for this height (weight = BMI × m²), in the
 * user's unit, with the band the weight falls in marked. Rounded to whole units. A rough population guide.
 */
export function bmiReference(height: BodyHeight, weight: BodyWeight, unitSystem: UnitSystem): readonly BmiBandView[] {
  const m2 = (height.centimeters / 100) ** 2;
  const bmi = weight.kilograms / m2;
  const shown = (bmiValue: number) => Math.round(weightOnScale({ kilograms: bmiValue * m2 }, unitSystem));
  return BMI_BANDS.map((band) => ({
    key: band.key,
    label: band.label,
    range: band.min === 0 ? `< ${shown(band.max)}` : band.max === Infinity ? `> ${shown(band.min)}` : `${shown(band.min)} – ${shown(band.max)}`,
    current: bmi >= band.min && bmi < band.max,
  }));
}
