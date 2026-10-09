import { UnitSystem, roundTo, weightInUnit } from '../fitness-profile';
import { WeightEntry } from './weight-entry';

/**
 * Ordering and differences for recorded body weights. Measurement date
 * orders entries; same-day entries follow record creation time, then id, so
 * the order is deterministic and doesn't change when an entry is edited.
 */

/** Oldest first. */
export function compareWeightEntries(a: WeightEntry, b: WeightEntry): number {
  if (a.date !== b.date) {
    return a.date < b.date ? -1 : 1;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export const sortWeightEntries = (entries: readonly WeightEntry[]): WeightEntry[] => [...entries].sort(compareWeightEntries);

export interface WeightHistoryItem {
  readonly entry: WeightEntry;
  /** The weight as displayed in this unit system (1 decimal). */
  readonly displayWeight: number;
  /**
   * Difference from the immediately preceding recorded measurement, in the
   * same unit (1 decimal), computed from the displayed values so the numbers
   * on screen add up. null for the first entry. Not progress: just the gap
   * between two recordings (which may be on the same day).
   */
  readonly changeSincePrevious: number | null;
  /** The preceding measurement was recorded on the same date. */
  readonly sameDayAsPrevious: boolean;
}

/** History items, newest first, each compared with the measurement before it. */
export function weightHistory(entries: readonly WeightEntry[], unitSystem: UnitSystem): WeightHistoryItem[] {
  const ordered = sortWeightEntries(entries);
  return ordered
    .map((entry, i): WeightHistoryItem => {
      const displayWeight = weightInUnit(entry.weight, unitSystem);
      const previous = i > 0 ? ordered[i - 1] : null;
      return {
        entry,
        displayWeight,
        changeSincePrevious: previous ? roundTo(displayWeight - weightInUnit(previous.weight, unitSystem), 1) : null,
        sameDayAsPrevious: previous !== null && previous.date === entry.date,
      };
    })
    .reverse();
}
