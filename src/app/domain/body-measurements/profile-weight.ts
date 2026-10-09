import { UserFitnessProfile, parseBodyWeight, parseIsoCalendarDate } from '../fitness-profile';
import { WeightEntry } from './weight-entry';

/**
 * Using a recorded measurement as the profile's current weight: an explicit
 * user choice, never automatic.
 *
 * - change: the profile with only `weight` (the entry's canonical kilograms,
 *   unrounded) and `updatedAt` replaced. Everything else is kept as is.
 * - same: the profile already has exactly this weight; nothing to save.
 * - invalid: the entry's weight or date isn't usable for a profile.
 */
export type ProfileWeightChange =
  | { readonly kind: 'change'; readonly profile: UserFitnessProfile }
  | { readonly kind: 'same' }
  | { readonly kind: 'invalid' };

/** `now` is the ISO instant of the change (the profile's new `updatedAt`). */
export function profileWeightChange(profile: UserFitnessProfile, entry: WeightEntry, now: string): ProfileWeightChange {
  const weight = parseBodyWeight(entry.weight);
  if (!weight || !parseIsoCalendarDate(entry.date)) {
    return { kind: 'invalid' };
  }
  if (weight.kilograms === profile.weight.kilograms) {
    return { kind: 'same' };
  }
  return { kind: 'change', profile: { ...profile, weight, updatedAt: now } };
}
