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
}

const MISSING = 'Not answered';

/**
 * Human-readable profile summary, in the user's unit system. Pure, for easy testing.
 * Shows age derived from date of birth, never the birth date itself.
 */
export function buildSummaryRows(draft: OnboardingDraft, now: Date = new Date()): SummaryRow[] {
  const { basics, unitSystem } = draft;
  const age = basics ? currentAge(basics.dateOfBirth, now) : null;
  const days = draft.trainingDaysPerWeek;

  const rows: SummaryRow[] = [
    { id: 'goal', label: 'Goal', value: draft.primaryGoal ? labelFor(GOAL_OPTIONS, draft.primaryGoal) : MISSING, editStep: 'goal' },
    { id: 'age', label: 'Age', value: age !== null ? `${age} years` : MISSING, editStep: 'basics' },
    { id: 'sex', label: 'Sex', value: basics ? labelFor(SEX_OPTIONS, basics.sex) : MISSING, editStep: 'basics' },
    { id: 'height', label: 'Height', value: basics ? formatHeight(basics.height, unitSystem) : MISSING, editStep: 'basics' },
    { id: 'weight', label: 'Weight', value: basics ? formatWeight(basics.weight, unitSystem) : MISSING, editStep: 'basics' },
    {
      id: 'units',
      label: 'Units',
      value: UNIT_SYSTEM_OPTIONS.find((o) => o.value === unitSystem)?.label ?? unitSystem,
      editStep: 'basics',
    },
    {
      id: 'experience',
      label: 'Experience',
      value: draft.trainingExperience ? labelFor(EXPERIENCE_OPTIONS, draft.trainingExperience) : MISSING,
      editStep: 'experience',
    },
    { id: 'training', label: 'Training', value: days ? `${days} days/week` : MISSING, editStep: 'frequency' },
    {
      id: 'location',
      label: 'Location',
      value: draft.trainingLocation ? labelFor(LOCATION_OPTIONS, draft.trainingLocation) : MISSING,
      editStep: 'location',
    },
    {
      id: 'equipment',
      label: 'Equipment',
      value: draft.equipment.length ? draft.equipment.map((id) => EQUIPMENT_LABELS[id]).join(', ') : MISSING,
      editStep: 'equipment',
    },
    {
      id: 'activity',
      label: 'Activity',
      value: draft.activityLevel ? labelFor(ACTIVITY_OPTIONS, draft.activityLevel) : MISSING,
      editStep: 'activity',
    },
  ];

  if (hasApplicableGoalTargets(draft.primaryGoal)) {
    const target = draft.goalTarget.targetWeight;
    rows.push({
      id: 'target-weight',
      label: 'Target weight',
      value: target ? formatWeight(target, unitSystem) : 'Not set',
      editStep: 'goal-target',
    });
  }

  return rows;
}
