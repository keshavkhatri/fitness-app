import { PRIMARY_GOALS, isOneOf, isTrainingExperience, parseIsoCalendarDate } from '../fitness-profile';
import {
  ActivitySession,
  ChainPosition,
  CoverageReason,
  CoverageStatus,
  EXERCISE_LIBRARY,
  ExerciseTarget,
  ObjectiveCoverage,
  PRESCRIPTION_PROFILES,
  PROGRAM_STYLES,
  PlanAssumption,
  PlanExplanation,
  PlanSession,
  PlanWarning,
  PlannedExercise,
  PrescriptionNote,
  ProgressionRule,
  ProgressionStrategy,
  SPLIT_STRATEGIES,
  SelectionExplanation,
  SelectionReason,
  VOLUME_GROUPS,
  VolumeAdjustment,
  VolumeGroup,
  WORKOUT_PROGRAMMING_VERSIONS,
  WeeklyRepetition,
  WeeklyVolumeEntry,
  WorkoutPlan,
  WorkoutSession,
  isActivityDayType,
  isActivityKind,
  isDayType,
  isMovementClass,
  isMovementPattern,
  isObjectiveRole,
  isSequenceCategory,
  isSessionType,
  isVolumeGroup,
  isWorkoutEquipment,
  isWorkoutFrequency,
  isWorkoutLocation,
} from '../workout-programming';

/**
 * Runtime parser for a stored (or, later, API-provided) workout plan.
 *
 * Rebuilds the plan field by field: unknown values, missing fields or
 * exercises that are not in the catalog make the whole plan invalid (null).
 * A plan that parses is safe for the UI to render without further checks.
 * Extra fields are dropped.
 */
export function parseWorkoutPlan(
  value: unknown,
  knownExerciseIds: ReadonlySet<string> = CATALOG_IDS,
): WorkoutPlan | null {
  try {
    return readPlan(value, knownExerciseIds);
  } catch (error) {
    if (error instanceof InvalidPlan) {
      return null;
    }
    throw error;
  }
}

const CATALOG_IDS: ReadonlySet<string> = new Set(EXERCISE_LIBRARY.map((e) => e.id));

// --- Unions without a runtime list in the engine -------------------------------------
// Record<Union, true> makes the compiler reject a missing or unknown member.

const membership =
  <T extends string>(members: Readonly<Record<T, true>>) =>
  (value: unknown): value is T =>
    typeof value === 'string' && Object.hasOwn(members, value);

const isSelectionReason = membership<SelectionReason>({
  'preferred-pattern': true,
  'fallback-pattern': true,
  'substitute-class': true,
  'compound-for-main-objective': true,
  'isolation-in-main-objective': true,
  'loadable-for-goal': true,
  'free-weight-for-strength': true,
  'experience-match': true,
  'supported-for-beginner': true,
  'free-weight-for-advanced': true,
  'unilateral-for-general-fitness': true,
  'staple-exercise': true,
  'fallback-exercise': true,
  'curated-for-style': true,
  'regression-step': true,
  'muscle-overlap-penalty': true,
  'excess-fatigue-penalty': true,
  'weekly-repeat-penalty': true,
  'weekly-volume-deficit': true,
  'tie-broken-by-id': true,
});
const isPlanAssumption = membership<PlanAssumption>({
  'bodyweight-always-available': true,
  'no-starting-loads': true,
  'day-order-not-weekday-schedule': true,
  'combined-gym-and-home-equipment': true,
  'unrecognized-equipment-ignored': true,
  'full-gym-includes-all-equipment': true,
});
const isCoverageStatus = membership<CoverageStatus>({ filled: true, substituted: true, unfilled: true, 'not-selected': true });
const isCoverageReason = membership<CoverageReason>({
  'no-compatible-exercise': true,
  'no-full-movement-available': true,
  'session-budget-reached': true,
});
const isPrescriptionNote = membership<PrescriptionNote>({ 'per-side': true, 'time-based': true, bodyweight: true });
const isWeeklyRepetition = membership<WeeklyRepetition>({ foundational: true, repeated: true, single: true });
const isAdjustmentReason = membership<VolumeAdjustment['reason']>({
  'weekly-volume-below-target': true,
  'weekly-volume-above-target': true,
  'session-duration-below-target': true,
  'session-duration-above-target': true,
});
const isSplitSource = membership<PlanExplanation['split']['source']>({
  'frequency-default': true,
  'goal-override': true,
  'experience-override': true,
  'equipment-fallback': true,
});
const isVolumeStatus = membership<WeeklyVolumeEntry['status']>({ below: true, within: true, above: true });

