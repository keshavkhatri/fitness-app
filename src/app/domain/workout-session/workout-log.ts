import {
  EXERCISE_LIBRARY,
  Exercise,
  PlannedExercise,
  WorkoutEquipment,
  WorkoutPlan,
  WorkoutSession,
} from '../workout-programming';
import {
  ExerciseLog,
  LoggingMode,
  SetEntry,
  SetLog,
  SetPosition,
  WORKOUT_LOG_LIMITS,
  WeightUnit,
  WorkoutLog,
  WorkoutLogError,
  WorkoutLogResult,
} from './workout-log.model';

/**
 * Workout execution rules. Pure and immutable: every transition returns a new
 * log (or a typed error) and never touches the plan. Timestamps are passed
 * in; there is no clock here.
 */

const ok = <T>(value: T): WorkoutLogResult<T> => ({ ok: true, value });
const fail = <T = never>(code: WorkoutLogError['code'], message: string, field?: WorkoutLogError['field']): WorkoutLogResult<T> => ({
  ok: false,
  error: field ? { code, message, field } : { code, message },
});

const isInstant = (value: string) => Number.isFinite(Date.parse(value));

// --- Starting -------------------------------------------------------------------------

/** Equipment that adds a weighable load. Bodyweight, band, bar and ab-wheel work is logged as reps only. */
const LOADED_EQUIPMENT: readonly WorkoutEquipment[] = ['dumbbells', 'barbell', 'cable', 'machine'];

export function loggingModeFor(planned: PlannedExercise, exercise: Exercise | undefined): LoggingMode {
  if (planned.target.kind === 'time') {
    return 'duration';
  }
  return exercise?.requires.some((item) => LOADED_EQUIPMENT.includes(item)) ? 'weight-reps' : 'reps';
}

export interface StartWorkoutOptions {
  /** Unique id for this execution (chosen by the caller; no randomness here). */
  readonly id: string;
  /** ISO-8601 instant. */
  readonly startedAt: string;
  readonly weightUnit: WeightUnit;
  readonly catalog?: readonly Exercise[];
}

const pendingSet = (setNumber: number): SetLog => ({
  setNumber,
  status: 'pending',
  weight: null,
  reps: null,
  durationSeconds: null,
  completedAt: null,
});

/**
 * A new in-progress log for a resistance session of the plan, snapshotting the
 * session, its exercises and their prescriptions. The plan is only read.
 */
export function startWorkoutLog(plan: WorkoutPlan, sessionId: string, options: StartWorkoutOptions): WorkoutLogResult<WorkoutLog> {
  const session = plan.sessions.find((s) => s.id === sessionId);
  if (!session) {
    return fail('session-not-found', `No session "${sessionId}" in plan ${plan.id}.`);
  }
  if (session.kind !== 'resistance') {
    return fail('not-a-resistance-session', `Session "${sessionId}" is an activity day.`);
  }
  if (!isInstant(options.startedAt)) {
    return fail('invalid-timestamp', 'startedAt must be an ISO-8601 instant.');
  }
  const catalog = new Map((options.catalog ?? EXERCISE_LIBRARY).map((e) => [e.id, e]));
  return ok({
    id: options.id,
    source: { planId: plan.id, workoutProgrammingVersion: plan.workoutProgrammingVersion, sessionId },
    sessionType: session.sessionType,
    variant: session.variant,
    weightUnit: options.weightUnit,
    startedAt: options.startedAt,
    completedAt: null,
    status: 'in-progress',
    currentExerciseIndex: 0,
    exercises: snapshotExercises(session, catalog),
  });
}

function snapshotExercises(session: WorkoutSession, catalog: ReadonlyMap<string, Exercise>): ExerciseLog[] {
  return session.exercises.map((planned) => {
    const exercise = catalog.get(planned.exerciseId);
    return {
      exerciseId: planned.exerciseId,
      name: exercise?.name ?? planned.exerciseId,
      order: planned.order,
      planned: {
        sets: planned.sets,
        target: planned.target,
        restSeconds: planned.restSeconds,
        perSide: planned.notes.includes('per-side'),
      },
      logging: loggingModeFor(planned, exercise),
      sets: Array.from({ length: planned.sets }, (_, i) => pendingSet(i + 1)),
    };
  });
}

