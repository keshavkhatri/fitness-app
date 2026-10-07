import {
  ActivityLevel,
  EquipmentId,
  PrimaryGoal,
  Sex,
  TRAINING_DAYS_PER_WEEK,
  TrainingDaysPerWeek,
  TrainingExperience,
  TrainingLocation,
  UnitSystem,
} from '../../domain/fitness-profile';
import { ChoiceOption, SegmentOption } from '../../shared/ui';

/**
 * User-facing copy for onboarding answers: labels, descriptions and icons.
 * Kept apart from domain types so wording can change without touching logic,
 * and reused by the summary (and later the profile screen).
 */

export const GOAL_OPTIONS: readonly ChoiceOption<PrimaryGoal>[] = [
  { value: 'lose-fat', label: 'Lose Fat', description: 'Reduce body fat while keeping your muscle', icon: 'flame-outline' },
  { value: 'build-muscle', label: 'Build Muscle', description: 'Add muscle size and definition', icon: 'barbell-outline' },
  { value: 'recomposition', label: 'Recomposition', description: 'Lose fat and build muscle together', icon: 'sync-outline' },
  { value: 'get-stronger', label: 'Get Stronger', description: 'Lift heavier and build strength', icon: 'trophy-outline' },
  { value: 'improve-fitness', label: 'Improve Fitness', description: 'Move better, feel fitter, build habits', icon: 'pulse-outline' },
];

export const SEX_OPTIONS: readonly ChoiceOption<Sex>[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'prefer-not-to-say', label: 'Prefer not to say' },
];

export const UNIT_SYSTEM_OPTIONS: readonly SegmentOption<UnitSystem>[] = [
  { value: 'metric', label: 'Metric' },
  { value: 'imperial', label: 'Imperial' },
];

export const EXPERIENCE_OPTIONS: readonly ChoiceOption<TrainingExperience>[] = [
  { value: 'beginner', label: 'Beginner', description: 'Just getting started' },
  { value: 'intermediate', label: 'Intermediate', description: 'Training consistently' },
  { value: 'advanced', label: 'Advanced', description: 'Several years of structured training' },
];

export const FREQUENCY_OPTIONS: readonly ChoiceOption<TrainingDaysPerWeek>[] = TRAINING_DAYS_PER_WEEK.map(
  (days) => ({ value: days, label: String(days), description: 'days' }),
);

export const LOCATION_OPTIONS: readonly ChoiceOption<TrainingLocation>[] = [
  { value: 'gym', label: 'Gym', icon: 'business-outline' },
  { value: 'home', label: 'Home', icon: 'home-outline' },
  { value: 'both', label: 'Both', icon: 'swap-horizontal-outline' },
];

export const EQUIPMENT_LABELS: Readonly<Record<EquipmentId, string>> = {
  'full-gym': 'Full gym',
  dumbbells: 'Dumbbells',
  barbells: 'Barbells',
  'cable-machine': 'Cable machine',
  machines: 'Machines',
  'resistance-bands': 'Resistance bands',
  'pull-up-bar': 'Pull-up bar',
  bench: 'Bench',
  'bodyweight-only': 'Bodyweight only',
  other: 'Other',
};

export const ACTIVITY_OPTIONS: readonly ChoiceOption<ActivityLevel>[] = [
  { value: 'sedentary', label: 'Mostly sedentary', description: 'Mostly sitting during the day' },
  { value: 'lightly-active', label: 'Lightly active', description: 'Some walking and regular daily movement' },
  { value: 'moderately-active', label: 'Moderately active', description: 'Active job or regular movement' },
  { value: 'very-active', label: 'Very active', description: 'Physically demanding lifestyle' },
];

/** Goal-specific wording for the target step (only goals with applicable targets). */
export const GOAL_TARGET_COPY: Partial<Record<PrimaryGoal, { question: string; helper: string }>> = {
  'lose-fat': {
    question: 'Do you have a target weight?',
    helper: 'Optional. Add one if you have a number in mind.',
  },
  'build-muscle': {
    question: 'Do you have a target weight?',
    helper: 'Optional. Many people building muscle prefer to track strength and measurements instead.',
  },
};

export function labelFor<T extends string | number>(options: readonly ChoiceOption<T>[], value: T): string {
  return options.find((option) => option.value === value)?.label ?? String(value);
}
