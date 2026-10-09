import { PRIMARY_GOALS, PrimaryGoal, TRAINING_EXPERIENCE_LEVELS, TrainingExperience } from '../fitness-profile';
import { CONDITIONING_FINISHER, SESSION_TEMPLATES, SessionTemplate, TrainingObjective, isObjectiveRequired } from './session-templates';
import {
  ACTIVITY_DAY_TYPES,
  ActivityDayType,
  ActivityKind,
  DayType,
  ObjectiveRole,
  PRESCRIPTION_PROFILES,
  PROGRAM_STYLES,
  PrescriptionProfile,
  ProgramStyle,
  SEQUENCE_CATEGORIES,
  SESSION_TYPES,
  SPLIT_STRATEGIES,
  SequenceCategory,
  SplitStrategy,
  VOLUME_GROUPS,
  VolumeGroup,
  WORKOUT_FREQUENCIES,
  WorkoutFrequency,
  isActivityKind,
  isDayType,
  isMovementClass,
  isMovementPattern,
  isObjectiveRole,
  isSequenceCategory,
  isSessionType,
} from './workout-taxonomy';

/**
 * Every programming number lives here. Values are PRODUCT PROGRAMMING
 * DEFAULTS, not clinical prescriptions. Changing anything that alters
 * generated plans requires a new `version`.
 *
 * v2: objective-based sessions, prescription profiles, weekly volume
 * balancing, explicit sequencing, fatigue limits, progression chains,
 * beginner 5/6-day recovery structures. (v1 was never persisted.)
 */
export const WORKOUT_PROGRAMMING_VERSIONS = ['v2'] as const;
export type WorkoutProgrammingVersion = (typeof WORKOUT_PROGRAMMING_VERSIONS)[number];

export interface NumberRange {
  readonly min: number;
  readonly max: number;
}

export interface ProfilePrescription {
  readonly sets: Readonly<Record<TrainingExperience, number>>;
  /** For exercises measured in reps. */
  readonly reps: NumberRange;
  readonly restSeconds: number;
  /** Work interval for exercises measured in time (planks, carries, intervals). */
  readonly timeSeconds: number;
}

/**
 * A weekly minimum that only applies when the week can reasonably include
 * direct work for the group; otherwise the minimum is 0 (the maximum still
 * applies). Used for small "don't let it disappear" minimums.
 */
export interface ConditionalMinimum {
  /** Fewer resistance sessions than this: no minimum. */
  readonly minResistanceSessions: number;
  /** Splits whose sessions have no room for direct work under the session limits. */
  readonly excludedStrategies: readonly SplitStrategy[];
}

export interface SplitDefinition {
  readonly strategy: SplitStrategy;
  /**
   * One entry per available training day, in order; length must equal the
   * frequency. Entries are resistance session types or activity days, so a
   * split can offer N training days without N hard lifting sessions.
   */
  readonly sessions: readonly DayType[];
}

/** Guidance for a non-resistance (activity) day. */
export interface ActivityDayConfig {
  readonly durationMinutes: NumberRange;
  readonly optional: boolean;
  readonly suggestedActivities: readonly ActivityKind[];
}

/**
 * Scoring weights, roughly in the order they should matter. Hard filters
 * (objective pattern/class, equipment, location, difficulty) come first and
 * are not weights.
 */