const isVersion = isOneOf(WORKOUT_PROGRAMMING_VERSIONS);
const isGoal = isOneOf(PRIMARY_GOALS);
const isProgramStyle = isOneOf(PROGRAM_STYLES);
const isSplitStrategy = isOneOf(SPLIT_STRATEGIES);
const isPrescriptionProfile = isOneOf(PRESCRIPTION_PROFILES);

// --- Readers ---------------------------------------------------------------------------

class InvalidPlan extends Error {}

const invalid = (): never => {
  throw new InvalidPlan();
};

type Fields = Readonly<Record<string, unknown>>;

const fields = (value: unknown): Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Fields) : invalid();
const list = <T>(value: unknown, read: (item: unknown) => T): T[] => (Array.isArray(value) ? value.map(read) : invalid());
const text = (value: unknown): string => (typeof value === 'string' && value.length > 0 ? value : invalid());
const flag = (value: unknown): boolean => (typeof value === 'boolean' ? value : invalid());
const finite = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : invalid());
const count = (value: unknown, min = 0): number => (Number.isInteger(value) && (value as number) >= min ? (value as number) : invalid());
const member =
  <T>(guard: (value: unknown) => value is T) =>
  (value: unknown): T =>
    guard(value) ? value : invalid();
const nullable =
  <T>(read: (value: unknown) => T) =>
  (value: unknown): T | null =>
    value === null ? null : read(value);
const exact = <T extends string | boolean>(expected: T, value: unknown): T => (value === expected ? expected : invalid());
const range = (value: unknown): { min: number; max: number } => {
  const r = fields(value);
  const min = finite(r['min']);
  const max = finite(r['max']);
  return min <= max ? { min, max } : invalid();
};

function readPlan(value: unknown, known: ReadonlySet<string>): WorkoutPlan {
  const p = fields(value);
  const exerciseId = (id: unknown): string => (known.has(text(id)) ? (id as string) : invalid());
  const daysPerWeek = member(isWorkoutFrequency)(p['daysPerWeek']);
  const generatedAt = text(p['generatedAt']);
  if (!parseIsoCalendarDate(generatedAt)) {
    invalid();
  }

  const splitFields = fields(p['split']);
  const split = {
    strategy: member(isSplitStrategy)(splitFields['strategy']),
    sessionTypes: list(splitFields['sessionTypes'], member(isDayType)),
  };
  const sessions = list(p['sessions'], (s) => readSession(s, exerciseId));
  if (
    split.sessionTypes.length !== daysPerWeek ||
    sessions.length !== daysPerWeek ||
    sessions.some((s, i) => s.dayIndex !== i + 1 || s.sessionType !== split.sessionTypes[i])
  ) {
    invalid();
  }

  return {
    id: text(p['id']),
    workoutProgrammingVersion: member(isVersion)(p['workoutProgrammingVersion']),
    generatedAt,
    goal: member(isGoal)(p['goal']),
    experience: member(isTrainingExperience)(p['experience']),
    daysPerWeek,
    programStyle: member(isProgramStyle)(p['programStyle']),
    split,
    sessions,
    progressionStrategy: readProgressionStrategy(p['progressionStrategy']),
    explanation: readExplanation(p['explanation']),
    assumptions: list(p['assumptions'], member(isPlanAssumption)),
    warnings: list(p['warnings'], (w) => readWarning(w, exerciseId)),
  };
}

