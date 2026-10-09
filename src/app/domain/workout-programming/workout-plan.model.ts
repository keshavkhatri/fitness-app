import { IsoCalendarDate, PrimaryGoal, TrainingExperience } from '../fitness-profile';
import { NumberRange, WorkoutProgrammingVersion } from './workout-config';
import {
  ActivityDayType,
  ActivityKind,
  DayType,
  MovementClass,
  MovementPattern,
  ObjectiveRole,
  PrescriptionProfile,
  ProgramStyle,
  SequenceCategory,
  SessionType,
  SplitStrategy,
  VolumeGroup,
  WorkoutEquipment,
  WorkoutFrequency,
  WorkoutLocation,
} from './workout-taxonomy';

/**
 * A generated, versioned, self-describing workout plan. All explanation is
 * structured (codes and numbers) for a future UI/AI layer to phrase.
 * No starting loads: actual weights come from workout logging later.
 */
export interface WorkoutPlan {
  /** Deterministic: derived from version, normalized input, configuration and catalog. */
  readonly id: string;
  readonly workoutProgrammingVersion: WorkoutProgrammingVersion;
  readonly generatedAt: IsoCalendarDate;
  readonly goal: PrimaryGoal;
  readonly experience: TrainingExperience;
  readonly daysPerWeek: WorkoutFrequency;
  readonly programStyle: ProgramStyle;
  /** One entry per available training day, in order (resistance and activity days). */
  readonly split: { readonly strategy: SplitStrategy; readonly sessionTypes: readonly DayType[] };
  /** Every planned day, in order. Discriminate on `kind`. */
  readonly sessions: readonly PlanSession[];
  readonly progressionStrategy: ProgressionStrategy;
  readonly explanation: PlanExplanation;
  readonly assumptions: readonly PlanAssumption[];
  readonly warnings: readonly PlanWarning[];
}

export type PlanSession = WorkoutSession | ActivitySession;

/** A resistance-training session. */
export interface WorkoutSession {
  readonly kind: 'resistance';
  /** Stable within the plan, e.g. "day-2-lower". */
  readonly id: string;
  /** Canonical English label, e.g. "Upper A" (catalog-style data; UI may localize from type + variant). */
  readonly name: string;
  /** 1-based position in the weekly rotation (not a weekday). */
  readonly dayIndex: number;
  readonly sessionType: SessionType;
  /** "A", "B", … when the same session type repeats in the week; null when it occurs once. */
  readonly variant: string | null;
  readonly templateId: string;
  /** Rough estimate, rounded up; not exact. */
  readonly estimatedDurationMinutes: number;
  /** In training order (see sequencing). */
  readonly exercises: readonly PlannedExercise[];
  /** What happened to every objective of the session template. */
  readonly objectives: readonly ObjectiveCoverage[];
}

/**
 * A light, non-resistance day (recovery walk, mobility, easy conditioning).
 * Holds no exercises: it is guidance on duration and intensity only.
 */
export interface ActivitySession {
  readonly kind: 'activity';
  /** Stable within the plan, e.g. "day-2-light-activity". */
  readonly id: string;
  readonly name: string;
  readonly dayIndex: number;
  readonly sessionType: ActivityDayType;
  /** Optional days may be skipped without affecting the plan. */
  readonly optional: boolean;
  readonly intensity: 'easy';
  readonly durationMinutes: { readonly min: number; readonly max: number };
  readonly suggestedActivities: readonly ActivityKind[];
  /** Upper end of the duration range (for summaries like "30 min"). */
  readonly estimatedDurationMinutes: number;
  /** Always empty: activity days are not resistance workouts. */
  readonly exercises: readonly [];
}

// --- Objective coverage ----------------------------------------------------------

export type CoverageStatus = 'filled' | 'substituted' | 'unfilled' | 'not-selected';
export type CoverageReason = 'no-compatible-exercise' | 'no-full-movement-available' | 'session-budget-reached';

