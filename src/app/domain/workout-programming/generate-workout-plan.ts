import {
  IsoCalendarDate,
  PrimaryGoal,
  isPrimaryGoal,
  isTrainingExperience,
  parseIsoCalendarDate,
} from '../fitness-profile';
import { Exercise, ProgressionChain } from './exercise.model';
import { EXERCISE_LIBRARY, PROGRESSION_CHAINS, validateExerciseCatalog, validateProgressionChains } from './exercise-library';
import { ChainLookup, SelectionContext, isExerciseAvailable } from './exercise-selection';
import { WorkoutResult, fail, ok } from './errors';
import { progressionStrategyFor } from './prescription';
import { SessionRequest, buildResistanceWeek } from './session-builder';
import { selectSplit } from './split-selection';
import { DEFAULT_WORKOUT_CONFIG, SplitDefinition, WorkoutProgrammingConfig, validateWorkoutConfig } from './workout-config';
import { WorkoutGenerationInput } from './workout-input.model';
import {
  ActivitySession,
  PlanAssumption,
  PlanExplanation,
  PlanSession,
  PlanWarning,
  WeeklyVolumeEntry,
  WorkoutPlan,
} from './workout-plan.model';
import { canonicalJson, fnv1a32 } from './plan-identity';
import { volumeStatus } from './weekly-volume';
import {
  ActivityDayType,
  DayType,
  SessionType,
  SplitStrategy,
  VOLUME_GROUPS,
  VolumeGroup,
  WORKOUT_EQUIPMENT,
  WORKOUT_LOCATIONS,
  isActivityDayType,
  isSessionType,
  isWorkoutEquipment,
  isWorkoutFrequency,
  isWorkoutLocation,
} from './workout-taxonomy';

export interface GenerationOptions {
  /** Calendar date recorded on the plan ("YYYY-MM-DD"). Passed in: the engine has no clock. */
  readonly generatedAt: IsoCalendarDate;
  readonly config?: WorkoutProgrammingConfig;
  readonly catalog?: readonly Exercise[];
  readonly chains?: readonly ProgressionChain[];
  /** Assumptions made upstream (e.g. by `workoutInputFromProfile`) to record on the plan. */
  readonly assumptions?: readonly PlanAssumption[];
}

/**
 * Generates a deterministic workout plan.
 *
 * Pipeline: validate → normalize input → split selection → available
 * exercise pool → objective-based week construction (required objectives,
 * volume-aware optional objectives, prescriptions, set redistribution,
 * sequencing) → activity days → versioned, explainable plan.
 *
 * Same input + same options → identical plan (including its id). No
 * randomness, no clock, no I/O; framework-free.
 */