function readSession(value: unknown, exerciseId: (id: unknown) => string): PlanSession {
  const s = fields(value);
  const common = { id: text(s['id']), name: text(s['name']), dayIndex: count(s['dayIndex'], 1) };
  if (s['kind'] === 'activity') {
    if (!Array.isArray(s['exercises']) || s['exercises'].length > 0) {
      invalid();
    }
    const session: ActivitySession = {
      kind: 'activity',
      ...common,
      sessionType: member(isActivityDayType)(s['sessionType']),
      optional: flag(s['optional']),
      intensity: exact('easy', s['intensity']),
      durationMinutes: range(s['durationMinutes']),
      suggestedActivities: list(s['suggestedActivities'], member(isActivityKind)),
      estimatedDurationMinutes: count(s['estimatedDurationMinutes'], 1),
      exercises: [],
    };
    return session;
  }
  if (s['kind'] !== 'resistance') {
    return invalid();
  }
  const exercises = list(s['exercises'], (e) => readExercise(e, exerciseId));
  if (exercises.length === 0 || exercises.some((e, i) => e.order !== i + 1)) {
    invalid();
  }
  const session: WorkoutSession = {
    kind: 'resistance',
    ...common,
    sessionType: member(isSessionType)(s['sessionType']),
    variant: nullable(text)(s['variant']),
    templateId: text(s['templateId']),
    estimatedDurationMinutes: count(s['estimatedDurationMinutes'], 1),
    exercises,
    objectives: list(s['objectives'], (o) => readCoverage(o, exerciseId)),
  };
  return session;
}

function readCoverage(value: unknown, exerciseId: (id: unknown) => string): ObjectiveCoverage {
  const o = fields(value);
  return {
    objectiveId: text(o['objectiveId']),
    role: member(isObjectiveRole)(o['role']),
    required: flag(o['required']),
    status: member(isCoverageStatus)(o['status']),
    exerciseId: nullable(exerciseId)(o['exerciseId']),
    reason: nullable(member(isCoverageReason))(o['reason']),
  };
}

function readExercise(value: unknown, exerciseId: (id: unknown) => string): PlannedExercise {
  const e = fields(value);
  return {
    exerciseId: exerciseId(e['exerciseId']),
    order: count(e['order'], 1),
    sets: count(e['sets'], 1),
    target: readTarget(e['target']),
    restSeconds: count(e['restSeconds']),
    notes: list(e['notes'], member(isPrescriptionNote)),
    prescriptionProfile: member(isPrescriptionProfile)(e['prescriptionProfile']),
    sequenceCategory: member(isSequenceCategory)(e['sequenceCategory']),
    progression: readProgression(e['progression'], exerciseId),
    selection: readSelection(e['selection']),
    volumeAdjustment: nullable(readVolumeAdjustment)(e['volumeAdjustment']),
    weeklyRepetition: member(isWeeklyRepetition)(e['weeklyRepetition']),
  };
}

function readTarget(value: unknown): ExerciseTarget {
  const t = fields(value);
  if (t['kind'] === 'time') {
    return { kind: 'time', seconds: count(t['seconds'], 1) };
  }
  if (t['kind'] !== 'reps') {
    return invalid();
  }
  const { min, max } = range(t);
  return Number.isInteger(min) && min >= 1 && Number.isInteger(max) ? { kind: 'reps', min, max } : invalid();
}

function readChain(value: unknown, exerciseId: (id: unknown) => string): ChainPosition {
  const c = fields(value);
  return {
    chainId: text(c['chainId']),
    regression: nullable(exerciseId)(c['regression']),
    progression: nullable(exerciseId)(c['progression']),
  };
}

function readProgression(value: unknown, exerciseId: (id: unknown) => string): ProgressionRule {
  const r = fields(value);
  const chain = (v: unknown) => nullable((c) => readChain(c, exerciseId))(v);
  switch (r['type']) {
    case 'double-progression':
      return {
        type: 'double-progression',
        lowerRepBound: count(r['lowerRepBound'], 1),
        upperRepBound: count(r['upperRepBound'], 1),
        loadIncreasePercent: finite(r['loadIncreasePercent']),
        advanceWhen: exact('all-sets-at-upper-bound', r['advanceWhen']),
      };
    case 'rep-progression':
      return {
        type: 'rep-progression',
        lowerRepBound: count(r['lowerRepBound'], 1),
        upperRepBound: count(r['upperRepBound'], 1),
        advanceWhen: exact('all-sets-at-upper-bound', r['advanceWhen']),
        thenProgressBy: exact('harder-variation', r['thenProgressBy']),
        chain: chain(r['chain']),
      };
    case 'time-progression':
      return {
        type: 'time-progression',
        startSeconds: count(r['startSeconds'], 1),
        incrementSeconds: count(r['incrementSeconds'], 1),
        maxSeconds: count(r['maxSeconds'], 1),
        chain: chain(r['chain']),
      };
    default:
      return invalid();
  }
}

