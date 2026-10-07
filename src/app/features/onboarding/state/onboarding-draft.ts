import {
  ActivityLevel,
  BodyHeight,
  BodyWeight,
  IsoCalendarDate,
  EMPTY_GOAL_TARGET,
  EquipmentId,
  GoalTarget,
  PrimaryGoal,
  Sex,
  TrainingDaysPerWeek,
  TrainingExperience,
  TrainingLocation,
  UnitSystem,
  UserFitnessProfile,
  isActivityLevel,
  isPrimaryGoal,
  isSex,
  isTrainingDaysPerWeek,
  isTrainingExperience,
  isTrainingLocation,
  isUnitSystem,
  normalizeGoalTarget,
  parseDateOfBirth,
  parseBodyHeight,
  parseBodyWeight,
  parseEquipment,
  parseGoalTarget,
  pruneEquipmentForLocation,
} from '../../../domain/fitness-profile';

/** Validated answers from the Basic Information step. */
export interface BasicInfo {
  readonly dateOfBirth: IsoCalendarDate;
  readonly sex: Sex;
  readonly height: BodyHeight;
  readonly weight: BodyWeight;
}

/**
 * In-progress onboarding answers. Every answer is already typed and
 * validated; `null` means "not answered yet".
 */
export interface OnboardingDraft {
  readonly primaryGoal: PrimaryGoal | null;
  readonly unitSystem: UnitSystem;
  readonly basics: BasicInfo | null;
  readonly trainingExperience: TrainingExperience | null;
  readonly trainingDaysPerWeek: TrainingDaysPerWeek | null;
  readonly trainingLocation: TrainingLocation | null;
  readonly equipment: readonly EquipmentId[];
  readonly activityLevel: ActivityLevel | null;
  readonly goalTarget: GoalTarget;
}

export const EMPTY_DRAFT: OnboardingDraft = {
  primaryGoal: null,
  unitSystem: 'metric',
  basics: null,
  trainingExperience: null,
  trainingDaysPerWeek: null,
  trainingLocation: null,
  equipment: [],
  activityLevel: null,
  goalTarget: EMPTY_GOAL_TARGET,
};

/**
 * Applies a change and keeps dependent answers consistent:
 * - changing the goal drops targets that no longer apply (or point the wrong way);
 * - changing location drops equipment not offered there.
 */
export function applyDraftChange(draft: OnboardingDraft, change: Partial<OnboardingDraft>): OnboardingDraft {
  const next = { ...draft, ...change };
  const goalChanged = change.primaryGoal !== undefined && change.primaryGoal !== draft.primaryGoal;
  const locationChanged = change.trainingLocation != null && change.trainingLocation !== draft.trainingLocation;

  return {
    ...next,
    goalTarget: goalChanged ? EMPTY_GOAL_TARGET : normalizeGoalTarget(next.primaryGoal, next.goalTarget),
    equipment:
      locationChanged && next.trainingLocation
        ? pruneEquipmentForLocation(next.equipment, next.trainingLocation)
        : next.equipment,
  };
}

/** Builds the final profile, or null if any required answer is missing. */
export function toFitnessProfile(draft: OnboardingDraft, now: Date): UserFitnessProfile | null {
  const { primaryGoal, basics, trainingExperience, trainingDaysPerWeek, trainingLocation, activityLevel } = draft;
  if (
    !primaryGoal ||
    !basics ||
    !trainingExperience ||
    !trainingDaysPerWeek ||
    !trainingLocation ||
    !activityLevel ||
    draft.equipment.length === 0
  ) {
    return null;
  }
  return {
    primaryGoal,
    ...basics,
    unitSystem: draft.unitSystem,
    trainingExperience,
    trainingDaysPerWeek,
    trainingLocation,
    equipment: [...draft.equipment],
    activityLevel,
    goalTarget: normalizeGoalTarget(primaryGoal, draft.goalTarget),
    updatedAt: now.toISOString(),
  };
}

/**
 * Rebuilds a draft from untrusted stored data, keeping only valid answers.
 * Anything unrecognised is treated as unanswered rather than failing restore.
 */
export function sanitizeDraft(value: unknown): OnboardingDraft {
  if (typeof value !== 'object' || value === null) {
    return EMPTY_DRAFT;
  }
  const raw = value as Record<string, unknown>;
  const basics = raw['basics'] as Record<string, unknown> | null | undefined;
  const dateOfBirth = parseDateOfBirth(basics?.['dateOfBirth']);
  const height = parseBodyHeight(basics?.['height']);
  const weight = parseBodyWeight(basics?.['weight']);
  const sex = basics?.['sex'];

  const primaryGoal = isPrimaryGoal(raw['primaryGoal']) ? raw['primaryGoal'] : null;
  const trainingLocation = isTrainingLocation(raw['trainingLocation']) ? raw['trainingLocation'] : null;
  const equipment = parseEquipment(raw['equipment']);

  return {
    primaryGoal,
    unitSystem: isUnitSystem(raw['unitSystem']) ? raw['unitSystem'] : 'metric',
    basics: dateOfBirth && height && weight && isSex(sex) ? { dateOfBirth, sex, height, weight } : null,
    trainingExperience: isTrainingExperience(raw['trainingExperience']) ? raw['trainingExperience'] : null,
    trainingDaysPerWeek: isTrainingDaysPerWeek(raw['trainingDaysPerWeek']) ? raw['trainingDaysPerWeek'] : null,
    trainingLocation,
    equipment: trainingLocation ? pruneEquipmentForLocation(equipment, trainingLocation) : equipment,
    activityLevel: isActivityLevel(raw['activityLevel']) ? raw['activityLevel'] : null,
    goalTarget: normalizeGoalTarget(primaryGoal, parseGoalTarget(raw['goalTarget'])),
  };
}
