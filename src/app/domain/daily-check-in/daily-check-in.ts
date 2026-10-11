import { IsoCalendarDate, parseIsoCalendarDate } from '../fitness-profile';

/**
 * Self-reported daily check-ins: steps walked and how recovered the user
 * feels. Entered by the user (no health-device integration yet), one value
 * per local calendar day; a new entry replaces that day's value.
 */

export type RecoveryLevel = 'poor' | 'fair' | 'good' | 'great';

/** Worst to best. */
export const RECOVERY_LEVELS: readonly RecoveryLevel[] = ['poor', 'fair', 'good', 'great'];

/** Daily step goal until the user can set their own. */
export const DEFAULT_STEP_GOAL = 10_000;

/** Plausible range for one day's steps. */
export const STEPS_RANGE = { min: 0, max: 100_000 } as const;

export interface DailyCheckIns {
  readonly steps: Readonly<Record<IsoCalendarDate, number>>;
  readonly recovery: Readonly<Record<IsoCalendarDate, RecoveryLevel>>;
}

export const EMPTY_CHECK_INS: DailyCheckIns = { steps: {}, recovery: {} };

export function isValidSteps(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= STEPS_RANGE.min && value <= STEPS_RANGE.max;
}

export function isRecoveryLevel(value: unknown): value is RecoveryLevel {
  return RECOVERY_LEVELS.includes(value as RecoveryLevel);
}

/** Strict parse of stored data: invalid dates or values are dropped, never coerced. */
export function parseDailyCheckIns(value: unknown): DailyCheckIns {
  if (!value || typeof value !== 'object') {
    return EMPTY_CHECK_INS;
  }
  const { steps, recovery } = value as Record<string, unknown>;
  return {
    steps: pick(steps, isValidSteps),
    recovery: pick(recovery, isRecoveryLevel),
  };
}

function pick<T>(source: unknown, valid: (v: unknown) => v is T): Record<IsoCalendarDate, T> {
  const out: Record<IsoCalendarDate, T> = {};
  if (source && typeof source === 'object') {
    for (const [date, v] of Object.entries(source)) {
      if (parseIsoCalendarDate(date) && valid(v)) {
        out[date] = v;
      }
    }
  }
  return out;
}

/** "820", "8.2k", "12k" (one decimal under 10,000). */
export function formatSteps(steps: number): string {
  if (steps < 1000) {
    return String(steps);
  }
  const thousands = steps / 1000;
  const rounded = thousands < 10 ? Math.floor(thousands * 10) / 10 : Math.floor(thousands);
  return `${rounded}k`;
}

/** Share of the step goal reached, 0–1. */
export function stepsFraction(steps: number, goal = DEFAULT_STEP_GOAL): number {
  return goal > 0 ? Math.min(Math.max(steps / goal, 0), 1) : 0;
}

/** poor 0.25 … great 1. */
export function recoveryFraction(level: RecoveryLevel): number {
  return (RECOVERY_LEVELS.indexOf(level) + 1) / RECOVERY_LEVELS.length;
}