export interface SelectionWeights {
  /** Per position a matched pattern sits behind the objective's preferred pattern. */
  readonly fallbackPatternPenalty: number;
  /** Exercise of an allowed substitute class (e.g. scapular for a pull). */
  readonly substituteClassPenalty: number;
  /** Isolation exercise filling a primary/secondary (compound) objective. */
  readonly isolationInCompoundObjectivePenalty: number;
  /** Goal suitability: by program style and loadability. */
  readonly loadabilityBonus: Readonly<Record<ProgramStyle, Readonly<Record<'high' | 'moderate' | 'low', number>>>>;
  /** Strength style, primary/secondary objectives: free-weight bonus. */
  readonly strengthFreeWeightBonus: number;
  /** Experience suitability: a progression-chain step whose difficulty equals the user's experience. */
  readonly experienceMatchBonus: number;
  /** Beginners: supported (machine/cable/chest-supported) movements. */
  readonly beginnerSupportedBonus: number;
  /** Advanced: loadable free-weight movements. */
  readonly advancedFreeWeightBonus: number;
  /** General fitness: unilateral movements. */
  readonly generalUnilateralBonus: number;
  /** Selection tier (staple / standard / fallback). */
  readonly tierBonus: Readonly<Record<'staple' | 'standard' | 'fallback', number>>;
  /** Curated staple for the program style. */
  readonly curatedStyleBonus: number;
  /** Progression-chain steps easier than the chain's entry (regressions). */
  readonly regressionPenalty: number;
  /** Per already-selected exercise in the session sharing a primary muscle. */
  readonly primaryMuscleOverlapPenalty: number;
  /** A second high-fatigue lift in the same session. */
  readonly excessFatiguePenalty: number;
  /** Exercise already used this week, for objectives that should vary. */
  readonly weeklyRepeatPenalty: number;
}

export interface WorkoutProgrammingConfig {
  readonly version: WorkoutProgrammingVersion;
  readonly programStyleByGoal: Readonly<Record<PrimaryGoal, ProgramStyle>>;

  readonly splits: {
    readonly byFrequency: Readonly<Record<WorkoutFrequency, SplitDefinition>>;
    /** Goal-specific replacements for particular frequencies. */
    readonly goalOverrides: Readonly<Partial<Record<PrimaryGoal, Partial<Record<WorkoutFrequency, SplitDefinition>>>>>;
    /**
     * Experience-specific replacements. Take precedence over goal overrides:
     * they cap how many demanding sessions are appropriate (e.g. beginners).
     */
    readonly experienceOverrides: Readonly<
      Partial<Record<TrainingExperience, Partial<Record<WorkoutFrequency, SplitDefinition>>>>
    >;
    /**
     * When the chosen split can't be built from the user's equipment (e.g.
     * bodyweight-only push/pull/legs), fall back to full-body sessions at the
     * same frequency. 'none' returns an error instead.
     */
    readonly infeasibleFallback: 'full-body' | 'none';
  };

  readonly templates: readonly SessionTemplate[];
  readonly activityDays: Readonly<Record<ActivityDayType, ActivityDayConfig>>;
  /** Goals that get an optional conditioning finisher objective. */
  readonly conditioningFinisher: { readonly objective: TrainingObjective; readonly goals: readonly PrimaryGoal[] };

  readonly volume: {
    /** Maximum exercises per session by experience (required objectives always fit)… */
    readonly exercisesPerSession: Readonly<Record<TrainingExperience, number>>;
    /** …adjusted by goal (e.g. strength: fewer, more focused exercises). */
    readonly goalAdjustment: Readonly<Record<PrimaryGoal, number>>;
    /** Below this a session is considered impossible to build. */
    readonly minimumExercisesPerSession: number;
  };

  /** Sets / reps / rest by program style and prescription profile. */
  readonly prescriptions: Readonly<Record<ProgramStyle, Readonly<Record<PrescriptionProfile, ProfilePrescription>>>>;

  /** Weekly direct-set ranges by muscle group: avoid obviously skewed programs, not "optimal" volume. */
  readonly weeklyVolume: {
    readonly targets: Readonly<Record<ProgramStyle, Readonly<Record<TrainingExperience, Readonly<Record<VolumeGroup, NumberRange>>>>>>;
    /** Minimums assume this many resistance sessions; fewer sessions scale minimums down proportionally. */
    readonly referenceSessionsPerWeek: number;
    readonly minSetsPerExercise: number;
    readonly maxSetsPerExercise: Readonly<Record<TrainingExperience, number>>;
    /** Upper bound on set adjustments per plan (keeps redistribution small and predictable). */
    readonly maxAdjustments: number;
    /** Priority bonus for an optional objective that would add sets to an under-target group. */
    readonly deficitPriorityBonus: number;
    /** Groups whose minimum applies only under these conditions. */
    readonly conditionalMinimums: Readonly<Partial<Record<VolumeGroup, ConditionalMinimum>>>;
  };

