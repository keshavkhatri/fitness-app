/**
 * Controlled vocabularies for workout programming. Closed sets are `as const`
 * arrays + derived unions: stable string values for storage/API, runtime
 * lists for validation, and compile-time safety everywhere else.
 */

export const MOVEMENT_PATTERNS = [
  'horizontal-push',
  'horizontal-pull',
  'vertical-push',
  'vertical-pull',
  'squat',
  'hinge',
  'lunge',
  'knee-flexion',
  'knee-extension',
  'calf-raise',
  'elbow-flexion',
  'elbow-extension',
  'shoulder-abduction', // lateral raises
  'shoulder-horizontal-abduction', // rear-delt work
  'core-flexion',
  'anti-extension',
  'anti-rotation',
  'carry',
  'conditioning',
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export const MUSCLE_GROUPS = [
  'chest',
  'lats',
  'upper-back',
  'front-delts',
  'side-delts',
  'rear-delts',
  'biceps',
  'triceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'adductors',
  'calves',
  'abs',
  'obliques',
  'lower-back',
  'cardiovascular',
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

/**
 * How fully an exercise trains its movement pattern:
 * - full: a genuine instance of the pattern (e.g. a row is a true pull);
 * - scapular: posterior-shoulder/scapular work in the pattern's direction
 *   (e.g. prone Y raise), NOT a full replacement for a true pull;
 * - postural: low-load postural/positional accessory.
 * Objectives accept only `full` unless they explicitly allow a substitute class.
 */
export const MOVEMENT_CLASSES = ['full', 'scapular', 'postural'] as const;
export type MovementClass = (typeof MOVEMENT_CLASSES)[number];

/**
 * Selection tier: staples are preferred when suitable; fallbacks (mostly band
 * variants) are only chosen when nothing better satisfies the objective.
 */
export const EXERCISE_TIERS = ['staple', 'standard', 'fallback'] as const;
export type ExerciseTier = (typeof EXERCISE_TIERS)[number];

/** Systemic fatigue cost; used to avoid stacking heavy lifts in one session. */
/** Library browsing tags (the exercise picker's chips). Not used by plan generation. */
export const EXERCISE_CATEGORIES = ['strength', 'core', 'mobility', 'cardio'] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export const FATIGUE_COSTS = ['low', 'moderate', 'high'] as const;
export type FatigueCost = (typeof FATIGUE_COSTS)[number];

/**
 * Equipment an exercise can require. Bodyweight is not listed: an exercise
 * with no requirements is a bodyweight exercise and is always available.
 */
export const WORKOUT_EQUIPMENT = [
  'dumbbells',
  'barbell',
  'rack',
  'bench',
  'cable',
  'machine',
  'resistance-band',
  'pull-up-bar',
  'ab-wheel',
] as const;
export type WorkoutEquipment = (typeof WORKOUT_EQUIPMENT)[number];

export const WORKOUT_LOCATIONS = ['gym', 'home', 'outdoor'] as const;
export type WorkoutLocation = (typeof WORKOUT_LOCATIONS)[number];

export const WORKOUT_FREQUENCIES = [2, 3, 4, 5, 6] as const;
export type WorkoutFrequency = (typeof WORKOUT_FREQUENCIES)[number];

export const SESSION_TYPES = ['full-body', 'upper', 'lower', 'push', 'pull', 'legs'] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

/**
 * Non-resistance days in a split. They make "available training days"
 * explicit without pretending every day is a hard lifting session.
 */
export const ACTIVITY_DAY_TYPES = ['light-activity', 'optional-conditioning'] as const;
export type ActivityDayType = (typeof ACTIVITY_DAY_TYPES)[number];

/** One entry of a weekly split: a resistance session type or an activity day. */
export type DayType = SessionType | ActivityDayType;

/** Suggested activities for activity days (codes; the UI phrases them). */
export const ACTIVITY_KINDS = ['walking', 'easy-cycling', 'mobility', 'light-conditioning'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const SPLIT_STRATEGIES = [
  'full-body',
  'full-body-with-recovery',
  'upper-lower',
  'upper-lower-push-pull-legs',
  'push-pull-legs',
] as const;
export type SplitStrategy = (typeof SPLIT_STRATEGIES)[number];

/** What a training objective is for in a session; drives prescription, scoring and order. */
export const OBJECTIVE_ROLES = ['primary', 'secondary', 'accessory', 'core', 'conditioning'] as const;
export type ObjectiveRole = (typeof OBJECTIVE_ROLES)[number];

/** Programming emphasis derived from the goal. */
export const PROGRAM_STYLES = ['hypertrophy', 'strength', 'general'] as const;
export type ProgramStyle = (typeof PROGRAM_STYLES)[number];

/** Prescription profiles: sets / reps / rest families chosen per exercise and role. */
export const PRESCRIPTION_PROFILES = [
  'primary-compound',
  'secondary-compound',
  'unilateral-compound',
  'accessory',
  'low-load',
  'core',
  'conditioning',
] as const;
export type PrescriptionProfile = (typeof PRESCRIPTION_PROFILES)[number];

/** Exercise order categories within a session. */
export const SEQUENCE_CATEGORIES = [
  'primary-compound',
  'secondary-compound',
  'other-compound',
  'isolation',
  'arms',
  'core',
  'conditioning',
] as const;
export type SequenceCategory = (typeof SEQUENCE_CATEGORIES)[number];

/** Muscle groups tracked for weekly volume balance (direct sets). */
export const VOLUME_GROUPS = [
  'chest',
  'back',
  'quads',
  'hamstrings',
  'glutes',
  'side-delts',
  'rear-delts',
  'biceps',
  'triceps',
  'calves',
] as const;
export type VolumeGroup = (typeof VOLUME_GROUPS)[number];

/** Which volume group a muscle counts toward (untracked muscles map to null). */
export const VOLUME_GROUP_BY_MUSCLE: Readonly<Record<MuscleGroup, VolumeGroup | null>> = {
  chest: 'chest',
  lats: 'back',
  'upper-back': 'back',
  'front-delts': null,
  'side-delts': 'side-delts',
  'rear-delts': 'rear-delts',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: null,
  quads: 'quads',
  hamstrings: 'hamstrings',
  glutes: 'glutes',
  adductors: null,
  calves: 'calves',
  abs: null,
  obliques: null,
  'lower-back': null,
  cardiovascular: null,
};

export const isMember =
  <T extends string | number>(values: readonly T[]) =>
  (value: unknown): value is T =>
    (values as readonly unknown[]).includes(value);

export const isMovementPattern = isMember(MOVEMENT_PATTERNS);
export const isMuscleGroup = isMember(MUSCLE_GROUPS);
export const isMovementClass = isMember(MOVEMENT_CLASSES);
export const isExerciseTier = isMember(EXERCISE_TIERS);
export const isFatigueCost = isMember(FATIGUE_COSTS);
export const isExerciseCategory = isMember(EXERCISE_CATEGORIES);
export const isWorkoutEquipment = isMember(WORKOUT_EQUIPMENT);
export const isWorkoutLocation = isMember(WORKOUT_LOCATIONS);
export const isWorkoutFrequency = isMember(WORKOUT_FREQUENCIES);
export const isSessionType = isMember(SESSION_TYPES);
export const isActivityDayType = isMember(ACTIVITY_DAY_TYPES);
export const isActivityKind = isMember(ACTIVITY_KINDS);
export const isDayType = (value: unknown): value is DayType => isSessionType(value) || isActivityDayType(value);
export const isObjectiveRole = isMember(OBJECTIVE_ROLES);
export const isSequenceCategory = isMember(SEQUENCE_CATEGORIES);
export const isVolumeGroup = isMember(VOLUME_GROUPS);
