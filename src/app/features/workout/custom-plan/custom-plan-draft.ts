import {
  CUSTOM_PLAN_LIMITS,
  CustomDaySpec,
  CustomExerciseSpec,
  CustomPlanSpec,
  defaultCustomExercise,
} from '../../../domain/training-plan';
import { Exercise, WorkoutPlan, WorkoutProgrammingConfig } from '../../../domain/workout-programming';

/**
 * The custom plan while it is being edited. Prescription fields stay text, exactly as typed, so a
 * half-typed or empty field is not lost; `toSpec` turns the draft into numbers or says which field is wrong.
 * Pure functions over immutable data: the draft service holds the current value.
 */

export type PrescriptionField = 'sets' | 'repsMin' | 'repsMax' | 'seconds' | 'rest';

export interface DraftExercise {
  readonly exerciseId: string;
  readonly sets: string;
  readonly repsMin: string;
  readonly repsMax: string;
  readonly seconds: string;
  readonly rest: string;
}

export interface DraftDay {
  /** The plan session's id. */
  readonly sessionId: string;
  readonly exercises: readonly DraftExercise[];
}

export type PlanDraft = readonly DraftDay[];

export const FIELD_ERRORS = {
  sets: `Enter ${CUSTOM_PLAN_LIMITS.sets.min}–${CUSTOM_PLAN_LIMITS.sets.max} sets`,
  reps: `Enter ${CUSTOM_PLAN_LIMITS.reps.min}–${CUSTOM_PLAN_LIMITS.reps.max} reps`,
  repsOrder: 'Maximum reps must be at least the minimum',
  seconds: `Enter ${CUSTOM_PLAN_LIMITS.seconds.min}–${CUSTOM_PLAN_LIMITS.seconds.max} seconds`,
  rest: `Enter ${CUSTOM_PLAN_LIMITS.restSeconds.min}–${CUSTOM_PLAN_LIMITS.restSeconds.max} seconds (0 for none)`,
} as const;

export type ExerciseFieldErrors = Partial<Record<PrescriptionField, string>>;

/** Key of an exercise within the draft (unique: an exercise appears once per day). */
export const exerciseKey = (sessionId: string, exerciseId: string) => `${sessionId}:${exerciseId}`;

const text = (value: number) => `${value}`;

function fromSpec(spec: CustomExerciseSpec): DraftExercise {
  return {
    exerciseId: spec.exerciseId,
    sets: text(spec.sets),
    repsMin: spec.target.kind === 'reps' ? text(spec.target.min) : '',
    repsMax: spec.target.kind === 'reps' ? text(spec.target.max) : '',
    seconds: spec.target.kind === 'time' ? text(spec.target.seconds) : '',
    rest: text(spec.restSeconds),
  };
}

export function draftFromSpec(spec: CustomPlanSpec): PlanDraft {
  return spec.days.map((day) => ({ sessionId: day.sessionId, exercises: day.exercises.map(fromSpec) }));
}

/** The prescription an exercise starts with when it is added to a day (exactly what `addExercise` adds). */
export function startingExercise(
  exercise: Exercise,
  plan: Pick<WorkoutPlan, 'programStyle' | 'experience'>,
  config: WorkoutProgrammingConfig,
): DraftExercise {
  return fromSpec(defaultCustomExercise(exercise, plan, config));
}

export function addExercise(
  draft: PlanDraft,
  sessionId: string,
  exercise: Exercise,
  plan: Pick<WorkoutPlan, 'programStyle' | 'experience'>,
  config: WorkoutProgrammingConfig,
): PlanDraft {
  return mapDay(draft, sessionId, (day) =>
    day.exercises.some((e) => e.exerciseId === exercise.id)
      ? day
      : { ...day, exercises: [...day.exercises, fromSpec(defaultCustomExercise(exercise, plan, config))] },
  );
}