  /** Roles that should also vary between repeated sessions for this user (beyond objectives marked "vary"). */
  readonly variation: {
    readonly rolesByStyle: Readonly<Record<ProgramStyle, Readonly<Record<TrainingExperience, readonly ObjectiveRole[]>>>>;
  };

  readonly selection: SelectionWeights;
  readonly sequencing: { readonly order: readonly SequenceCategory[] };

  readonly progression: {
    readonly loadIncreasePercent: Readonly<Record<ProgramStyle, number>>;
    /** Beginners never exceed this increment (conservative progression). */
    readonly beginnerMaxLoadIncreasePercent: number;
    readonly timeIncrementSeconds: number;
    readonly maxTimeSeconds: number;
  };

  readonly duration: {
    readonly secondsPerRep: number;
    /** Setup/transition time per exercise. */
    readonly setupSecondsPerExercise: number;
    readonly warmupMinutes: number;
    /** Estimates are rounded up to this granularity (they are not exact). */
    readonly roundToMinutes: number;
    /**
     * Realistic session length. Weekly volume balancing never pushes a session
     * above the maximum; a session estimated below the minimum gets extra sets
     * on its existing exercises (never extra exercises), within the per-exercise
     * and weekly muscle-group limits; a session above the maximum loses sets
     * from non-primary work (never below the per-exercise minimum).
     */
    readonly targetSessionMinutes: NumberRange;
  };
}

const sets = (beginner: number, intermediate: number, advanced: number) => ({ beginner, intermediate, advanced });
const rx = (
  s: Record<TrainingExperience, number>,
  min: number,
  max: number,
  restSeconds: number,
  timeSeconds = 30,
): ProfilePrescription => ({ sets: s, reps: { min, max }, restSeconds, timeSeconds });
const fullBody = (n: number): SplitDefinition => ({ strategy: 'full-body', sessions: Array<DayType>(n).fill('full-body') });
const r = (min: number, max: number): NumberRange => ({ min, max });

type VolumeTargets = Readonly<Record<VolumeGroup, NumberRange>>;
const STRENGTH_VOLUME: VolumeTargets = {
  chest: r(6, 14), back: r(8, 16), quads: r(6, 16), hamstrings: r(4, 12), glutes: r(4, 20),
  'side-delts': r(0, 8), 'rear-delts': r(0, 8), biceps: r(0, 8), triceps: r(0, 8), calves: r(0, 8),
};
const GENERAL_VOLUME: VolumeTargets = {
  chest: r(4, 12), back: r(6, 14), quads: r(4, 14), hamstrings: r(3, 12), glutes: r(3, 18),
  'side-delts': r(0, 8), 'rear-delts': r(0, 8), biceps: r(0, 8), triceps: r(0, 8), calves: r(0, 8),
};

