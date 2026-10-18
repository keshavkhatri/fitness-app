import { IsoCalendarDate } from '../fitness-profile';
import {
  DEFAULT_WORKOUT_CONFIG,
  EXERCISE_LIBRARY,
  Exercise,
  ExerciseTarget,
  ObjectiveRole,
  PlannedExercise,
  ProgressionRule,
  WorkoutPlan,
  WorkoutProgrammingConfig,
  WorkoutSession,
  prescriptionProfileFor,
  sequenceCategoryFor,
  volumeGroupsOf,
} from '../workout-programming';
import { VOLUME_GROUPS, VolumeGroup } from '../workout-programming/workout-taxonomy';
import { estimateSessionMinutes } from '../workout-programming/duration';
import { canonicalJson, fnv1a32 } from '../workout-programming/plan-identity';
import { volumeStatus } from '../workout-programming/weekly-volume';

/**
 * Custom workout plan (Premium): the user keeps the plan's training days and replaces each resistance
 * day's exercises with their own picks from the catalog. Activity days, the day count and the session
 * ids/names are the generated plan's; only the exercises and their prescriptions change.
 *
 * The result is an ordinary `WorkoutPlan` (marked `custom`), so workout detail, active workouts,
 * logging and history need no changes. No loads are prescribed: weights come from logging.
 */

export const CUSTOM_PLAN_LIMITS = {
  exercisesPerDay: { min: 1, max: 12 },
  sets: { min: 1, max: 10 },
  reps: { min: 1, max: 100 },
  seconds: { min: 5, max: 600 },
  restSeconds: { min: 0, max: 600 },
} as const;

/** What the user chose for one exercise. The target kind must match the exercise (reps or time). */
export interface CustomExerciseSpec {
  readonly exerciseId: string;
  readonly sets: number;
  readonly target: ExerciseTarget;
  readonly restSeconds: number;
}

export interface CustomDaySpec {
  /** The base plan's session id, e.g. "day-2-lower". */
  readonly sessionId: string;
  /** In training order. */
  readonly exercises: readonly CustomExerciseSpec[];
}

export interface CustomPlanSpec {
  /** One entry per resistance session of the base plan. */
  readonly days: readonly CustomDaySpec[];
}

export type CustomPlanIssueCode =
  | 'unknown-session'
  | 'missing-session'
  | 'empty-day'
  | 'too-many-exercises'
  | 'unknown-exercise'
  | 'duplicate-exercise'
  | 'target-mismatch'
  | 'invalid-sets'
  | 'invalid-reps'
  | 'invalid-seconds'
  | 'invalid-rest';

export interface CustomPlanIssue {
  readonly code: CustomPlanIssueCode;
  readonly sessionId: string;
  /** 0-based position in the day; null for day-level issues. */
  readonly index: number | null;
}

export type CustomPlanResult =
  | { readonly ok: true; readonly value: WorkoutPlan }
  | { readonly ok: false; readonly issues: readonly CustomPlanIssue[] };

const CATALOG: ReadonlyMap<string, Exercise> = new Map(EXERCISE_LIBRARY.map((e) => [e.id, e]));

const inRange = (value: number, range: { readonly min: number; readonly max: number }) =>
  Number.isInteger(value) && value >= range.min && value <= range.max;