export function generateWorkoutPlan(
  input: WorkoutGenerationInput,
  options: GenerationOptions,
): WorkoutResult<WorkoutPlan> {
  const config = options.config ?? DEFAULT_WORKOUT_CONFIG;
  const catalog = options.catalog ?? EXERCISE_LIBRARY;
  const chains = options.chains ?? PROGRESSION_CHAINS;

  // --- Validation ------------------------------------------------------------
  const configProblems = [
    ...validateWorkoutConfig(config),
    ...validateExerciseCatalog(catalog),
    ...validateProgressionChains(chains, catalog),
  ];
  if (configProblems.length > 0) {
    return fail('invalid-configuration', configProblems.join(' '), { problems: configProblems });
  }
  const inputError = validateInput(input);
  if (inputError) {
    return inputError;
  }
  if (!parseIsoCalendarDate(options.generatedAt)) {
    return fail('invalid-generated-date', `generatedAt must be a valid YYYY-MM-DD date, got "${options.generatedAt}".`);
  }
  const normalized = normalizeInput(input);

  // --- Pool --------------------------------------------------------------------
  const pool = [...catalog]
    .filter((exercise) => isExerciseAvailable(exercise, normalized))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  if (pool.length === 0) {
    return fail('no-compatible-exercises', 'No exercise in the catalog matches the locations, equipment and experience.', {
      locations: normalized.locations,
      equipment: normalized.equipment,
    });
  }

  // --- Plan structure ----------------------------------------------------------
  const goal: PrimaryGoal = normalized.goal;
  const style = config.programStyleByGoal[goal];
  const budget = config.volume.exercisesPerSession[normalized.experience] + config.volume.goalAdjustment[goal];
  const includeFinisher = config.conditioningFinisher.goals.includes(goal);
  const chainLookup = new Map<string, ChainLookup>();
  for (const chain of chains) {
    chain.steps.forEach((id, index) => chainLookup.set(id, { chain, index, entryIndex: chain.steps.indexOf(chain.entry) }));
  }
  const context: SelectionContext = { input: normalized, style, config, pool, chains: chainLookup };
  const catalogById = new Map(catalog.map((e) => [e.id, e]));
  const weekOptions: WeekOptions = { budget, includeFinisher, context, catalog: catalogById };

  const selected = selectSplit(normalized.daysPerWeek, goal, normalized.experience, config);
  let split = selected.split;
  let source: PlanExplanation['split']['source'] = selected.source;
  let replacedStrategy: SplitStrategy | null = null;
  let week = buildWeek(split, weekOptions);

  // The split may be unbuildable with limited equipment (e.g. bodyweight-only push/pull/legs).
  // Resistance days become full-body; activity days are kept as they are.
  if (
    !week.ok &&
    week.error.code === 'impossible-session-requirements' &&
    config.splits.infeasibleFallback === 'full-body' &&
    split.sessions.some((day) => isSessionType(day) && day !== 'full-body')
  ) {
    replacedStrategy = split.strategy;
    const hasActivityDays = split.sessions.some(isActivityDayType);
    split = {
      strategy: hasActivityDays ? 'full-body-with-recovery' : 'full-body',
      sessions: split.sessions.map((day): DayType => (isSessionType(day) ? 'full-body' : day)),
    };
    source = 'equipment-fallback';
    week = buildWeek(split, weekOptions);
  }
  if (!week.ok) {
    return week;
  }
  const { sessions, warnings, volume, targets } = week.value;

  // --- Identity ----------------------------------------------------------------
  const id = `wp-${config.version}-${fnv1a32(canonicalJson({ version: config.version, input: normalized, config, catalog, chains }))}`;

  const weeklyVolume = Object.fromEntries(
    VOLUME_GROUPS.map((g): [VolumeGroup, WeeklyVolumeEntry] => [
      g,
      { sets: volume[g], target: targets[g], status: volumeStatus(volume[g], targets[g]) },
    ]),
  ) as Record<VolumeGroup, WeeklyVolumeEntry>;

  return ok({
    id,
    workoutProgrammingVersion: config.version,
    generatedAt: options.generatedAt,
    goal,
    experience: normalized.experience,
    daysPerWeek: normalized.daysPerWeek,
    programStyle: style,
    split: { strategy: split.strategy, sessionTypes: split.sessions },
    sessions,
    progressionStrategy: progressionStrategyFor(style, normalized.experience, config),
    explanation: {
      split: {
        frequency: normalized.daysPerWeek,
        resistanceSessions: sessions.filter((session) => session.kind === 'resistance').length,
        activityDays: sessions.filter((session) => session.kind === 'activity').length,
        goal,
        strategy: split.strategy,
        source,
        replacedStrategy,
      },
      volume: {
        programStyle: style,
        experience: normalized.experience,
        exercisesPerSession: budget,
        conditioningFinisher: includeFinisher,
        variationRoles: config.variation.rolesByStyle[style][normalized.experience],
      },
      weeklyVolume,
      availability: {
        locations: normalized.locations,
        equipment: normalized.equipment,
        availableExerciseCount: pool.length,
      },
    },
    assumptions: [
      'bodyweight-always-available',
      'no-starting-loads',
      'day-order-not-weekday-schedule',
      ...(options.assumptions ?? []),
    ],
    warnings,
  });
}

interface WeekOptions {
  readonly budget: number;
  readonly includeFinisher: boolean;
  readonly context: SelectionContext;
  readonly catalog: ReadonlyMap<string, Exercise>;
}