export const DEFAULT_WORKOUT_CONFIG: WorkoutProgrammingConfig = {
  version: 'v2',
  programStyleByGoal: {
    'build-muscle': 'hypertrophy',
    recomposition: 'hypertrophy',
    // Fat loss keeps a muscle-building resistance stimulus; no "fat-burning" workouts.
    'lose-fat': 'hypertrophy',
    'get-stronger': 'strength',
    'improve-fitness': 'general',
  },

  splits: {
    byFrequency: {
      2: fullBody(2),
      3: fullBody(3),
      4: { strategy: 'upper-lower', sessions: ['upper', 'lower', 'upper', 'lower'] },
      5: { strategy: 'upper-lower-push-pull-legs', sessions: ['upper', 'lower', 'push', 'pull', 'legs'] },
      6: { strategy: 'push-pull-legs', sessions: ['push', 'pull', 'legs', 'push', 'pull', 'legs'] },
    },
    goalOverrides: {
      // General fitness favours frequent, balanced whole-body sessions.
      'improve-fitness': { 4: fullBody(4) },
    },
    experienceOverrides: {
      // Beginners choosing 5 or 6 days: those are available days, not hard
      // sessions. Three full-body sessions with recovery/light days between.
      beginner: {
        5: {
          strategy: 'full-body-with-recovery',
          sessions: ['full-body', 'light-activity', 'full-body', 'light-activity', 'full-body'],
        },
        6: {
          strategy: 'full-body-with-recovery',
          sessions: ['full-body', 'light-activity', 'full-body', 'light-activity', 'full-body', 'optional-conditioning'],
        },
      },
    },
    infeasibleFallback: 'full-body',
  },

  templates: SESSION_TEMPLATES,
  activityDays: {
    'light-activity': { durationMinutes: r(20, 30), optional: false, suggestedActivities: ['walking', 'easy-cycling', 'mobility'] },
    'optional-conditioning': { durationMinutes: r(15, 20), optional: true, suggestedActivities: ['mobility', 'light-conditioning'] },
  },
  conditioningFinisher: { objective: CONDITIONING_FINISHER, goals: ['lose-fat', 'improve-fitness'] },

  volume: {
    exercisesPerSession: { beginner: 5, intermediate: 7, advanced: 7 },
    goalAdjustment: {
      'build-muscle': 0,
      recomposition: 0,
      'lose-fat': 0,
      'get-stronger': -1,
      'improve-fitness': 0,
    },
    minimumExercisesPerSession: 3,
  },

  prescriptions: {
    hypertrophy: {
      'primary-compound': rx(sets(3, 3, 4), 6, 10, 120),
      'secondary-compound': rx(sets(3, 3, 3), 8, 12, 90),
      // Per side; sides alternate, so less rest is needed between sets.
      'unilateral-compound': rx(sets(2, 3, 3), 8, 12, 60),
      accessory: rx(sets(2, 3, 3), 10, 15, 60),
      // Bodyweight/band: higher reps, shorter rest.
      'low-load': rx(sets(3, 3, 3), 10, 20, 60),
      core: rx(sets(2, 2, 3), 10, 15, 45),
      conditioning: rx(sets(3, 4, 4), 10, 15, 60),
    },
    strength: {
      'primary-compound': rx(sets(3, 4, 5), 4, 6, 180),
      'secondary-compound': rx(sets(3, 3, 3), 6, 8, 150),
      'unilateral-compound': rx(sets(2, 3, 3), 8, 10, 90),
      accessory: rx(sets(2, 2, 3), 8, 12, 75),
      'low-load': rx(sets(3, 3, 3), 8, 15, 60),
      core: rx(sets(2, 2, 3), 8, 12, 45),
      conditioning: rx(sets(2, 3, 3), 10, 15, 60),
    },
    general: {
      'primary-compound': rx(sets(3, 3, 3), 8, 12, 90),
      'secondary-compound': rx(sets(2, 3, 3), 10, 12, 75),
      'unilateral-compound': rx(sets(2, 3, 3), 10, 12, 60),
      accessory: rx(sets(2, 2, 3), 12, 15, 60),
      'low-load': rx(sets(3, 3, 3), 12, 20, 45),
      core: rx(sets(2, 3, 3), 10, 15, 45),
      conditioning: rx(sets(3, 4, 4), 10, 15, 60),
    },
  },

  weeklyVolume: {
    targets: {
      hypertrophy: {
        beginner: {
          chest: r(4, 12), back: r(6, 14), quads: r(4, 14), hamstrings: r(3, 10), glutes: r(3, 16),
          'side-delts': r(0, 8), 'rear-delts': r(0, 8), biceps: r(0, 8), triceps: r(0, 8), calves: r(0, 8),
        },
        intermediate: {
          chest: r(8, 16), back: r(10, 18), quads: r(8, 16), hamstrings: r(6, 14), glutes: r(6, 20),
          // Rows count as back work; a small direct rear-delt minimum keeps rear delts from disappearing.
          'side-delts': r(6, 14), 'rear-delts': r(2, 10), biceps: r(4, 10), triceps: r(4, 10), calves: r(0, 10),
        },
        advanced: {
          chest: r(10, 20), back: r(12, 22), quads: r(10, 18), hamstrings: r(8, 16), glutes: r(8, 22),
          'side-delts': r(8, 16), 'rear-delts': r(3, 12), biceps: r(6, 14), triceps: r(6, 14), calves: r(0, 12),
        },
      },
      strength: { beginner: STRENGTH_VOLUME, intermediate: STRENGTH_VOLUME, advanced: STRENGTH_VOLUME },
      general: { beginner: GENERAL_VOLUME, intermediate: GENERAL_VOLUME, advanced: GENERAL_VOLUME },
    },
    referenceSessionsPerWeek: 4,
    minSetsPerExercise: 2,
    maxSetsPerExercise: { beginner: 4, intermediate: 4, advanced: 5 },
    maxAdjustments: 16,
    deficitPriorityBonus: 25,
    conditionalMinimums: {
      // Two sessions leave no accessory room; upper/lower upper days already hold
      // seven required objectives at the session-length maximum.
      'rear-delts': { minResistanceSessions: 3, excludedStrategies: ['upper-lower'] },
    },
  },

  variation: {
    rolesByStyle: {
      // Beginners repeat their sessions (skill acquisition); only objectives
      // explicitly marked "vary" change between sessions.
      hypertrophy: { beginner: [], intermediate: ['accessory'], advanced: ['secondary', 'accessory', 'core'] },
      // Strength keeps its main lifts constant.
      strength: { beginner: [], intermediate: [], advanced: ['accessory'] },
      general: { beginner: [], intermediate: ['accessory', 'core'], advanced: ['secondary', 'accessory', 'core'] },
    },
  },

  selection: {
    fallbackPatternPenalty: 12,
    substituteClassPenalty: 20,
    isolationInCompoundObjectivePenalty: 15,
    loadabilityBonus: {
      strength: { high: 10, moderate: 4, low: 0 },
      hypertrophy: { high: 12, moderate: 10, low: 0 },
      general: { high: 6, moderate: 5, low: 0 },
    },
    strengthFreeWeightBonus: 3,
    experienceMatchBonus: 4,
    beginnerSupportedBonus: 6,
    advancedFreeWeightBonus: 3,
    generalUnilateralBonus: 2,
    tierBonus: { staple: 3, standard: 0, fallback: -12 },
    curatedStyleBonus: 3,
    regressionPenalty: 8,
    primaryMuscleOverlapPenalty: 3,
    excessFatiguePenalty: 30,
    weeklyRepeatPenalty: 8,
  },

  sequencing: { order: SEQUENCE_CATEGORIES },

  progression: {
    loadIncreasePercent: { hypertrophy: 5, strength: 2.5, general: 5 },
    beginnerMaxLoadIncreasePercent: 2.5,
    timeIncrementSeconds: 5,
    maxTimeSeconds: 60,
  },

  duration: {
    secondsPerRep: 3,
    setupSecondsPerExercise: 60,
    warmupMinutes: 5,
    roundToMinutes: 5,
    targetSessionMinutes: { min: 35, max: 50 },
  },
};

