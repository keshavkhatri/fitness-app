import { DEFAULT_STEP_GOAL } from './daily-check-in';
import { DEFAULT_GOALS, STEP_GOAL_RANGE, WATER_GOAL_RANGE_ML, nudgeGoal, parseDailyGoals, stepGoalOf } from './daily-goals';

describe('daily goals', () => {
  it('uses the suggestion until the person sets a goal', () => {
    expect(stepGoalOf(DEFAULT_GOALS)).toBe(DEFAULT_STEP_GOAL);
    expect(stepGoalOf({ steps: 7_500, waterMl: null })).toBe(7_500);
  });

  it('reads stored goals strictly: anything invalid falls back to the suggestion', () => {
    expect(parseDailyGoals({ steps: 8_000, waterMl: 2_500 })).toEqual({ steps: 8_000, waterMl: 2_500 });
    expect(parseDailyGoals({ steps: 999, waterMl: 99_999 })).toEqual(DEFAULT_GOALS);
    expect(parseDailyGoals({ steps: '8000', waterMl: 2_500.5 })).toEqual(DEFAULT_GOALS);
    expect(parseDailyGoals(null)).toEqual(DEFAULT_GOALS);
    expect(parseDailyGoals('x')).toEqual(DEFAULT_GOALS);
  });

  it('moves a goal one step at a time and stops at the ends of its range', () => {
    expect(nudgeGoal(10_000, 1, STEP_GOAL_RANGE.step, STEP_GOAL_RANGE)).toBe(10_500);
    expect(nudgeGoal(10_000, -1, STEP_GOAL_RANGE.step, STEP_GOAL_RANGE)).toBe(9_500);
    expect(nudgeGoal(1_000, -1, STEP_GOAL_RANGE.step, STEP_GOAL_RANGE)).toBe(1_000);
    expect(nudgeGoal(50_000, 1, STEP_GOAL_RANGE.step, STEP_GOAL_RANGE)).toBe(50_000);
    expect(nudgeGoal(7_900, 1, 250, WATER_GOAL_RANGE_ML)).toBe(8_000);
    expect(nudgeGoal(600, -1, 250, WATER_GOAL_RANGE_ML)).toBe(500);
  });
});
