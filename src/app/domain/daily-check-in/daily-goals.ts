import { DEFAULT_STEP_GOAL } from './daily-check-in';

/**
 * The person's own daily goals. `null` means "use the app's suggestion": 10,000 steps, and a water goal worked out
 * from body weight (domain/nutrition/water.ts). A goal the person sets replaces the suggestion.
 */
export interface DailyGoals {
  /** Steps a day; null: the default. */
  readonly steps: number | null;
  /** Water a day in millilitres; null: the suggestion from body weight. */
  readonly waterMl: number | null;
}

export const DEFAULT_GOALS: DailyGoals = { steps: null, waterMl: null };

/** Allowed step goals, and how far one tap on − or + moves it. */
export const STEP_GOAL_RANGE = { min: 1_000, max: 50_000, step: 500 } as const;

/** Allowed water goals (ml). */
export const WATER_GOAL_RANGE_ML = { min: 500, max: 8_000 } as const;

export const isValidStepGoal = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= STEP_GOAL_RANGE.min && value <= STEP_GOAL_RANGE.max;

export const isValidWaterGoal = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= WATER_GOAL_RANGE_ML.min && value <= WATER_GOAL_RANGE_ML.max;

/** The step goal in effect. */
export const stepGoalOf = (goals: DailyGoals): number => goals.steps ?? DEFAULT_STEP_GOAL;

/** Stored goals, read strictly: anything invalid falls back to the default for that goal. */
export function parseDailyGoals(value: unknown): DailyGoals {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    steps: isValidStepGoal(v['steps']) ? v['steps'] : null,
    waterMl: isValidWaterGoal(v['waterMl']) ? v['waterMl'] : null,
  };
}

/** A goal moved one step up or down, kept within its range. */
export function nudgeGoal(current: number, direction: 1 | -1, step: number, range: { readonly min: number; readonly max: number }): number {
  return Math.min(range.max, Math.max(range.min, current + direction * step));
}
