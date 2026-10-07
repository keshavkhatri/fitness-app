import { Sex } from '../fitness-profile';
import { BmrMethod, BmrSexBasis } from './fitness-assessment.model';

/** Body inputs for BMR, in canonical units. Future methods may add e.g. lean body mass. */
export interface BmrInput {
  readonly weightKg: number;
  readonly heightCm: number;
  readonly ageYears: number;
  readonly sex: Sex;
}

export interface BmrEstimate {
  /** Unrounded kcal/day. */
  readonly kcal: number;
  readonly method: BmrMethod;
  readonly sexBasis: BmrSexBasis;
}

// Mifflin-St Jeor (1990) coefficients. Fixed by the published equation, so
// kept here rather than in the tunable configuration.
const MSJ = { weight: 10, height: 6.25, age: 5, maleOffset: 5, femaleOffset: -161 } as const;

/** Mifflin-St Jeor for a specific sex, unrounded. */
export function mifflinStJeor(input: Omit<BmrInput, 'sex'>, sex: 'male' | 'female'): number {
  const base = MSJ.weight * input.weightKg + MSJ.height * input.heightCm - MSJ.age * input.ageYears;
  return base + (sex === 'male' ? MSJ.maleOffset : MSJ.femaleOffset);
}

/**
 * Estimates BMR. For "prefer not to say" the midpoint of the male and female
 * equations is used rather than silently picking one; callers mark that
 * result as lower confidence.
 *
 * Extension point: a lean-mass method (e.g. Katch-McArdle from InBody data)
 * would be another branch here returning a different `method`.
 */
export function estimateBmr(input: BmrInput): BmrEstimate {
  if (input.sex === 'prefer-not-to-say') {
    const midpoint = (mifflinStJeor(input, 'male') + mifflinStJeor(input, 'female')) / 2;
    return { kcal: midpoint, method: 'mifflin-st-jeor', sexBasis: 'sex-neutral-midpoint' };
  }
  return { kcal: mifflinStJeor(input, input.sex), method: 'mifflin-st-jeor', sexBasis: input.sex };
}