/** Everything wrong with the spec, in plan order. Empty = it can be saved. */
export function validateCustomPlan(
  base: WorkoutPlan,
  spec: CustomPlanSpec,
  catalog: ReadonlyMap<string, Exercise> = CATALOG,
): CustomPlanIssue[] {
  const issues: CustomPlanIssue[] = [];
  const resistance = new Set(base.sessions.filter((s) => s.kind === 'resistance').map((s) => s.id));
  const seenSessions = new Set<string>();

  for (const day of spec.days) {
    if (!resistance.has(day.sessionId) || seenSessions.has(day.sessionId)) {
      issues.push({ code: 'unknown-session', sessionId: day.sessionId, index: null });
      continue;
    }
    seenSessions.add(day.sessionId);
    const { exercisesPerDay } = CUSTOM_PLAN_LIMITS;
    if (day.exercises.length < exercisesPerDay.min) {
      issues.push({ code: 'empty-day', sessionId: day.sessionId, index: null });
    }
    if (day.exercises.length > exercisesPerDay.max) {
      issues.push({ code: 'too-many-exercises', sessionId: day.sessionId, index: null });
    }
    const inDay = new Set<string>();
    day.exercises.forEach((spec, index) => {
      const at = (code: CustomPlanIssueCode) => issues.push({ code, sessionId: day.sessionId, index });
      const exercise = catalog.get(spec.exerciseId);
      if (!exercise) {
        at('unknown-exercise');
        return;
      }
      if (inDay.has(spec.exerciseId)) {
        at('duplicate-exercise');
      }
      inDay.add(spec.exerciseId);
      if (!inRange(spec.sets, CUSTOM_PLAN_LIMITS.sets)) {
        at('invalid-sets');
      }
      if (!inRange(spec.restSeconds, CUSTOM_PLAN_LIMITS.restSeconds)) {
        at('invalid-rest');
      }
      if (spec.target.kind !== exercise.measurement) {
        at('target-mismatch');
      } else if (spec.target.kind === 'time') {
        if (!inRange(spec.target.seconds, CUSTOM_PLAN_LIMITS.seconds)) {
          at('invalid-seconds');
        }
      } else if (!inRange(spec.target.min, CUSTOM_PLAN_LIMITS.reps) || !inRange(spec.target.max, CUSTOM_PLAN_LIMITS.reps) || spec.target.min > spec.target.max) {
        at('invalid-reps');
      }
    });
  }
  for (const id of resistance) {
    if (!seenSessions.has(id)) {
      issues.push({ code: 'missing-session', sessionId: id, index: null });
    }
  }
  return issues;
}

/**
 * The base plan with every resistance day's exercises replaced by the spec's. Validates first; an invalid
 * spec returns its issues and builds nothing. `base` may itself be a custom plan (editing keeps the
 * generated plan's goal, experience, availability and days).
 */
export function applyCustomPlan(
  base: WorkoutPlan,
  spec: CustomPlanSpec,
  editedAt: IsoCalendarDate,
  options: { readonly catalog?: ReadonlyMap<string, Exercise>; readonly config?: WorkoutProgrammingConfig } = {},
): CustomPlanResult {
  const catalog = options.catalog ?? CATALOG;
  const config = options.config ?? DEFAULT_WORKOUT_CONFIG;
  const issues = validateCustomPlan(base, spec, catalog);
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const byDay = new Map(spec.days.map((d) => [d.sessionId, d.exercises]));
  const timesUsed = new Map<string, number>();
  for (const exercises of byDay.values()) {
    for (const e of exercises) {
      timesUsed.set(e.exerciseId, (timesUsed.get(e.exerciseId) ?? 0) + 1);
    }
  }

  const sessions = base.sessions.map((session) => {
    const chosen = byDay.get(session.id);
    if (session.kind !== 'resistance' || !chosen) {
      return session;
    }
    const exercises = chosen.map((e, i) => plannedFrom(e, i + 1, catalog.get(e.exerciseId) as Exercise, base, (timesUsed.get(e.exerciseId) ?? 0) > 1));
    const custom: WorkoutSession = {
      ...session,
      exercises,
      // Generated-template bookkeeping no longer describes this day.
      objectives: [],
      estimatedDurationMinutes: estimateSessionMinutes(exercises, config),
    };
    return custom;
  });

  const draft: WorkoutPlan = {
    ...base,
    sessions,
    explanation: { ...base.explanation, weeklyVolume: weeklyVolumeOf(base, sessions, catalog) },
    // Warnings described the generated selection (unfilled/substituted objectives, volume).
    warnings: [],
    custom: { editedAt },
  };
  // Deterministic identity of what the user chose, so identical choices give the same id.
  const id = `custom-${fnv1a32(canonicalJson({ days: sessions.map((s) => [s.id, s.exercises.map((e) => [e.exerciseId, e.sets, e.target, e.restSeconds])]) }))}`;
  return { ok: true, value: { ...draft, id } };
}

/** The editable form of a plan: its resistance days' exercises and prescriptions. */
export function customSpecFromPlan(plan: WorkoutPlan): CustomPlanSpec {
  return {
    days: plan.sessions.flatMap((s) =>
      s.kind === 'resistance'
        ? [{ sessionId: s.id, exercises: s.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets, target: e.target, restSeconds: e.restSeconds })) }]
        : [],
    ),
  };
}

/**
 * Starting prescription when an exercise is added: the engine's usual one for this plan's style and
 * experience (reps or time, to match the exercise), which the user can then change.
 */
