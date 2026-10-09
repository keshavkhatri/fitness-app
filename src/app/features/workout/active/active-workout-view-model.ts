import { Exercise } from '../../../domain/workout-programming';
import { ExerciseLog, LoggingMode, SetLog, SetStatus, WorkoutLog, nextPendingSet, pendingSetCount } from '../../../domain/workout-session';
import { WORKOUT_COPY } from '../workout-content';
import { exerciseMetadata, formatPrescription, targetValue, titleFor } from '../workout-formatting';
import { CATALOG } from '../workout-view-model';

/**
 * Presentation model for Active Workout, built from the in-progress log
 * (never from the plan). Pure: the page keeps typed-but-unsaved input itself.
 */
export interface ActiveWorkoutView {
  readonly workoutId: string;
  readonly sessionId: string;
  readonly title: string;
  /** "Exercise 2 of 7" (progress is always given as text, not only as a bar). */
  readonly position: string;
  readonly progress: { readonly value: number; readonly max: number; readonly text: string };
  readonly exerciseIndex: number;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly exercise: ActiveExerciseView;
  /** Pending sets in the whole workout (for the finish confirmation). */
  readonly pendingTotal: number;
}

export interface ActiveExerciseView {
  /** "2. Cable Row" */
  readonly heading: string;
  readonly metadata: string | null;
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
  /** Column heading, e.g. "kg", "Reps", "Seconds". */
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
  /** Accessible name of the row's main button. */
  readonly actionLabel: string;
  /** Suggested input for a pending set: the latest completed values in this exercise, else the plan. */
  readonly suggestion: Readonly<Record<FieldKey, string>>;
}

export function toActiveWorkoutView(log: WorkoutLog, catalog: ReadonlyMap<string, Exercise> = CATALOG): ActiveWorkoutView {
  const copy = WORKOUT_COPY.active;
  const index = log.currentExerciseIndex;
  const exercise = log.exercises[index];
  const sets = log.exercises.flatMap((e) => e.sets);
  const handled = sets.filter((s) => s.status !== 'pending').length;
  const done = sets.filter((s) => s.status === 'completed').length;
  return {
    workoutId: log.id,
    sessionId: log.source.sessionId,
    title: titleFor(log.sessionType, log.variant),
    position: copy.exerciseOf(index + 1, log.exercises.length),
    progress: { value: handled, max: sets.length, text: copy.progressText(index + 1, log.exercises.length, done, sets.length) },
    exerciseIndex: index,
    isFirst: index === 0,
    isLast: index === log.exercises.length - 1,
    exercise: toExercise(exercise, log, catalog),
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
          label: log.weightUnit,
          spoken: log.weightUnit === 'kg' ? 'weight in kilograms' : 'weight in pounds',
          inputMode: 'decimal',
          placeholder: log.weightUnit,
        },
        reps,
      ];
  }
}

function toExercise(exercise: ExerciseLog, log: WorkoutLog, catalog: ReadonlyMap<string, Exercise>): ActiveExerciseView {
  const next = nextPendingSet(exercise);
  return {
    heading: `${exercise.order}. ${exercise.name}`,
    metadata: exerciseMetadata(catalog.get(exercise.exerciseId)),
    planned: formatPrescription(exercise.planned),
    restSeconds: exercise.planned.restSeconds,
    mode: exercise.logging,
    fields: fieldsFor(exercise, log),
    sets: exercise.sets.map((set, i) => toSetRow(set, i, exercise, log)),
    pending: pendingSetCount(exercise),
    nextPendingSet: next >= 0 ? next : null,
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

function toSetRow(set: SetLog, index: number, exercise: ExerciseLog, log: WorkoutLog): SetRowView {
  const copy = WORKOUT_COPY.active;
  const values = formatSetValues(set, exercise.logging, log.weightUnit);
  const previous = [...exercise.sets.slice(0, index)].reverse().find((s) => s.status === 'completed')
    ?? exercise.sets.find((s) => s.status === 'completed');
  const plannedSeconds = exercise.planned.target.kind === 'time' ? `${exercise.planned.target.seconds}` : '';
  return {
    index,
    setNumber: set.setNumber,
    label: copy.set(set.setNumber),
    status: set.status,
    valuesText: values,
    actionLabel:
      set.status === 'completed'
        ? copy.undoSet(set.setNumber, values ?? '')
        : set.status === 'skipped'
          ? copy.undoSkip(set.setNumber)
          : copy.completeSet(set.setNumber),
    suggestion: {
      weight: previous?.weight != null ? `${previous.weight}` : '',
      reps: previous?.reps != null ? `${previous.reps}` : '',
      durationSeconds: previous?.durationSeconds != null ? `${previous.durationSeconds}` : plannedSeconds,
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
