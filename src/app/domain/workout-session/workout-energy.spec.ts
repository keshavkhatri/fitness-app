import { finishedLog } from './testing/workout-log-fixtures';
import { RESISTANCE_TRAINING_MET, estimateWorkoutCalories } from './workout-energy';

describe('estimateWorkoutCalories', () => {
  const log = finishedLog({ startedAt: new Date(2026, 9, 8, 7, 0), minutes: 54 });

  it('is MET × kg × hours, rounded to 5 kcal', () => {
    // 5.0 × 80 kg × 0.9 h = 360 kcal
    expect(RESISTANCE_TRAINING_MET).toBe(5);
    expect(estimateWorkoutCalories(log, 80)).toBe(360);
    expect(estimateWorkoutCalories(log, 72.4)).toBe(325);
  });

  it('is null without a usable body weight or a finished time', () => {
    expect(estimateWorkoutCalories(log, null)).toBeNull();
    expect(estimateWorkoutCalories(log, 0)).toBeNull();
    expect(estimateWorkoutCalories({ ...log, completedAt: null }, 80)).toBeNull();
    expect(estimateWorkoutCalories({ ...log, completedAt: log.startedAt }, 80)).toBeNull();
  });
});