export function defaultCustomExercise(
  exercise: Exercise,
  plan: Pick<WorkoutPlan, 'programStyle' | 'experience'>,
  config: WorkoutProgrammingConfig = DEFAULT_WORKOUT_CONFIG,
): CustomExerciseSpec {
  const profile = prescriptionProfileFor(exercise, roleFor(exercise));
  const p = config.prescriptions[plan.programStyle][profile];
  return {
    exerciseId: exercise.id,
    sets: Math.min(Math.max(p.sets[plan.experience], CUSTOM_PLAN_LIMITS.sets.min), CUSTOM_PLAN_LIMITS.sets.max),
    target: exercise.measurement === 'time' ? { kind: 'time', seconds: p.timeSeconds } : { kind: 'reps', min: p.reps.min, max: p.reps.max },
    restSeconds: p.restSeconds,
  };
}

/** Stored metadata only: the closest objective role for an exercise the user picked themselves. */
function roleFor(exercise: Exercise): ObjectiveRole {
  if (exercise.pattern === 'conditioning') {
    return 'conditioning';
  }
  if (exercise.pattern === 'core-flexion' || exercise.pattern === 'anti-extension' || exercise.pattern === 'anti-rotation') {
    return 'core';
  }
  return exercise.mechanics === 'isolation' ? 'accessory' : 'secondary';
}

function plannedFrom(spec: CustomExerciseSpec, order: number, exercise: Exercise, base: WorkoutPlan, repeated: boolean): PlannedExercise {
  const role = roleFor(exercise);
  return {
    exerciseId: spec.exerciseId,
    order,
    sets: spec.sets,
    target: spec.target,
    restSeconds: spec.restSeconds,
    notes: [
      ...(exercise.laterality === 'unilateral' ? (['per-side'] as const) : []),
      ...(exercise.measurement === 'time' ? (['time-based'] as const) : []),
      ...(exercise.requires.length === 0 ? (['bodyweight'] as const) : []),
    ],
    prescriptionProfile: prescriptionProfileFor(exercise, role),
    sequenceCategory: sequenceCategoryFor(exercise, role),
    progression: progressionFor(exercise, spec.target, base),
    // Not chosen by the engine: a neutral record that satisfies the plan schema.
    selection: {
      objectiveId: 'custom',
      role,
      matchedPattern: exercise.pattern,
      movementClass: exercise.movementClass,
      substitute: false,
      score: 0,
      candidateCount: 1,
      reasons: [],
    },
    volumeAdjustment: null,
    weeklyRepetition: repeated ? 'repeated' : 'single',
  };
}

function progressionFor(exercise: Exercise, target: ExerciseTarget, base: WorkoutPlan): ProgressionRule {
  const strategy = base.progressionStrategy;
  if (target.kind === 'time') {
    return {
      type: 'time-progression',
      startSeconds: target.seconds,
      incrementSeconds: strategy.timeIncrementSeconds,
      maxSeconds: Math.max(strategy.maxTimeSeconds, target.seconds),
      chain: null,
    };
  }
  if (exercise.loadability === 'low') {
    return {
      type: 'rep-progression',
      lowerRepBound: target.min,
      upperRepBound: target.max,
      advanceWhen: 'all-sets-at-upper-bound',
      thenProgressBy: 'harder-variation',
      chain: null,
    };
  }
  return {
    type: 'double-progression',
    lowerRepBound: target.min,
    upperRepBound: target.max,
    loadIncreasePercent: strategy.loadIncreasePercent,
    advanceWhen: 'all-sets-at-upper-bound',
  };
}

/** Direct sets per volume group from the user's exercises, against the plan's existing targets. */
function weeklyVolumeOf(base: WorkoutPlan, sessions: readonly WorkoutPlan['sessions'][number][], catalog: ReadonlyMap<string, Exercise>) {
  const sets = Object.fromEntries(VOLUME_GROUPS.map((g) => [g, 0])) as Record<VolumeGroup, number>;
  for (const session of sessions) {
    for (const planned of session.exercises) {
      const exercise = catalog.get(planned.exerciseId);
      if (!exercise || planned.selection.role === 'core' || planned.selection.role === 'conditioning') {
        continue;
      }
      for (const group of volumeGroupsOf(exercise)) {
        sets[group] += planned.sets;
      }
    }
  }
  return Object.fromEntries(
    VOLUME_GROUPS.map((g) => {
      const { target } = base.explanation.weeklyVolume[g];
      return [g, { sets: sets[g], target, status: volumeStatus(sets[g], target) }];
    }),
  ) as WorkoutPlan['explanation']['weeklyVolume'];
}