/** Builds every day of a split: resistance sessions together (they share weekly balance), activity days as guidance. */
function buildWeek(
  split: SplitDefinition,
  { budget, includeFinisher, context, catalog }: WeekOptions,
): WorkoutResult<{
  sessions: PlanSession[];
  warnings: readonly PlanWarning[];
  volume: Readonly<Record<VolumeGroup, number>>;
  targets: Readonly<Record<VolumeGroup, { min: number; max: number }>>;
}> {
  const typeCounts = countBy(split.sessions);
  const typeSeen = new Map<SessionType, number>();
  const requests: SessionRequest[] = [];
  const activity: ActivitySession[] = [];

  for (const [index, dayType] of split.sessions.entries()) {
    const dayIndex = index + 1;
    if (isActivityDayType(dayType)) {
      activity.push(buildActivitySession(dayType, dayIndex, context.config));
      continue;
    }
    const sessionType = dayType;
    const occurrence = typeSeen.get(sessionType) ?? 0;
    typeSeen.set(sessionType, occurrence + 1);
    const templates = context.config.templates.filter((t) => t.sessionType === sessionType);
    requests.push({
      id: `day-${dayIndex}-${sessionType}`,
      dayIndex,
      sessionType,
      variant: (typeCounts.get(sessionType) ?? 0) > 1 ? String.fromCharCode(65 + occurrence) : null,
      // Repeated session types rotate through their templates (full body A/B/C, lower A/B).
      template: templates[occurrence % templates.length],
    });
  }

  const resistance = buildResistanceWeek(
    { sessions: requests, includeFinisher, exerciseBudget: budget, strategy: split.strategy },
    context,
    catalog,
  );
  if (!resistance.ok) {
    return resistance;
  }
  const sessions: PlanSession[] = [...resistance.value.sessions, ...activity].sort((a, b) => a.dayIndex - b.dayIndex);
  return ok({
    sessions,
    warnings: resistance.value.warnings,
    volume: resistance.value.volume,
    targets: resistance.value.targets,
  });
}

const ACTIVITY_LABELS: Readonly<Record<ActivityDayType, string>> = {
  'light-activity': 'Light Activity',
  'optional-conditioning': 'Optional Conditioning',
};

/** A recovery/light day: guidance only, no exercises. */
function buildActivitySession(
  dayType: ActivityDayType,
  dayIndex: number,
  config: WorkoutProgrammingConfig,
): ActivitySession {
  const day = config.activityDays[dayType];
  return {
    kind: 'activity',
    id: `day-${dayIndex}-${dayType}`,
    name: ACTIVITY_LABELS[dayType],
    dayIndex,
    sessionType: dayType,
    optional: day.optional,
    intensity: 'easy',
    durationMinutes: day.durationMinutes,
    suggestedActivities: day.suggestedActivities,
    estimatedDurationMinutes: day.durationMinutes.max,
    exercises: [],
  };
}

function validateInput(input: WorkoutGenerationInput): WorkoutResult<never> | null {
  if (!isPrimaryGoal(input.goal)) {
    return fail('unsupported-goal', `Unsupported goal "${String(input.goal)}".`);
  }
  if (!isTrainingExperience(input.experience)) {
    return fail('invalid-experience', `Unknown experience level "${String(input.experience)}".`);
  }
  if (!isWorkoutFrequency(input.daysPerWeek)) {
    return fail('invalid-frequency', `Training frequency must be 2–6 days per week, got ${String(input.daysPerWeek)}.`, {
      supported: ['2', '3', '4', '5', '6'],
    });
  }
  if (!Array.isArray(input.locations) || input.locations.length === 0) {
    return fail('missing-location', 'At least one training location is required.');
  }
  if (!input.locations.every(isWorkoutLocation)) {
    return fail('invalid-location', 'Unknown training location.', { supported: WORKOUT_LOCATIONS });
  }
  if (!Array.isArray(input.equipment)) {
    return fail('missing-equipment', 'Equipment must be provided (use an empty list for bodyweight only).');
  }
  if (!input.equipment.every(isWorkoutEquipment)) {
    return fail('invalid-equipment', 'Unknown equipment.', { supported: WORKOUT_EQUIPMENT });
  }
  return null;
}

/** De-duplicated, canonically ordered locations and equipment (so ordering never changes a plan). */
function normalizeInput(input: WorkoutGenerationInput): WorkoutGenerationInput {
  return {
    goal: input.goal,
    experience: input.experience,
    daysPerWeek: input.daysPerWeek,
    locations: WORKOUT_LOCATIONS.filter((l) => input.locations.includes(l)),
    equipment: WORKOUT_EQUIPMENT.filter((e) => input.equipment.includes(e)),
  };
}

function countBy<T>(values: readonly T[]): Map<T, number> {
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}