/**
 * One workout at a time. Given the current in-progress log (if any) and the
 * session the user wants to start: start a new one, resume the same one, or
 * report a conflict with a different in-progress workout.
 */
export type StartDecision = 'start' | 'resume' | 'conflict';

export function startDecision(active: WorkoutLog | null, sessionId: string): StartDecision {
  if (!active || active.status !== 'in-progress') {
    return 'start';
  }
  return active.source.sessionId === sessionId ? 'resume' : 'conflict';
}

// --- Set transitions --------------------------------------------------------------------

function editable(log: WorkoutLog, position?: SetPosition): WorkoutLogResult<SetPosition | null> {
  if (log.status !== 'in-progress') {
    return fail('workout-not-in-progress', 'The workout is already finished.');
  }
  if (!position) {
    return ok(null);
  }
  const exercise = log.exercises[position.exercise];
  if (!exercise || !Number.isInteger(position.set) || !exercise.sets[position.set]) {
    return fail('invalid-position', `No set ${position.set} in exercise ${position.exercise}.`);
  }
  return ok(position);
}

function withSet(log: WorkoutLog, { exercise, set }: SetPosition, update: (current: SetLog) => SetLog): WorkoutLog {
  return {
    ...log,
    exercises: log.exercises.map((e, ei) =>
      ei === exercise ? { ...e, sets: e.sets.map((s, si) => (si === set ? update(s) : s)) } : e,
    ),
  };
}

const inRange = (value: number, range: { min: number; max: number }) =>
  Number.isFinite(value) && value >= range.min && value <= range.max;

/** Checks an entry against the exercise's logging mode; returns the values to record. */
export function validateEntry(mode: LoggingMode, entry: SetEntry): WorkoutLogResult<Pick<SetLog, 'weight' | 'reps' | 'durationSeconds'>> {
  const L = WORKOUT_LOG_LIMITS;
  if (mode === 'duration') {
    const seconds = entry.durationSeconds;
    if (seconds == null || !Number.isInteger(seconds) || !inRange(seconds, L.durationSeconds)) {
      return fail('invalid-entry', 'Enter a duration in whole seconds.', 'durationSeconds');
    }
    return ok({ weight: null, reps: null, durationSeconds: seconds });
  }
  const reps = entry.reps;
  if (mode === 'weight-reps') {
    const weight = entry.weight;
    // Two decimals at most (e.g. 22.5 or 1.25 plates).
    if (weight == null || !inRange(weight, L.weight) || Math.abs(Math.round(weight * 100) - weight * 100) > 1e-6) {
      return fail('invalid-entry', 'Enter the weight used.', 'weight');
    }
    if (reps == null || !Number.isInteger(reps) || !inRange(reps, L.reps)) {
      return fail('invalid-entry', 'Enter the reps completed.', 'reps');
    }
    return ok({ weight, reps, durationSeconds: null });
  }
  if (reps == null || !Number.isInteger(reps) || !inRange(reps, L.reps)) {
    return fail('invalid-entry', 'Enter the reps completed.', 'reps');
  }
  return ok({ weight: null, reps, durationSeconds: null });
}

/** Records a completed set (or corrects an already completed one). */
export function completeSet(log: WorkoutLog, position: SetPosition, entry: SetEntry, at: string): WorkoutLogResult<WorkoutLog> {
  const check = editable(log, position);
  if (!check.ok) {
    return check;
  }
  if (!isInstant(at)) {
    return fail('invalid-timestamp', 'Completion time must be an ISO-8601 instant.');
  }
  const values = validateEntry(log.exercises[position.exercise].logging, entry);
  if (!values.ok) {
    return values;
  }
  return ok(withSet(log, position, (set) => ({ ...set, ...values.value, status: 'completed', completedAt: at })));
}

/** Marks a set skipped. Skipped sets keep no values and are never counted as completed. */
export function skipSet(log: WorkoutLog, position: SetPosition): WorkoutLogResult<WorkoutLog> {
  const check = editable(log, position);
  if (!check.ok) {
    return check;
  }
  return ok(withSet(log, position, (set) => ({ ...pendingSet(set.setNumber), status: 'skipped' })));
}

