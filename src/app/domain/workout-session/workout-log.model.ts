import { ExerciseTarget, SessionType, WorkoutProgrammingVersion } from '../workout-programming';

/**
 * A performed workout: what the user actually did, recorded separately from
 * the plan (which is the prescription and never changes when sets are logged).
 *
 * Named `WorkoutLog` rather than `WorkoutSession` because the plan already
 * has a `WorkoutSession` (the planned session). One plan session can have many
 * logs over time.
 *
 * Everything needed to execute and later review the workout is snapshotted at
 * start, so a log never depends on the plan it came from still existing.
 */
export interface WorkoutLog {
  /** Unique per execution. */
  readonly id: string;
  readonly source: WorkoutLogSource;
  readonly sessionType: SessionType;
  /** "A", "B", … as in the plan; null when the type occurs once a week. */
  readonly variant: string | null;
  /** Unit every weight in this log is recorded in. */
  readonly weightUnit: WeightUnit;
  /** ISO-8601 instants. */
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly status: WorkoutLogStatus;
  /** The exercise the user is on (0-based); kept so an interrupted workout resumes in place. */
  readonly currentExerciseIndex: number;
  readonly exercises: readonly ExerciseLog[];
}

export type WorkoutLogStatus = 'in-progress' | 'completed';
export type WeightUnit = 'kg' | 'lb';

/** Which plan and planned session this execution came from. */
export interface WorkoutLogSource {
  readonly planId: string;
  readonly workoutProgrammingVersion: WorkoutProgrammingVersion;
  readonly sessionId: string;
}

/**
 * What the user records for an exercise:
 * - weight-reps: an external load (dumbbells, barbell, cable, machine) and reps;
 * - reps: bodyweight or band work (no weight field);
 * - duration: timed work, in seconds.
 */
export type LoggingMode = 'weight-reps' | 'reps' | 'duration';

export interface ExerciseLog {
  readonly exerciseId: string;
  /** Catalog name at start time. */
  readonly name: string;
  /** 1-based programmed order. */
  readonly order: number;
  readonly planned: PlannedPrescription;
  /** The user's own rest between sets for this exercise; the planned rest applies when absent. */
  readonly customRestSeconds?: number;
  readonly logging: LoggingMode;
  /** One per planned set, in order. */
  readonly sets: readonly SetLog[];
}

/** The plan's prescription, copied at start (never reread from the plan). */
export interface PlannedPrescription {
  readonly sets: number;
  readonly target: ExerciseTarget;
  readonly restSeconds: number;
  readonly perSide: boolean;
}

/**
 * Explicit status: never inferred from missing values.
 * Result values are present only on completed sets.
 */
export type SetStatus = 'pending' | 'completed' | 'skipped';

export interface SetLog {
  /** 1-based. */
  readonly setNumber: number;
  readonly status: SetStatus;
  readonly weight: number | null;
  readonly reps: number | null;
  readonly durationSeconds: number | null;
  readonly completedAt: string | null;
}

/** Values entered for a set; which ones are required depends on the exercise's logging mode. */
export interface SetEntry {
  readonly weight?: number | null;
  readonly reps?: number | null;
  readonly durationSeconds?: number | null;
}

export interface SetPosition {
  /** 0-based index into `exercises`. */
  readonly exercise: number;
  /** 0-based index into the exercise's `sets`. */
  readonly set: number;
}

export type WorkoutLogErrorCode =
  | 'session-not-found'
  | 'not-a-resistance-session'
  | 'invalid-position'
  | 'invalid-entry'
  | 'invalid-rest'
  | 'workout-not-in-progress'
  | 'invalid-timestamp';

export interface WorkoutLogError {
  readonly code: WorkoutLogErrorCode;
  readonly message: string;
  /** For invalid entries: which field is missing or out of range. */
  readonly field?: 'weight' | 'reps' | 'durationSeconds';
}

export type WorkoutLogResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: WorkoutLogError };

/** Accepted ranges for entered values (sanity limits, not training advice). */
export const WORKOUT_LOG_LIMITS = {
  weight: { min: 0, max: 1000 },
  reps: { min: 1, max: 500 },
  durationSeconds: { min: 1, max: 7200 },
} as const;

/** Rest the user may choose between sets, in whole seconds (sanity limits, not training advice). */
export const REST_SECONDS_LIMITS = { min: 15, max: 600, step: 15 } as const;
