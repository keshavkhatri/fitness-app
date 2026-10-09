import { PrimaryGoal, TrainingExperience } from '../fitness-profile';
import { WorkoutEquipment, WorkoutFrequency, WorkoutLocation } from './workout-taxonomy';

/**
 * Everything that influences workout programming, and nothing else.
 *
 * Body metrics, sex, age and activity level are deliberately absent: in v1
 * they do not change exercise selection or volume, and the engine should not
 * pretend they do.
 *
 * Future extension points (not implemented): `exerciseExclusions`,
 * `limitations` and workout history would be added as optional fields and
 * applied as extra candidate filters / adjustments in exercise selection.
 */
export interface WorkoutGenerationInput {
  readonly goal: PrimaryGoal;
  readonly experience: TrainingExperience;
  readonly daysPerWeek: WorkoutFrequency;
  /** Where the user trains. An exercise is available if it suits ANY of them. */
  readonly locations: readonly WorkoutLocation[];
  /** Equipment the user has. Empty = bodyweight only (always available). */
  readonly equipment: readonly WorkoutEquipment[];
}