/** Undoes a completed or skipped set (back to pending, values cleared). */
export function resetSet(log: WorkoutLog, position: SetPosition): WorkoutLogResult<WorkoutLog> {
  const check = editable(log, position);
  if (!check.ok) {
    return check;
  }
  return ok(withSet(log, position, (set) => pendingSet(set.setNumber)));
}

/** Skips every remaining (pending) set of an exercise; completed sets are kept. */
export function skipExercise(log: WorkoutLog, exerciseIndex: number): WorkoutLogResult<WorkoutLog> {
  const check = editable(log);
  if (!check.ok) {
    return check;
  }
  if (!log.exercises[exerciseIndex]) {
    return fail('invalid-position', `No exercise ${exerciseIndex}.`);
  }
  return ok({
    ...log,
    exercises: log.exercises.map((e, ei) =>
      ei === exerciseIndex
        ? { ...e, sets: e.sets.map((s) => (s.status === 'pending' ? { ...pendingSet(s.setNumber), status: 'skipped' as const } : s)) }
        : e,
    ),
  });
}

export function goToExercise(log: WorkoutLog, exerciseIndex: number): WorkoutLogResult<WorkoutLog> {
  const check = editable(log);
  if (!check.ok) {
    return check;
  }
  if (!Number.isInteger(exerciseIndex) || !log.exercises[exerciseIndex]) {
    return fail('invalid-position', `No exercise ${exerciseIndex}.`);
  }
  return ok({ ...log, currentExerciseIndex: exerciseIndex });
}

/**
 * Finishes the workout. Allowed with pending or skipped sets (they stay as
 * they are, so a partial workout remains distinguishable from a full one).
 */
export function finishWorkout(log: WorkoutLog, at: string): WorkoutLogResult<WorkoutLog> {
  const check = editable(log);
  if (!check.ok) {
    return check;
  }
  if (!isInstant(at) || Date.parse(at) < Date.parse(log.startedAt)) {
    return fail('invalid-timestamp', 'Finish time must be an ISO-8601 instant after the start.');
  }
  return ok({ ...log, status: 'completed', completedAt: at });
}

// --- Queries ----------------------------------------------------------------------------

export const pendingSetCount = (exercise: ExerciseLog) => exercise.sets.filter((s) => s.status === 'pending').length;

export const totalPendingSets = (log: WorkoutLog) => log.exercises.reduce((n, e) => n + pendingSetCount(e), 0);

/** First pending set of an exercise (0-based), or -1. */
export const nextPendingSet = (exercise: ExerciseLog) => exercise.sets.findIndex((s) => s.status === 'pending');

export interface WorkoutLogSummary {
  /** Whole seconds from start to completion (or to `asOf` while in progress). */
  readonly durationSeconds: number;
  readonly totalExercises: number;
  /** Exercises with no pending sets and at least one completed set. */
  readonly exercisesCompleted: number;
  readonly totalSets: number;
  readonly setsCompleted: number;
  readonly setsSkipped: number;
  /** Sets left pending (neither done nor skipped). */
  readonly setsIncomplete: number;
  /** Every set was completed. */
  readonly fullyCompleted: boolean;
}

export function summarizeWorkoutLog(log: WorkoutLog, asOf?: string): WorkoutLogSummary {
  const end = log.completedAt ?? asOf ?? log.startedAt;
  const sets = log.exercises.flatMap((e) => e.sets);
  const count = (status: SetLog['status']) => sets.filter((s) => s.status === status).length;
  const setsCompleted = count('completed');
  return {
    durationSeconds: Math.max(0, Math.round((Date.parse(end) - Date.parse(log.startedAt)) / 1000)),
    totalExercises: log.exercises.length,
    exercisesCompleted: log.exercises.filter((e) => pendingSetCount(e) === 0 && e.sets.some((s) => s.status === 'completed')).length,
    totalSets: sets.length,
    setsCompleted,
    setsSkipped: count('skipped'),
    setsIncomplete: count('pending'),
    fullyCompleted: setsCompleted === sets.length,
  };
}
