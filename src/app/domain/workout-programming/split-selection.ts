import { PrimaryGoal, TrainingExperience } from '../fitness-profile';
import { SplitDefinition, WorkoutProgrammingConfig } from './workout-config';
import { WorkoutFrequency } from './workout-taxonomy';

export interface SplitSelection {
  readonly split: SplitDefinition;
  readonly source: 'frequency-default' | 'goal-override' | 'experience-override';
}

/**
 * The weekly split for the requested frequency. Precedence:
 *   experience override (caps demanding sessions, e.g. beginners)
 *   > goal override
 *   > frequency default.
 */
export function selectSplit(
  frequency: WorkoutFrequency,
  goal: PrimaryGoal,
  experience: TrainingExperience,
  config: WorkoutProgrammingConfig,
): SplitSelection {
  const byExperience = config.splits.experienceOverrides[experience]?.[frequency];
  if (byExperience) {
    return { split: byExperience, source: 'experience-override' };
  }
  const byGoal = config.splits.goalOverrides[goal]?.[frequency];
  return byGoal
    ? { split: byGoal, source: 'goal-override' }
    : { split: config.splits.byFrequency[frequency], source: 'frequency-default' };
}
