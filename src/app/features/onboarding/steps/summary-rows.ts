import { currentAge, formatHeight, formatWeight, hasApplicableGoalTargets } from '../../../domain/fitness-profile';
import {
  ACTIVITY_OPTIONS,
  EQUIPMENT_LABELS,
  EXPERIENCE_OPTIONS,
  GOAL_OPTIONS,
  LOCATION_OPTIONS,
  SEX_OPTIONS,
  UNIT_SYSTEM_OPTIONS,
  labelFor,
} from '../onboarding-content';
import { OnboardingDraft } from '../state/onboarding-draft';
import { OnboardingStepId } from '../state/onboarding-steps';

export interface SummaryRow {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  /** Step that edits this value. */
  readonly editStep: OnboardingStepId;
  /** Decorative icon leading the row (first-run review). */
  readonly icon?: string;
}

const MISSING = 'Not answered';

/**
 * Human-readable profile summary, in the user's unit system. Pure, for easy testing.
 * Shows age derived from date of birth, never the birth date itself.
 */
export function buildSummaryRows(draft: OnboardingDraft, now: Date = new Date()): SummaryRow[] {
  const { basics, unitSystem } = draft;
  const age = basics.dateOfBirth ? currentAge(basics.dateOfBirth, now) : null;
  const days = draft.trainingDaysPerWeek;

  // In the order the questions are asked.
  const rows: SummaryRow[] = [
    { id: 'name', label: 'Name', value: draft.name ?? MISSING, editStep: 'basics', icon: 'person-outline' },
    { id: 'age', label: 'Age', value: age !== null ? `${age} years` : MISSING, editStep: 'basics', icon: 'calendar-outline' },
    { id: 'sex', label: 'Sex', value: basics.sex ? labelFor(SEX_OPTIONS, basics.sex) : MISSING, editStep: 'basics', icon: 'body-outline' },
    {
      id: 'height',
      label: 'Height',
      value: basics.height ? formatHeight(basics.height, unitSystem) : MISSING,
      editStep: 'height',
      icon: 'resize-outline',
    },
    {
      id: 'weight',
      label: 'Weight',
      value: basics.weight ? formatWeight(basics.weight, unitSystem) : MISSING,
      editStep: 'weight',
      icon: 'scale-outline',
    },
    {
      id: 'units',
      label: 'Units',
      value: UNIT_SYSTEM_OPTIONS.find((o) => o.value === unitSystem)?.label ?? unitSystem,
      editStep: 'height',
      icon: 'swap-horizontal-outline',
    },
    {
      id: 'activity',
      label: 'Activity',
      value: draft.activityLevel ? labelFor(ACTIVITY_OPTIONS, draft.activityLevel) : MISSING,
      editStep: 'activity',
      icon: 'walk-outline',
    },
    {
      id: 'goal',
      label: 'Goal',
      value: draft.primaryGoal ? labelFor(GOAL_OPTIONS, draft.primaryGoal) : MISSING,
      editStep: 'goal',
      icon: 'trophy-outline',
    },
  ];

  if (hasApplicableGoalTargets(draft.primaryGoal)) {
    const target = draft.goalTarget.targetWeight;
    rows.push({
      id: 'target-weight',
      label: 'Target weight',
      value: target ? formatWeight(target, unitSystem) : 'Not set',
      editStep: 'goal-target',
      icon: 'flag-outline',
    });
  }

  rows.push(
    {
      id: 'experience',
      label: 'Experience',
      value: draft.trainingExperience ? labelFor(EXPERIENCE_OPTIONS, draft.trainingExperience) : MISSING,
      editStep: 'experience',
      icon: 'trending-up-outline',
    },
    { id: 'training', label: 'Training', value: days ? `${days} days/week` : MISSING, editStep: 'frequency', icon: 'time-outline' },
    {
      id: 'location',
      label: 'Location',
      value: draft.trainingLocation ? labelFor(LOCATION_OPTIONS, draft.trainingLocation) : MISSING,
      editStep: 'location',
      icon: 'business-outline',
    },
    {
      id: 'equipment',
      label: 'Equipment',
      value: draft.equipment.length ? draft.equipment.map((id) => EQUIPMENT_LABELS[id]).join(', ') : MISSING,
      editStep: 'equipment',
      icon: 'barbell-outline',
    },
  );

  return rows;
}

export interface SummaryGroup {
  readonly id: 'personal' | 'goal' | 'training';
  readonly title: string;
  readonly rows: readonly SummaryRow[];
}

const GROUP_OF: Readonly<Record<string, SummaryGroup['id']>> = {
  name: 'personal',
  age: 'personal',
  sex: 'personal',
  height: 'personal',
  weight: 'personal',
  units: 'personal',
  activity: 'personal',
  goal: 'goal',
  'target-weight': 'goal',
  experience: 'training',
  training: 'training',
  location: 'training',
  equipment: 'training',
};
const GROUP_TITLES: Readonly<Record<SummaryGroup['id'], string>> = { personal: 'Personal details', goal: 'Goal', training: 'Training' };

/** The same rows, grouped for the Profile editor (every row lands in exactly one group, order kept). */
export function groupSummaryRows(rows: readonly SummaryRow[]): SummaryGroup[] {
  return (['personal', 'goal', 'training'] as const)
    .map((id) => ({ id, title: GROUP_TITLES[id], rows: rows.filter((r) => (GROUP_OF[r.id] ?? 'personal') === id) }))
    .filter((g) => g.rows.length > 0);
}