/** Outer sanity limits: stop configuration mistakes from producing absurd workouts. */
export const WORKOUT_CONFIG_LIMITS = {
  exercisesPerSession: { min: 3, max: 10 },
  goalAdjustment: { min: -3, max: 3 },
  sets: { min: 1, max: 6 },
  reps: { min: 1, max: 30 },
  restSeconds: { min: 30, max: 300 },
  /** Strength primary/secondary lifts need meaningful rest. */
  strengthCompoundRestSeconds: { min: 120, max: 300 },
  timeSeconds: { min: 10, max: 120 },
  weeklySets: { min: 0, max: 30 },
  referenceSessions: { min: 2, max: 6 },
  maxAdjustments: { min: 0, max: 50 },
  selectionWeight: { min: -50, max: 50 },
  loadIncreasePercent: { min: 0.5, max: 10 },
  timeIncrementSeconds: { min: 1, max: 30 },
  maxTimeSeconds: { min: 15, max: 180 },
  secondsPerRep: { min: 1, max: 8 },
  setupSecondsPerExercise: { min: 0, max: 180 },
  warmupMinutes: { min: 0, max: 20 },
  roundToMinutes: { min: 1, max: 15 },
  sessionMinutes: { min: 15, max: 120 },
  activityMinutes: { min: 5, max: 60 },
} as const;

