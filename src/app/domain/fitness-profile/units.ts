import { BodyHeight, BodyWeight, UnitSystem } from './fitness-profile.model';

/**
 * Unit conversion and display for body measurements.
 * Storage is always metric; conversion happens only at the edges (input/display).
 */

export const CM_PER_INCH = 2.54;
export const INCHES_PER_FOOT = 12;
export const POUNDS_PER_KILOGRAM = 2.2046226218;

export interface FeetInches {
  readonly feet: number;
  readonly inches: number;
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Stored precision: enough that imperial input round-trips exactly at display precision.
const STORED_CM_DECIMALS = 1;
const STORED_KG_DECIMALS = 2;

export function heightFromCentimeters(centimeters: number): BodyHeight {
  return { centimeters: roundTo(centimeters, STORED_CM_DECIMALS) };
}

export function heightFromFeetInches(feet: number, inches: number): BodyHeight {
  return heightFromCentimeters((feet * INCHES_PER_FOOT + inches) * CM_PER_INCH);
}

export function weightFromKilograms(kilograms: number): BodyWeight {
  return { kilograms: roundTo(kilograms, STORED_KG_DECIMALS) };
}

export function weightFromPounds(pounds: number): BodyWeight {
  return weightFromKilograms(pounds / POUNDS_PER_KILOGRAM);
}

export function weightFromUnit(value: number, unitSystem: UnitSystem): BodyWeight {
  return unitSystem === 'metric' ? weightFromKilograms(value) : weightFromPounds(value);
}

/** Whole feet + whole inches (rounded), never "5 ft 12 in". */
export function toFeetInches(height: BodyHeight): FeetInches {
  const totalInches = Math.round(height.centimeters / CM_PER_INCH);
  return { feet: Math.floor(totalInches / INCHES_PER_FOOT), inches: totalInches % INCHES_PER_FOOT };
}

/** Weight in the given unit system, rounded to 0.1 for display/editing. */
export function weightInUnit(weight: BodyWeight, unitSystem: UnitSystem): number {
  const value = unitSystem === 'metric' ? weight.kilograms : weight.kilograms * POUNDS_PER_KILOGRAM;
  return roundTo(value, 1);
}

export function heightInCentimeters(height: BodyHeight): number {
  return Math.round(height.centimeters);
}

export function weightUnitLabel(unitSystem: UnitSystem): 'kg' | 'lb' {
  return unitSystem === 'metric' ? 'kg' : 'lb';
}

export function formatWeight(weight: BodyWeight, unitSystem: UnitSystem): string {
  return `${weightInUnit(weight, unitSystem)} ${weightUnitLabel(unitSystem)}`;
}

export function formatHeight(height: BodyHeight, unitSystem: UnitSystem): string {
  if (unitSystem === 'metric') {
    return `${heightInCentimeters(height)} cm`;
  }
  const { feet, inches } = toFeetInches(height);
  return `${feet} ft ${inches} in`;
}

/**
 * Parses a user-typed decimal ("82.5", "82,5", " 82 "). Returns null for
 * anything that is not a plain non-negative number.
 */
export function parseDecimal(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : null;
}

/** Parses a user-typed whole number. */
export function parseWholeNumber(text: string): number | null {
  const normalized = text.trim();
  return /^\d+$/.test(normalized) ? Number(normalized) : null;
}
