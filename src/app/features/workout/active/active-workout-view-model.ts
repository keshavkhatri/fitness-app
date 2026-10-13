import { Exercise, MuscleGroup } from '../../../domain/workout-programming';
import {
  ExerciseLog,
  ExercisePerformanceSession,
  LoggingMode,
  SetLog,
  SetStatus,
  WorkoutLog,
  exercisePerformance,
  nextPendingSet,
  pendingSetCount,
} from '../../../domain/workout-session';
import { WORKOUT_COPY } from '../workout-content';
import { exerciseEquipment, exerciseMuscles, formatPrescription, targetValue, titleFor } from '../workout-formatting';
import { CATALOG } from '../workout-view-model';

/**
 * Presentation model for Active Workout, built from the in-progress log
 * (never from the plan). Pure: the page keeps typed-but-unsaved input itself.
 */
export interface ActiveWorkoutView {
  readonly workoutId: string;
  readonly sessionId: string;
  /** ISO instant the workout started (the page shows the elapsed time from it). */
  readonly startedAt: string;
  readonly title: string;
  /** "Exercise 2 of 7" (progress is always given as text, not only as a bar). */
  readonly position: string;
  readonly progress: { readonly value: number; readonly max: number; readonly text: string };
  readonly exerciseIndex: number;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly exercise: ActiveExerciseView;
  /** The exercise after this one; null on the last. */
  readonly next: NextExerciseView | null;
  /** Pending sets in the whole workout (for the finish confirmation). */
  readonly pendingTotal: number;
}

export interface NextExerciseView {
  readonly exerciseId: string;
  readonly name: string;
  readonly muscles: readonly string[];
  /** "3 sets · 8–12 reps" */
  readonly planned: string;
  /** Sets already handled there (it can have been started before). */
  readonly handled: number;
}

export interface ActiveExerciseView {
  readonly exerciseId: string;
  readonly name: string;
  /** Primary muscles ("Chest"), shown as chips. */
  readonly muscles: readonly string[];
  /** The same muscles as ids, for the anatomy figure. */
  readonly muscleIds: readonly MuscleGroup[];
  /** "Barbell, bench, rack" or "Bodyweight"; null when unknown. */
  readonly equipment: string | null;
  /** "3 sets · 8–12 reps · 90 sec rest" */
  readonly planned: string;
  readonly restSeconds: number;
  readonly mode: LoggingMode;
  readonly fields: readonly FieldView[];
  readonly sets: readonly SetRowView[];
  readonly pending: number;
  /** First pending set (0-based), or null when none is left. */
  readonly nextPendingSet: number | null;
}

export type FieldKey = 'weight' | 'reps' | 'durationSeconds';

export interface FieldView {
  readonly key: FieldKey;
  /** Column heading, e.g. "Weight (kg)", "Reps", "Seconds". */
  readonly label: string;
  /** Spoken unit for input labels, e.g. "weight in kilograms". */
  readonly spoken: string;
  readonly inputMode: 'decimal' | 'numeric';
  readonly placeholder: string;
}

export interface SetRowView {
  readonly index: number;
  readonly setNumber: number;
  readonly label: string;
  readonly status: SetStatus;
  /** Recorded values for a completed set, e.g. "60 kg × 8". */
  readonly valuesText: string | null;
  /** The same values per field ("60", "8"); empty for a set that isn't completed. */
  readonly values: Readonly<Record<FieldKey, string>>;
  /** Accessible name of the row's main button. */
  readonly actionLabel: string;
  /**
   * Prefilled input for a pending set, to accept or change: the latest completed
   * set in this exercise, else the same set last time it was done, else the plan
   * (reps at the bottom of the range). Weight is never invented: empty without history.
   */
  readonly suggestion: Readonly<Record<FieldKey, string>>;
}

/**
 * `history`: finished workouts, used only to prefill the current exercise's sets
 * with what was lifted last time.
 */
export function toActiveWorkoutView(
  log: WorkoutLog,
  catalog: ReadonlyMap<string, Exercise> = CATALOG,
  history: readonly WorkoutLog[] = [],
): ActiveWorkoutView {
  const copy = WORKOUT_COPY.active;
  const index = log.currentExerciseIndex;
  const exercise = log.exercises[index];
  const sets = log.exercises.flatMap((e) => e.sets);
  const handled = sets.filter((s) => s.status !== 'pending').length;
  const done = sets.filter((s) => s.status === 'completed').length;
  return {
    workoutId: log.id,
    sessionId: log.source.sessionId,
    startedAt: log.startedAt,
    title: titleFor(log.sessionType, log.variant),
    position: copy.exerciseOf(index + 1, log.exercises.length),
    progress: { value: handled, max: sets.length, text: copy.progressText(index + 1, log.exercises.length, done, sets.length) },
    exerciseIndex: index,
    isFirst: index === 0,
    isLast: index === log.exercises.length - 1,
    exercise: toExercise(exercise, log, catalog, lastTime(history, exercise, log)),
    next: log.exercises[index + 1] ? toNext(log.exercises[index + 1], catalog) : null,
    pendingTotal: sets.filter((s) => s.status === 'pending').length,
  };
}