const within = (value: number, range: NumberRange) => Number.isFinite(value) && value >= range.min && value <= range.max;

/** Developer-facing problems with a configuration; empty when valid. */
export function validateWorkoutConfig(config: WorkoutProgrammingConfig): string[] {
  const problems: string[] = [];
  const check = (condition: boolean, problem: string) => {
    if (!condition) {
      problems.push(problem);
    }
  };
  const L = WORKOUT_CONFIG_LIMITS;

  check((WORKOUT_PROGRAMMING_VERSIONS as readonly string[]).includes(config.version), `Unknown version "${config.version}".`);

  for (const goal of PRIMARY_GOALS) {
    check((PROGRAM_STYLES as readonly string[]).includes(config.programStyleByGoal[goal]), `No program style for "${goal}".`);
    check(within(config.volume.goalAdjustment[goal], L.goalAdjustment), `Volume adjustment for "${goal}" out of range.`);
  }

  // Templates and objectives.
  const templateIds = new Set<string>();
  const checkObjective = (where: string, o: TrainingObjective) => {
    check(isObjectiveRole(o.role), `${where} has an unknown role.`);
    check(o.patterns.length > 0 && o.patterns.every(isMovementPattern), `${where} has invalid patterns.`);
    check((o.substituteClasses ?? []).every(isMovementClass), `${where} has invalid substitute classes.`);
    check(Number.isFinite(o.priority), `${where} needs a numeric priority.`);
    check(o.repetition === 'foundational' || o.repetition === 'vary', `${where} has an unknown repetition intent.`);
  };
  for (const template of config.templates) {
    check(!templateIds.has(template.id), `Duplicate template "${template.id}".`);
    templateIds.add(template.id);
    check(isSessionType(template.sessionType), `Template "${template.id}" has an unknown session type.`);
    check(
      template.objectives.some((o) => o.role === 'primary' && o.requirement === 'always'),
      `Template "${template.id}" needs an always-required primary objective.`,
    );
    const ids = new Set<string>();
    for (const o of template.objectives) {
      check(!ids.has(o.id), `Template "${template.id}" repeats objective "${o.id}".`);
      ids.add(o.id);
      checkObjective(`Objective "${template.id}/${o.id}"`, o);
    }
  }
  for (const type of SESSION_TYPES) {
    check(config.templates.some((t) => t.sessionType === type), `No template for session type "${type}".`);
  }
  const finisher = config.conditioningFinisher.objective;
  checkObjective('Conditioning finisher', finisher);
  check(finisher.requirement === 'optional', 'Conditioning finisher must be optional.');

  // Splits.
  const splitsToCheck: [string, WorkoutFrequency, SplitDefinition | undefined][] = [];
  for (const frequency of WORKOUT_FREQUENCIES) {
    splitsToCheck.push([`frequency ${frequency}`, frequency, config.splits.byFrequency[frequency]]);
    for (const goal of PRIMARY_GOALS) {
      const override = config.splits.goalOverrides[goal]?.[frequency];
      if (override) {
        splitsToCheck.push([`${goal} override for ${frequency}`, frequency, override]);
      }
    }
    for (const experience of TRAINING_EXPERIENCE_LEVELS) {
      const override = config.splits.experienceOverrides[experience]?.[frequency];
      if (override) {
        splitsToCheck.push([`${experience} override for ${frequency}`, frequency, override]);
      }
    }
  }
  for (const [label, frequency, split] of splitsToCheck) {
    check(
      !!split && split.sessions.length === frequency && split.sessions.every(isDayType),
      `Split for ${label} must list exactly ${frequency} known day types.`,
    );
    check(!!split && split.sessions.some(isSessionType), `Split for ${label} needs at least one resistance session.`);
  }
  check(['full-body', 'none'].includes(config.splits.infeasibleFallback), 'Unknown infeasible-split fallback.');

  // Volume budget must fit every template's required objectives.
  const minimum = config.volume.minimumExercisesPerSession;
  check(within(minimum, { min: 2, max: L.exercisesPerSession.min }), 'Minimum exercises per session out of range.');
  for (const experience of TRAINING_EXPERIENCE_LEVELS) {
    check(
      within(config.volume.exercisesPerSession[experience], L.exercisesPerSession),
      `Exercises per session for ${experience} out of range.`,
    );
    for (const goal of PRIMARY_GOALS) {
      const budget = config.volume.exercisesPerSession[experience] + config.volume.goalAdjustment[goal];
      check(within(budget, L.exercisesPerSession), `Exercise budget for ${experience}/${goal} out of range.`);
      const style = config.programStyleByGoal[goal];
      for (const template of config.templates) {
        const required = template.objectives.filter((o) => isObjectiveRequired(o, style, experience)).length;
        check(required <= budget, `Template "${template.id}" requires more exercises than the ${experience}/${goal} budget.`);
      }
    }
  }

  // Prescriptions, variation roles and weekly volume targets.
  for (const style of PROGRAM_STYLES) {
    for (const profile of PRESCRIPTION_PROFILES) {
      const p = config.prescriptions[style][profile];
      const where = `Prescription ${style}/${profile}`;
      check(!!p && TRAINING_EXPERIENCE_LEVELS.every((e) => within(p.sets[e], L.sets)), `${where}: sets out of range.`);
      check(
        !!p && within(p.reps.min, L.reps) && within(p.reps.max, L.reps) && p.reps.min <= p.reps.max,
        `${where}: invalid rep range.`,
      );
      check(!!p && within(p.restSeconds, L.restSeconds), `${where}: rest out of range.`);
      check(!!p && within(p.timeSeconds, L.timeSeconds), `${where}: time out of range.`);
      if (style === 'strength' && (profile === 'primary-compound' || profile === 'secondary-compound')) {
        check(!!p && within(p.restSeconds, L.strengthCompoundRestSeconds), `${where}: strength compounds need longer rest.`);
      }
    }
    for (const experience of TRAINING_EXPERIENCE_LEVELS) {
      check(
        config.variation.rolesByStyle[style][experience].every(isObjectiveRole),
        `Variation roles for ${style}/${experience} are invalid.`,
      );
      for (const group of VOLUME_GROUPS) {
        const t = config.weeklyVolume.targets[style][experience][group];
        check(
          !!t && within(t.min, L.weeklySets) && within(t.max, L.weeklySets) && t.min <= t.max,
          `Weekly volume ${style}/${experience}/${group} invalid.`,
        );
      }
    }
  }

  // Weekly volume mechanics.
  const wv = config.weeklyVolume;
  check(within(wv.referenceSessionsPerWeek, L.referenceSessions), 'Reference sessions per week out of range.');
  check(within(wv.minSetsPerExercise, L.sets), 'Minimum sets per exercise out of range.');
  check(
    TRAINING_EXPERIENCE_LEVELS.every(
      (e) => within(wv.maxSetsPerExercise[e], L.sets) && wv.maxSetsPerExercise[e] >= wv.minSetsPerExercise,
    ),
    'Maximum sets per exercise out of range.',
  );
  check(within(wv.maxAdjustments, L.maxAdjustments), 'Maximum set adjustments out of range.');
  check(within(wv.deficitPriorityBonus, { min: 0, max: 100 }), 'Deficit priority bonus out of range.');
  for (const [group, rule] of Object.entries(wv.conditionalMinimums)) {
    check(
      (VOLUME_GROUPS as readonly string[]).includes(group) &&
        !!rule &&
        within(rule.minResistanceSessions, { min: 1, max: 6 }) &&
        rule.excludedStrategies.every((s) => (SPLIT_STRATEGIES as readonly string[]).includes(s)),
      `Conditional minimum for "${group}" is invalid.`,
    );
  }

  // Selection weights.
  const s = config.selection;
  const weights = [
    s.fallbackPatternPenalty,
    s.substituteClassPenalty,
    s.isolationInCompoundObjectivePenalty,
    ...PROGRAM_STYLES.flatMap((style) => Object.values(s.loadabilityBonus[style])),
    s.strengthFreeWeightBonus,
    s.experienceMatchBonus,
    s.beginnerSupportedBonus,
    s.advancedFreeWeightBonus,
    s.generalUnilateralBonus,
    ...Object.values(s.tierBonus),
    s.curatedStyleBonus,
    s.regressionPenalty,
    s.primaryMuscleOverlapPenalty,
    s.excessFatiguePenalty,
    s.weeklyRepeatPenalty,
  ];
  check(weights.every((w) => within(w, L.selectionWeight)), 'Selection weights must be within ±50.');
  const penalties = [
    s.fallbackPatternPenalty,
    s.substituteClassPenalty,
    s.isolationInCompoundObjectivePenalty,
    s.regressionPenalty,
    s.primaryMuscleOverlapPenalty,
    s.excessFatiguePenalty,
    s.weeklyRepeatPenalty,
  ];
  check(penalties.every((w) => w >= 0), 'Penalties must be non-negative.');
  check(
    s.tierBonus.staple >= s.tierBonus.standard && s.tierBonus.standard > s.tierBonus.fallback,
    'Tier bonuses must rank staple ≥ standard > fallback.',
  );

  // Sequencing.
  const order = config.sequencing.order;
  check(
    order.length === SEQUENCE_CATEGORIES.length && order.every(isSequenceCategory) && new Set(order).size === order.length,
    'Sequencing order must list every category exactly once.',
  );
  check(
    order[0] === 'primary-compound' && order[order.length - 1] === 'conditioning',
    'Primary compounds must come first and conditioning last.',
  );

  // Progression and duration.
  const pr = config.progression;
  check(
    PROGRAM_STYLES.every((style) => within(pr.loadIncreasePercent[style], L.loadIncreasePercent)) &&
      within(pr.beginnerMaxLoadIncreasePercent, L.loadIncreasePercent),
    'Load increase percentages out of range.',
  );
  check(within(pr.timeIncrementSeconds, L.timeIncrementSeconds), 'Time increment out of range.');
  check(within(pr.maxTimeSeconds, L.maxTimeSeconds), 'Maximum time out of range.');
  const d = config.duration;
  check(within(d.secondsPerRep, L.secondsPerRep), 'Seconds per rep out of range.');
  check(within(d.setupSecondsPerExercise, L.setupSecondsPerExercise), 'Setup seconds out of range.');
  check(within(d.warmupMinutes, L.warmupMinutes), 'Warm-up minutes out of range.');
  check(within(d.roundToMinutes, L.roundToMinutes), 'Duration rounding out of range.');
  check(
    within(d.targetSessionMinutes.min, L.sessionMinutes) &&
      within(d.targetSessionMinutes.max, L.sessionMinutes) &&
      d.targetSessionMinutes.min <= d.targetSessionMinutes.max,
    'Target session minutes invalid.',
  );

  // Activity days.
  for (const type of ACTIVITY_DAY_TYPES) {
    const day = config.activityDays[type];
    check(
      !!day &&
        within(day.durationMinutes.min, L.activityMinutes) &&
        within(day.durationMinutes.max, L.activityMinutes) &&
        day.durationMinutes.min <= day.durationMinutes.max &&
        day.suggestedActivities.length > 0 &&
        day.suggestedActivities.every(isActivityKind),
      `Activity day "${type}" needs a valid duration range and suggestions.`,
    );
  }

  return problems;
}