export interface ObjectiveCoverage {
  readonly objectiveId: string;
  readonly role: ObjectiveRole;
  readonly required: boolean;
  /**
   * filled: a full instance of the movement; substituted: an explicitly
   * allowed substitute class (e.g. scapular for a pull); unfilled: nothing
   * compatible (optional objectives only, in a returned plan);
   * not-selected: optional and the session budget was used elsewhere.
   */
  readonly status: CoverageStatus;
  readonly exerciseId: string | null;
  readonly reason: CoverageReason | null;
}

// --- Planned exercise ---------------------------------------------------------------

export type ExerciseTarget =
  | { readonly kind: 'reps'; readonly min: number; readonly max: number }
  | { readonly kind: 'time'; readonly seconds: number };

/** Structured notes; the UI decides wording. */
export type PrescriptionNote = 'per-side' | 'time-based' | 'bodyweight';

/**
 * Why an exercise appears more than once a week:
 * - foundational: intentional repetition (skill practice, consistent progression);
 * - repeated: the objective prefers variety but no comparable alternative was available;
 * - single: used once this week.
 */
export type WeeklyRepetition = 'foundational' | 'repeated' | 'single';

export interface VolumeAdjustment {
  /** Net change to the profile's default set count. */
  readonly setsDelta: number;
  readonly groups: readonly VolumeGroup[];
  readonly reason:
    | 'weekly-volume-below-target'
    | 'weekly-volume-above-target'
    | 'session-duration-below-target'
    | 'session-duration-above-target';
}

export interface PlannedExercise {
  readonly exerciseId: string;
  /** 1-based order within the session. */
  readonly order: number;
  readonly sets: number;
  readonly target: ExerciseTarget;
  readonly restSeconds: number;
  readonly notes: readonly PrescriptionNote[];
  readonly prescriptionProfile: PrescriptionProfile;
  readonly sequenceCategory: SequenceCategory;
  readonly progression: ProgressionRule;
  readonly selection: SelectionExplanation;
  readonly volumeAdjustment: VolumeAdjustment | null;
  readonly weeklyRepetition: WeeklyRepetition;
}

// --- Progression -------------------------------------------------------------------

/** Neighbouring steps in a progression chain, limited to what the user can perform. */
export interface ChainPosition {
  readonly chainId: string;
  /** Easier available step (null at the bottom or when unavailable). */
  readonly regression: string | null;
  /** Harder available step (null at the top or when unavailable). */
  readonly progression: string | null;
}

/**
 * How to progress an exercise from session to session. Rules only; applying
 * them needs workout history (a later feature).
 */
export type ProgressionRule =
  | {
      /** Add reps within the range; once every set reaches the top, increase load. */
      readonly type: 'double-progression';
      readonly lowerRepBound: number;
      readonly upperRepBound: number;
      readonly loadIncreasePercent: number;
      readonly advanceWhen: 'all-sets-at-upper-bound';
    }
  | {
      /** Bodyweight/band: add reps up to the top of the range, then move to the next chain step. */
      readonly type: 'rep-progression';
      readonly lowerRepBound: number;
      readonly upperRepBound: number;
      readonly advanceWhen: 'all-sets-at-upper-bound';
      readonly thenProgressBy: 'harder-variation';
      /** Null when the exercise belongs to no progression chain. */
      readonly chain: ChainPosition | null;
    }
  | {
      /** Timed work: add seconds per session up to a cap, then the next chain step if any. */
      readonly type: 'time-progression';
      readonly startSeconds: number;
      readonly incrementSeconds: number;
      readonly maxSeconds: number;
      readonly chain: ChainPosition | null;
    };

export type ProgressionType = ProgressionRule['type'];

