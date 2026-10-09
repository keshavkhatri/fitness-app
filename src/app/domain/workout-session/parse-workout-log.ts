import { isOneOf } from '../fitness-profile';
import { WORKOUT_PROGRAMMING_VERSIONS, isSessionType } from '../workout-programming';
import {
  ExerciseLog,
  LoggingMode,
  PlannedPrescription,
  SetLog,
  SetStatus,
  WeightUnit,
  WorkoutLog,
  WorkoutLogStatus,
} from './workout-log.model';

/**
 * Runtime parser for a stored workout log. Rebuilds it field by field; any
 * unknown value, missing field or broken invariant makes it invalid (null).
 * Extra fields are dropped.
 */
export function parseWorkoutLog(value: unknown): WorkoutLog | null {
  try {
    return readLog(value);
  } catch (error) {
    if (error instanceof InvalidLog) {
      return null;
    }
    throw error;
  }
}

class InvalidLog extends Error {}
const invalid = (): never => {
  throw new InvalidLog();
};

type Fields = Readonly<Record<string, unknown>>;
const fields = (value: unknown): Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Fields) : invalid();
const list = <T>(value: unknown, read: (item: unknown) => T): T[] => (Array.isArray(value) ? value.map(read) : invalid());
const text = (value: unknown): string => (typeof value === 'string' && value.length > 0 ? value : invalid());
const instant = (value: unknown): string => (Number.isFinite(Date.parse(text(value))) ? (value as string) : invalid());
const flag = (value: unknown): boolean => (typeof value === 'boolean' ? value : invalid());
const count = (value: unknown, min = 0): number => (Number.isInteger(value) && (value as number) >= min ? (value as number) : invalid());
const finite = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : invalid());
const nullable =
  <T>(read: (value: unknown) => T) =>
  (value: unknown): T | null =>
    value === null ? null : read(value);
const member =
  <T>(guard: (value: unknown) => value is T) =>
  (value: unknown): T =>
    guard(value) ? value : invalid();

const isStatus = isOneOf<WorkoutLogStatus>(['in-progress', 'completed']);
const isUnit = isOneOf<WeightUnit>(['kg', 'lb']);
const isMode = isOneOf<LoggingMode>(['weight-reps', 'reps', 'duration']);
const isSetStatus = isOneOf<SetStatus>(['pending', 'completed', 'skipped']);
const isVersion = isOneOf(WORKOUT_PROGRAMMING_VERSIONS);

function readLog(value: unknown): WorkoutLog {
  const l = fields(value);
  const source = fields(l['source']);
  const status = member(isStatus)(l['status']);
  const completedAt = nullable(instant)(l['completedAt']);
  const exercises = list(l['exercises'], readExercise);
  const currentExerciseIndex = count(l['currentExerciseIndex']);
  if (
    exercises.length === 0 ||
    currentExerciseIndex >= exercises.length ||
    (status === 'completed') !== (completedAt !== null)
  ) {
    invalid();
  }
  return {
    id: text(l['id']),
    source: {
      planId: text(source['planId']),
      workoutProgrammingVersion: member(isVersion)(source['workoutProgrammingVersion']),
      sessionId: text(source['sessionId']),
    },
    sessionType: member(isSessionType)(l['sessionType']),
    variant: nullable(text)(l['variant']),
    weightUnit: member(isUnit)(l['weightUnit']),
    startedAt: instant(l['startedAt']),
    completedAt,
    status,
    currentExerciseIndex,
    exercises,
  };
}

function readPlanned(value: unknown): PlannedPrescription {
  const p = fields(value);
  const target = fields(p['target']);
  return {
    sets: count(p['sets'], 1),
    target:
      target['kind'] === 'time'
        ? { kind: 'time', seconds: count(target['seconds'], 1) }
        : target['kind'] === 'reps'
          ? { kind: 'reps', min: count(target['min'], 1), max: count(target['max'], 1) }
          : invalid(),
    restSeconds: count(p['restSeconds']),
    perSide: flag(p['perSide']),
  };
}

function readExercise(value: unknown): ExerciseLog {
  const e = fields(value);
  const planned = readPlanned(e['planned']);
  const sets = list(e['sets'], readSet);
  if (sets.length !== planned.sets || sets.some((s, i) => s.setNumber !== i + 1)) {
    invalid();
  }
  return {
    exerciseId: text(e['exerciseId']),
    name: text(e['name']),
    order: count(e['order'], 1),
    planned,
    logging: member(isMode)(e['logging']),
    sets,
  };
}

function readSet(value: unknown): SetLog {
  const s = fields(value);
  const status = member(isSetStatus)(s['status']);
  const set: SetLog = {
    setNumber: count(s['setNumber'], 1),
    status,
    weight: nullable(finite)(s['weight']),
    reps: nullable((v) => count(v, 1))(s['reps']),
    durationSeconds: nullable((v) => count(v, 1))(s['durationSeconds']),
    completedAt: nullable(instant)(s['completedAt']),
  };
  // Values and a completion time exist only on completed sets.
  const hasValues = set.weight !== null || set.reps !== null || set.durationSeconds !== null;
  if (status === 'completed' ? set.completedAt === null || !hasValues : set.completedAt !== null || hasValues) {
    invalid();
  }
  return set;
}