export function removeExercise(draft: PlanDraft, sessionId: string, exerciseId: string): PlanDraft {
  return mapDay(draft, sessionId, (day) => ({ ...day, exercises: day.exercises.filter((e) => e.exerciseId !== exerciseId) }));
}

/** Moves one position up (-1) or down (+1); at either end nothing changes. */
export function moveExercise(draft: PlanDraft, sessionId: string, exerciseId: string, direction: -1 | 1): PlanDraft {
  return mapDay(draft, sessionId, (day) => {
    const from = day.exercises.findIndex((e) => e.exerciseId === exerciseId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= day.exercises.length) {
      return day;
    }
    const exercises = [...day.exercises];
    [exercises[from], exercises[to]] = [exercises[to], exercises[from]];
    return { ...day, exercises };
  });
}

export function setField(draft: PlanDraft, sessionId: string, exerciseId: string, field: PrescriptionField, value: string): PlanDraft {
  return mapDay(draft, sessionId, (day) => ({
    ...day,
    exercises: day.exercises.map((e) => (e.exerciseId === exerciseId ? { ...e, [field]: value } : e)),
  }));
}

function mapDay(draft: PlanDraft, sessionId: string, change: (day: DraftDay) => DraftDay): PlanDraft {
  return draft.map((day) => (day.sessionId === sessionId ? change(day) : day));
}

export function sameDraft(a: PlanDraft, b: PlanDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const WHOLE_NUMBER = /^\d{1,4}$/;
const within = (value: string, range: { readonly min: number; readonly max: number }): number | null => {
  const trimmed = value.trim();
  const n = WHOLE_NUMBER.test(trimmed) ? Number(trimmed) : NaN;
  return n >= range.min && n <= range.max ? n : null;
};

/** What is wrong with one exercise's typed prescription (empty = fine). `timed` picks seconds over reps. */
export function exerciseErrors(exercise: DraftExercise, timed: boolean): ExerciseFieldErrors {
  const errors: { -readonly [K in PrescriptionField]?: string } = {};
  if (within(exercise.sets, CUSTOM_PLAN_LIMITS.sets) === null) {
    errors.sets = FIELD_ERRORS.sets;
  }
  if (within(exercise.rest, CUSTOM_PLAN_LIMITS.restSeconds) === null) {
    errors.rest = FIELD_ERRORS.rest;
  }
  if (timed) {
    if (within(exercise.seconds, CUSTOM_PLAN_LIMITS.seconds) === null) {
      errors.seconds = FIELD_ERRORS.seconds;
    }
  } else {
    const min = within(exercise.repsMin, CUSTOM_PLAN_LIMITS.reps);
    const max = within(exercise.repsMax, CUSTOM_PLAN_LIMITS.reps);
    if (min === null) {
      errors.repsMin = FIELD_ERRORS.reps;
    }
    if (max === null) {
      errors.repsMax = FIELD_ERRORS.reps;
    } else if (min !== null && max < min) {
      errors.repsMax = FIELD_ERRORS.repsOrder;
    }
  }
  return errors;
}

/**
 * The draft as numbers for the domain, or null when any typed field is invalid (see `exerciseErrors`).
 * Unknown exercises are left for the domain's own validation.
 */
export function toSpec(draft: PlanDraft, catalog: ReadonlyMap<string, Exercise>): CustomPlanSpec | null {
  const days: CustomDaySpec[] = [];
  for (const day of draft) {
    const exercises: CustomExerciseSpec[] = [];
    for (const e of day.exercises) {
      const timed = catalog.get(e.exerciseId)?.measurement === 'time';
      if (Object.keys(exerciseErrors(e, timed)).length > 0) {
        return null;
      }
      exercises.push({
        exerciseId: e.exerciseId,
        sets: Number(e.sets),
        restSeconds: Number(e.rest),
        target: timed ? { kind: 'time', seconds: Number(e.seconds) } : { kind: 'reps', min: Number(e.repsMin), max: Number(e.repsMax) },
      });
    }
    days.push({ sessionId: day.sessionId, exercises });
  }
  return { days };
}