function readSelection(value: unknown): SelectionExplanation {
  const s = fields(value);
  return {
    objectiveId: text(s['objectiveId']),
    role: member(isObjectiveRole)(s['role']),
    matchedPattern: member(isMovementPattern)(s['matchedPattern']),
    movementClass: member(isMovementClass)(s['movementClass']),
    substitute: flag(s['substitute']),
    score: finite(s['score']),
    candidateCount: count(s['candidateCount'], 1),
    reasons: list(s['reasons'], member(isSelectionReason)),
  };
}

function readVolumeAdjustment(value: unknown): VolumeAdjustment {
  const v = fields(value);
  const setsDelta = finite(v['setsDelta']);
  return {
    setsDelta: Number.isInteger(setsDelta) && setsDelta !== 0 ? setsDelta : invalid(),
    groups: list(v['groups'], member(isVolumeGroup)),
    reason: member(isAdjustmentReason)(v['reason']),
  };
}

function readProgressionStrategy(value: unknown): ProgressionStrategy {
  const s = fields(value);
  return {
    loadedExercises: exact('double-progression', s['loadedExercises']),
    bodyweightExercises: exact('rep-progression', s['bodyweightExercises']),
    timedExercises: exact('time-progression', s['timedExercises']),
    loadIncreasePercent: finite(s['loadIncreasePercent']),
    timeIncrementSeconds: count(s['timeIncrementSeconds'], 1),
    maxTimeSeconds: count(s['maxTimeSeconds'], 1),
    historyBased: exact(false, s['historyBased']),
  };
}

function readExplanation(value: unknown): PlanExplanation {
  const e = fields(value);
  const split = fields(e['split']);
  const volume = fields(e['volume']);
  const weekly = fields(e['weeklyVolume']);
  const availability = fields(e['availability']);
  return {
    split: {
      frequency: member(isWorkoutFrequency)(split['frequency']),
      resistanceSessions: count(split['resistanceSessions'], 1),
      activityDays: count(split['activityDays']),
      goal: member(isGoal)(split['goal']),
      strategy: member(isSplitStrategy)(split['strategy']),
      source: member(isSplitSource)(split['source']),
      replacedStrategy: nullable(member(isSplitStrategy))(split['replacedStrategy']),
    },
    volume: {
      programStyle: member(isProgramStyle)(volume['programStyle']),
      experience: member(isTrainingExperience)(volume['experience']),
      exercisesPerSession: count(volume['exercisesPerSession'], 1),
      conditioningFinisher: flag(volume['conditioningFinisher']),
      variationRoles: list(volume['variationRoles'], member(isObjectiveRole)),
    },
    weeklyVolume: Object.fromEntries(
      VOLUME_GROUPS.map((group): [VolumeGroup, WeeklyVolumeEntry] => {
        const entry = fields(weekly[group]);
        return [group, { sets: count(entry['sets']), target: range(entry['target']), status: member(isVolumeStatus)(entry['status']) }];
      }),
    ) as Record<VolumeGroup, WeeklyVolumeEntry>,
    availability: {
      locations: list(availability['locations'], member(isWorkoutLocation)),
      equipment: list(availability['equipment'], member(isWorkoutEquipment)),
      availableExerciseCount: count(availability['availableExerciseCount'], 1),
    },
  };
}

function readWarning(value: unknown, exerciseId: (id: unknown) => string): PlanWarning {
  const w = fields(value);
  switch (w['code']) {
    case 'objective-unfilled':
      return {
        code: 'objective-unfilled',
        sessionId: text(w['sessionId']),
        objectiveId: text(w['objectiveId']),
        role: member(isObjectiveRole)(w['role']),
      };
    case 'objective-substituted':
      return {
        code: 'objective-substituted',
        sessionId: text(w['sessionId']),
        objectiveId: text(w['objectiveId']),
        exerciseId: exerciseId(w['exerciseId']),
        substituteClass: member(isMovementClass)(w['substituteClass']),
      };
    case 'weekly-volume-outside-target':
      return {
        code: 'weekly-volume-outside-target',
        group: member(isVolumeGroup)(w['group']),
        sets: count(w['sets']),
        target: range(w['target']),
      };
    default:
      return invalid();
  }
}
