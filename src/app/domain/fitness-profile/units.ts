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

/** Outcome of reading a typed number; range and precision checks are left to domain validation. */
export type DecimalInput =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'empty' }
  /** Could be a thousands separator ("1,234", "1.234", "1,234.5"): never guessed. */
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'invalid' };

/**
 * Strict, locale-independent reading of a typed decimal (food values).
 *
 * - Digits with at most one decimal separator, "." or ",": "32.5", "32,5", "0,125", "1234,5".
 * - A leading "-" is read as a negative number (for validation to reject with its own message).
 * - Ambiguous, rejected rather than guessed: more than one separator ("1,234.5", "1.234,5"),
 *   or exactly three digits after a separator following 1–3 digits that don't start with 0
 *   ("1,234", "1.234", "10,000"): a thousands-separated number in some locales.
 * - Anything else ("", "abc", "1e3", "Infinity", "NaN", "+5", ".5", "1 234") is empty or invalid.
 */
export function parseDecimalInput(text: string): DecimalInput {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { kind: 'empty' };
  }
  const negative = trimmed.startsWith('-');
  const body = negative ? trimmed.slice(1) : trimmed;
  if (/^\d+([.,]\d+){2,}$/.test(body) || /^\d+(,\d+\.\d+|\.\d+,\d+)$/.test(body) || /^[1-9]\d{0,2}[.,]\d{3}$/.test(body)) {
    return { kind: 'ambiguous' };
  }
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(body);
  if (!match) {
    return { kind: 'invalid' };
  }
  const value = Number(`${match[1]}.${match[2] ?? '0'}`);
  return Number.isFinite(value) ? { kind: 'number', value: negative && value !== 0 ? -value : value } : { kind: 'invalid' };
}

/** Parses a user-typed whole number. */
export function parseWholeNumber(text: string): number | null {
  const normalized = text.trim();
  return /^\d+$/.test(normalized) ? Number(normalized) : null;
}
