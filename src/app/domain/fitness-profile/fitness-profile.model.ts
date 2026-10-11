import { IsoCalendarDate } from './date-of-birth';

/**
 * Fitness profile domain model.
 *
 * Framework-free and JSON-serialisable so it can be persisted locally today
 * and sent to / received from the API later. Consumed by future workout,
 * nutrition, body-composition and recommendation engines.
 *
 * Conventions:
 * - Closed sets are `as const` arrays + derived union types (stable string
 *   values for storage/API, plus runtime lists for validation and UI).
 * - Body measurements are stored canonically in metric (cm / kg).
 *   `unitSystem` is a display preference only.
 */

export const PRIMARY_GOALS = ['lose-fat', 'build-muscle', 'recomposition', 'get-stronger', 'improve-fitness'] as const;
export type PrimaryGoal = (typeof PRIMARY_GOALS)[number];

export const SEXES = ['male', 'female', 'prefer-not-to-say'] as const;
export type Sex = (typeof SEXES)[number];

export const UNIT_SYSTEMS = ['metric', 'imperial'] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export const TRAINING_EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type TrainingExperience = (typeof TRAINING_EXPERIENCE_LEVELS)[number];

/** Matches what workout programming supports (2–6). There is deliberately no 7-day option. */
export const TRAINING_DAYS_PER_WEEK = [2, 3, 4, 5, 6] as const;
export type TrainingDaysPerWeek = (typeof TRAINING_DAYS_PER_WEEK)[number];

export const TRAINING_LOCATIONS = ['gym', 'home', 'both'] as const;
export type TrainingLocation = (typeof TRAINING_LOCATIONS)[number];

export const ACTIVITY_LEVELS = ['sedentary', 'lightly-active', 'moderately-active', 'very-active'] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const EQUIPMENT_IDS = [
  'full-gym',
  'dumbbells',
  'barbells',
  'cable-machine',
  'machines',
  'resistance-bands',
  'pull-up-bar',
  'bench',
  'bodyweight-only',
  'other',
] as const;
export type EquipmentId = (typeof EQUIPMENT_IDS)[number];

/** Height, canonically in centimeters. */
export interface BodyHeight {
  readonly centimeters: number;
}

/** Body mass, canonically in kilograms. */
export interface BodyWeight {
  readonly kilograms: number;
}

/**
 * Goal-specific targets. Every field is optional/nullable; which fields apply
 * to which goal is defined by `GOAL_TARGET_POLICIES` (goal-targets.ts).
 * New target kinds are added here as new nullable fields.
 */
export interface GoalTarget {
  readonly targetWeight: BodyWeight | null;
}

/**
 * A maintenance-calorie figure the user explicitly accepted from a Calorie
 * Check-in (logged intake compared with the weight trend over the same
 * period). When present, the calculation engine uses it instead of the
 * formula's estimated maintenance; goal adjustment, safety threshold and
 * macros are still applied by the engine. Never set without confirmation.
 */
export interface EnergyCalibration {
  /** Whole kcal/day, within MAINTENANCE_KCAL. */
  readonly maintenanceKcal: number;
  /** The observed period it came from (inclusive local dates). */
  readonly observedFrom: IsoCalendarDate;
  readonly observedTo: IsoCalendarDate;
  /** ISO-8601 timestamp of the confirmation. */
  readonly acceptedAt: string;
}

export interface UserFitnessProfile {
  readonly primaryGoal: PrimaryGoal;
  /**
   * Calendar date of birth ("YYYY-MM-DD"). Stored instead of age, which goes
   * stale; derive age when needed with `currentAge` (date-of-birth.ts).
   */
  readonly dateOfBirth: IsoCalendarDate;
  readonly sex: Sex;
  readonly height: BodyHeight;
  /**
   * Starting/current body weight captured when the profile was created or
   * updated. Deliberately a single value, not a history: weight tracking over
   * time will use a separate measurement model.
   */
  readonly weight: BodyWeight;
  readonly unitSystem: UnitSystem;
  readonly trainingExperience: TrainingExperience;
  readonly trainingDaysPerWeek: TrainingDaysPerWeek;
  readonly trainingLocation: TrainingLocation;
  readonly equipment: readonly EquipmentId[];
  readonly activityLevel: ActivityLevel;
  readonly goalTarget: GoalTarget;
  /** Absent until the user accepts a Calorie Check-in adjustment. */
  readonly energyCalibration?: EnergyCalibration;
  /** ISO-8601 timestamp of the last profile save. */
  readonly updatedAt: string;
}

export const EMPTY_GOAL_TARGET: GoalTarget = { targetWeight: null };

/** Type guard factory for the closed sets above. */
export function isOneOf<T extends string | number>(values: readonly T[]) {
  return (value: unknown): value is T => (values as readonly unknown[]).includes(value);
}

export const isPrimaryGoal = isOneOf(PRIMARY_GOALS);
export const isSex = isOneOf(SEXES);
export const isUnitSystem = isOneOf(UNIT_SYSTEMS);
export const isTrainingExperience = isOneOf(TRAINING_EXPERIENCE_LEVELS);
export const isTrainingDaysPerWeek = isOneOf(TRAINING_DAYS_PER_WEEK);
export const isTrainingLocation = isOneOf(TRAINING_LOCATIONS);
export const isActivityLevel = isOneOf(ACTIVITY_LEVELS);
export const isEquipmentId = isOneOf(EQUIPMENT_IDS);
