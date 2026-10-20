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
import { GOAL_PHOTOS, LOCATION_PHOTOS } from './onboarding-media';
import { SetupMethod } from './state/onboarding-draft';

/**
 * User-facing copy for onboarding answers: labels, descriptions and icons.
 * Kept apart from domain types so wording can change without touching logic,
 * and reused by the summary (and later the profile screen).
 */

export const GOAL_OPTIONS: readonly ChoiceOption<PrimaryGoal>[] = [
  { value: 'lose-fat', label: 'Lose fat', description: 'Reduce body fat while keeping your muscle', icon: 'flame-outline' },
  { value: 'build-muscle', label: 'Build muscle', description: 'Add muscle size and definition', icon: 'barbell-outline' },
  { value: 'recomposition', label: 'Recomposition', description: 'Lose fat and build muscle together', icon: 'sync-outline' },
  { value: 'get-stronger', label: 'Get stronger', description: 'Lift heavier and build strength', icon: 'trophy-outline' },
  { value: 'improve-fitness', label: 'Improve fitness', description: 'Move better, feel fitter, build habits', icon: 'pulse-outline' },
];

/** The goal cards on the onboarding goal screen: the same answers, with a picture each. */
export const GOAL_CARD_OPTIONS: readonly ChoiceOption<PrimaryGoal>[] = GOAL_OPTIONS.map((option) => ({
  ...option,
  media: { src: GOAL_PHOTOS[option.value], icon: option.icon ?? 'pulse-outline' },
}));

export const SETUP_METHOD_OPTIONS: readonly ChoiceOption<SetupMethod>[] = [
  { value: 'manual', label: 'Enter manually', description: 'Answer a few quick questions', icon: 'list-outline' },
  {
    value: 'report',
    label: 'Upload InBody report',
    description: 'Fill in height, weight and sex from your results sheet',
    icon: 'document-text-outline',
  },
];

export const SEX_OPTIONS: readonly ChoiceOption<Sex>[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'prefer-not-to-say', label: 'Prefer not to say' },
];

/** The sex cards on the onboarding details screen (generic symbols until avatar artwork ships). */
export const SEX_CARD_OPTIONS: readonly ChoiceOption<Sex>[] = SEX_OPTIONS.map((option) => ({
  ...option,
  icon: { male: 'male', female: 'female', 'prefer-not-to-say': 'person-outline' }[option.value],
  media: {
    src: `assets/images/onboarding/avatar-${{ male: 'male', female: 'female', 'prefer-not-to-say': 'neutral' }[option.value]}.webp`,
    icon: { male: 'male', female: 'female', 'prefer-not-to-say': 'person-outline' }[option.value],
  },
}));

export const UNIT_SYSTEM_OPTIONS: readonly SegmentOption<UnitSystem>[] = [
  { value: 'metric', label: 'Metric' },
  { value: 'imperial', label: 'Imperial' },
];

export const EXPERIENCE_OPTIONS: readonly ChoiceOption<TrainingExperience>[] = [
  { value: 'beginner', label: 'Beginner', description: 'Just getting started', icon: 'leaf-outline' },
  { value: 'intermediate', label: 'Intermediate', description: 'Training consistently', icon: 'trending-up-outline' },
  { value: 'advanced', label: 'Advanced', description: 'Several years of structured training', icon: 'trophy-outline' },
];

export const FREQUENCY_OPTIONS: readonly ChoiceOption<TrainingDaysPerWeek>[] = TRAINING_DAYS_PER_WEEK.map(
  (days) => ({ value: days, label: String(days), description: 'days' }),
);

export const LOCATION_OPTIONS: readonly ChoiceOption<TrainingLocation>[] = [
  { value: 'gym', label: 'Gym', icon: 'business-outline' },
  { value: 'home', label: 'Home', icon: 'home-outline' },
  { value: 'both', label: 'Both', icon: 'swap-horizontal-outline' },
];

const LOCATION_DESCRIPTIONS: Readonly<Record<TrainingLocation, string>> = {
  gym: 'Access to a gym',
  home: 'Training at home',
  both: 'A mix of gym and home',
};

/** The location cards on the onboarding location screen, with a picture each. */
export const LOCATION_CARD_OPTIONS: readonly ChoiceOption<TrainingLocation>[] = LOCATION_OPTIONS.map((option) => ({
  ...option,
  description: LOCATION_DESCRIPTIONS[option.value],
  media: { src: LOCATION_PHOTOS[option.value], icon: option.icon ?? 'business-outline' },
}));

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

/** Icons for the equipment tiles (generic shapes; no equipment artwork ships yet). */
export const EQUIPMENT_ICONS: Readonly<Record<EquipmentId, string>> = {
  'full-gym': 'business-outline',
  dumbbells: 'barbell-outline',
  barbells: 'barbell',
  'cable-machine': 'git-commit-outline',
  machines: 'cog-outline',
  'resistance-bands': 'infinite-outline',
  'pull-up-bar': 'remove-outline',
  bench: 'bed-outline',
  'bodyweight-only': 'body-outline',
  other: 'ellipsis-horizontal-outline',
};

export const ACTIVITY_OPTIONS: readonly ChoiceOption<ActivityLevel>[] = [
  { value: 'sedentary', label: 'Mostly sedentary', description: 'Mostly sitting during the day', icon: 'laptop-outline' },
  { value: 'lightly-active', label: 'Lightly active', description: 'Some walking and regular daily movement', icon: 'walk-outline' },
  { value: 'moderately-active', label: 'Moderately active', description: 'Active job or regular movement', icon: 'bicycle-outline' },
  { value: 'very-active', label: 'Very active', description: 'Physically demanding lifestyle', icon: 'flash-outline' },
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
