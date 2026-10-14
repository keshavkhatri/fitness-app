import { UserFitnessProfile, currentAge, formatHeight } from '../../domain/fitness-profile';
import { GOAL_OPTIONS } from '../onboarding/onboarding-content';

/**
 * Presentation for the You hub. Everything comes from the saved profile and
 * identity; a missing value is left out (never a placeholder age or height).
 */

export interface YouHeaderView {
  /** null until a name is saved. */
  readonly name: string | null;
  /** "31 years · 178 cm", the parts that are known; null without a profile. */
  readonly details: string | null;
}

export interface GoalView {
  readonly label: string;
  readonly description: string;
  readonly icon: string;
}

export function toYouHeader(name: string | null, profile: UserFitnessProfile | null, now: Date): YouHeaderView {
  if (!profile) {
    return { name, details: null };
  }
  const age = currentAge(profile.dateOfBirth, now);
  const parts = [age !== null ? `${age} years` : null, formatHeight(profile.height, profile.unitSystem)].filter((p): p is string => !!p);
  return { name, details: parts.length ? parts.join(' · ') : null };
}

/** The profile's primary goal, with the onboarding wording; null without a profile. */
export function toGoal(profile: UserFitnessProfile | null): GoalView | null {
  const option = profile ? GOAL_OPTIONS.find((o) => o.value === profile.primaryGoal) : undefined;
  return option ? { label: option.label, description: option.description ?? '', icon: option.icon ?? 'flag-outline' } : null;
}

export type YouDestination = 'profile' | 'weight' | 'measurements' | 'body-composition' | 'review' | 'quick-add';

export interface YouTileView {
  readonly id: YouDestination;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  /** Opens a sheet rather than a screen. */
  readonly dialog: boolean;
}

/** Entry points to the screens that exist (no decorative tiles). */
export const YOU_TILES: readonly YouTileView[] = [
  { id: 'profile', title: 'Profile', description: 'Personal details', icon: 'person-outline', dialog: false },
  { id: 'weight', title: 'Weight', description: 'Track your weight', icon: 'scale-outline', dialog: false },
  { id: 'measurements', title: 'Body measurements', description: 'Waist, chest, arms…', icon: 'resize-outline', dialog: false },
  { id: 'body-composition', title: 'Body composition', description: 'InBody reports', icon: 'pulse-outline', dialog: false },
  { id: 'review', title: 'Fitness review', description: 'Your week in review', icon: 'stats-chart-outline', dialog: false },
  { id: 'quick-add', title: 'Quick add', description: 'Log food, weight or a workout', icon: 'add', dialog: true },
];