export interface ProgressionStrategy {
  readonly loadedExercises: 'double-progression';
  readonly bodyweightExercises: 'rep-progression';
  readonly timedExercises: 'time-progression';
  readonly loadIncreasePercent: number;
  readonly timeIncrementSeconds: number;
  readonly maxTimeSeconds: number;
  /** Progression applies session-to-session; no history-based adjustment yet. */
  readonly historyBased: false;
}

// --- Explanation -------------------------------------------------------------------

export type SelectionReason =
  | 'preferred-pattern'
  | 'fallback-pattern'
  | 'substitute-class'
  | 'compound-for-main-objective'
  | 'isolation-in-main-objective'
  | 'loadable-for-goal'
  | 'free-weight-for-strength'
  | 'experience-match'
  | 'supported-for-beginner'
  | 'free-weight-for-advanced'
  | 'unilateral-for-general-fitness'
  | 'staple-exercise'
  | 'fallback-exercise'
  | 'curated-for-style'
  | 'regression-step'
  | 'muscle-overlap-penalty'
  | 'excess-fatigue-penalty'
  | 'weekly-repeat-penalty'
  | 'weekly-volume-deficit'
  | 'tie-broken-by-id';

export interface SelectionExplanation {
  readonly objectiveId: string;
  readonly role: ObjectiveRole;
  readonly matchedPattern: MovementPattern;
  readonly movementClass: MovementClass;
  readonly substitute: boolean;
  readonly score: number;
  readonly candidateCount: number;
  readonly reasons: readonly SelectionReason[];
}

export interface WeeklyVolumeEntry {
  /** Direct (primary-muscle) working sets per week. */
  readonly sets: number;
  /** Configured range, with the minimum scaled to the number of resistance sessions. */
  readonly target: NumberRange;
  readonly status: 'below' | 'within' | 'above';
}

export interface PlanExplanation {
  readonly split: {
    /** Days per week the user asked for. */
    readonly frequency: WorkoutFrequency;
    /** How many of those days are resistance sessions (may be fewer than requested). */
    readonly resistanceSessions: number;
    /** Light/recovery days filling the rest of the requested frequency. */
    readonly activityDays: number;
    readonly goal: PrimaryGoal;
    readonly strategy: SplitStrategy;
    readonly source: 'frequency-default' | 'goal-override' | 'experience-override' | 'equipment-fallback';
    /** Set when the configured split could not be built and the fallback was used. */
    readonly replacedStrategy: SplitStrategy | null;
  };
  readonly volume: {
    readonly programStyle: ProgramStyle;
    readonly experience: TrainingExperience;
    readonly exercisesPerSession: number;
    readonly conditioningFinisher: boolean;
    readonly variationRoles: readonly ObjectiveRole[];
  };
  readonly weeklyVolume: Readonly<Record<VolumeGroup, WeeklyVolumeEntry>>;
  readonly availability: {
    readonly locations: readonly WorkoutLocation[];
    readonly equipment: readonly WorkoutEquipment[];
    readonly availableExerciseCount: number;
  };
}

export type PlanAssumption =
  | 'bodyweight-always-available'
  | 'no-starting-loads'
  | 'day-order-not-weekday-schedule'
  | 'combined-gym-and-home-equipment'
  | 'unrecognized-equipment-ignored'
  | 'full-gym-includes-all-equipment';

/** Things the plan could not do as intended. Required objectives never appear here unfilled. */
export type PlanWarning =
  | {
      readonly code: 'objective-unfilled';
      readonly sessionId: string;
      readonly objectiveId: string;
      readonly role: ObjectiveRole;
    }
  | {
      /** Honest limitation: e.g. no true pull exists for this equipment, scapular work is used instead. */
      readonly code: 'objective-substituted';
      readonly sessionId: string;
      readonly objectiveId: string;
      readonly exerciseId: string;
      readonly substituteClass: MovementClass;
    }
  | {
      readonly code: 'weekly-volume-outside-target';
      readonly group: VolumeGroup;
      readonly sets: number;
      readonly target: NumberRange;
    };