function fieldsFor(exercise: ExerciseLog, log: WorkoutLog): FieldView[] {
  const columns = WORKOUT_COPY.active.columns;
  const side = exercise.planned.perSide;
  const target = exercise.planned.target;
  const reps: FieldView = {
    key: 'reps',
    label: side ? columns.repsPerSide : columns.reps,
    spoken: side ? 'reps per side' : 'reps',
    inputMode: 'numeric',
    placeholder: target.kind === 'reps' ? targetValue(exercise.planned) : '',
  };
  switch (exercise.logging) {
    case 'duration':
      return [
        {
          key: 'durationSeconds',
          label: side ? columns.timePerSide : columns.time,
          spoken: side ? 'seconds per side' : 'seconds',
          inputMode: 'numeric',
          placeholder: target.kind === 'time' ? `${target.seconds}` : '',
        },
      ];
    case 'reps':
      return [reps];
    default:
      return [
        {
          key: 'weight',
          label: `${columns.weight} (${log.weightUnit})`,
          spoken: log.weightUnit === 'kg' ? 'weight in kilograms' : 'weight in pounds',
          inputMode: 'decimal',
          placeholder: log.weightUnit,
        },
        reps,
      ];
  }
}

/** The most recent finished session of this exercise, logged the same way and in the same unit. */
function lastTime(history: readonly WorkoutLog[], exercise: ExerciseLog, log: WorkoutLog): ExercisePerformanceSession | null {
  const sessions = exercisePerformance(history, exercise.exerciseId)?.sessions ?? [];
  return sessions.find((s) => s.logging === exercise.logging && s.weightUnit === log.weightUnit) ?? null;
}

function toExercise(
  exercise: ExerciseLog,
  log: WorkoutLog,
  catalog: ReadonlyMap<string, Exercise>,
  last: ExercisePerformanceSession | null,
): ActiveExerciseView {
  const next = nextPendingSet(exercise);
  return {
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    muscles: exerciseMuscles(catalog.get(exercise.exerciseId)),
    muscleIds: catalog.get(exercise.exerciseId)?.primaryMuscles ?? [],
    equipment: exerciseEquipment(catalog.get(exercise.exerciseId)),
    planned: formatPrescription(exercise.planned),
    restSeconds: exercise.planned.restSeconds,
    mode: exercise.logging,
    fields: fieldsFor(exercise, log),
    sets: exercise.sets.map((set, i) => toSetRow(set, i, exercise, log, last)),
    pending: pendingSetCount(exercise),
    nextPendingSet: next >= 0 ? next : null,
  };
}

function toNext(exercise: ExerciseLog, catalog: ReadonlyMap<string, Exercise>): NextExerciseView {
  return {
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    muscles: exerciseMuscles(catalog.get(exercise.exerciseId)),
    planned: formatPrescription({ ...exercise.planned, restSeconds: 0 }),
    handled: exercise.sets.filter((s) => s.status !== 'pending').length,
  };
}

/** "60 kg × 8", "12 reps", "45 sec" */
export function formatSetValues(set: SetLog, mode: LoggingMode, unit: WorkoutLog['weightUnit']): string | null {
  if (set.status !== 'completed') {
    return null;
  }
  switch (mode) {
    case 'duration':
      return `${set.durationSeconds} sec`;
    case 'reps':
      return `${set.reps} reps`;
    default:
      return `${set.weight} ${unit} × ${set.reps}`;
  }
}

function toSetRow(set: SetLog, index: number, exercise: ExerciseLog, log: WorkoutLog, last: ExercisePerformanceSession | null): SetRowView {
  const copy = WORKOUT_COPY.active;
  const values = formatSetValues(set, exercise.logging, log.weightUnit);
  const previous = [...exercise.sets.slice(0, index)].reverse().find((s) => s.status === 'completed')
    ?? exercise.sets.find((s) => s.status === 'completed');
  // Last time: the same set, else its last set (when this workout has more sets).
  const before = last ? (last.sets.find((s) => s.setNumber === set.setNumber) ?? last.sets[last.sets.length - 1]) : undefined;
  const target = exercise.planned.target;
  const plannedSeconds = target.kind === 'time' ? `${target.seconds}` : '';
  const plannedReps = target.kind === 'reps' ? `${target.min}` : '';
  const text = (n: number | null | undefined) => (n != null ? `${n}` : null);
  return {
    index,
    setNumber: set.setNumber,
    label: copy.set(set.setNumber),
    status: set.status,
    valuesText: values,
    values: {
      weight: set.status === 'completed' && set.weight !== null ? `${set.weight}` : '',
      reps: set.status === 'completed' && set.reps !== null ? `${set.reps}` : '',
      durationSeconds: set.status === 'completed' && set.durationSeconds !== null ? `${set.durationSeconds}` : '',
    },
    actionLabel:
      set.status === 'completed'
        ? copy.undoSet(set.setNumber, values ?? '')
        : set.status === 'skipped'
          ? copy.undoSkip(set.setNumber)
          : copy.completeSet(set.setNumber),
    suggestion: {
      weight: text(previous?.weight) ?? text(before?.weight) ?? '',
      reps: text(previous?.reps) ?? text(before?.reps) ?? plannedReps,
      durationSeconds: text(previous?.durationSeconds) ?? text(before?.durationSeconds) ?? plannedSeconds,
    },
  };
}

/** The Workout tab's "in progress" card. */
export interface ResumeCardView {
  readonly sessionId: string;
  readonly title: string;
  /** "5 of 24 sets done" */
  readonly progress: string;
}

export function toResumeCard(log: WorkoutLog): ResumeCardView {
  const sets = log.exercises.flatMap((e) => e.sets);
  return {
    sessionId: log.source.sessionId,
    title: titleFor(log.sessionType, log.variant),
    progress: WORKOUT_COPY.resume.progress(sets.filter((s) => s.status === 'completed').length, sets.length),
  };
}
