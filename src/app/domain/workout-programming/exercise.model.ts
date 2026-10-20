import { TrainingExperience } from '../fitness-profile';
import {
  ExerciseCategory,
  ExerciseTier,
  FatigueCost,
  MovementClass,
  MovementPattern,
  MuscleGroup,
  ProgramStyle,
  WorkoutEquipment,
  WorkoutLocation,
} from './workout-taxonomy';

/**
 * An exercise in the catalog. Every field is used by availability filtering,
 * objective matching, scoring, prescription, sequencing or volume balance.
 */
export interface Exercise {
  /** Stable kebab-case id; also the deterministic tie-breaker. */
  readonly id: string;
  /** Canonical English name (catalog data, not localized UI copy). */
  readonly name: string;
  readonly pattern: MovementPattern;
  /** Whether it is a full instance of its pattern or only a scapular/postural substitute. */
  readonly movementClass: MovementClass;
  /** Primary muscles count as direct sets for weekly volume balance. */
  readonly primaryMuscles: readonly MuscleGroup[];
  readonly secondaryMuscles: readonly MuscleGroup[];
  /** ALL of these must be available. Empty = bodyweight. */
  readonly requires: readonly WorkoutEquipment[];
  /** Where it can realistically be performed. */
  readonly locations: readonly WorkoutLocation[];
  /** Experience level it is suited to; never offered above the user's level. */
  readonly difficulty: TrainingExperience;
  readonly mechanics: 'compound' | 'isolation';
  readonly laterality: 'bilateral' | 'unilateral';
  /** Prescribed in reps or in seconds of work. */
  readonly measurement: 'reps' | 'time';
  /** How precisely load can be increased (scoring, prescription profile, progression type). */
  readonly loadability: 'high' | 'moderate' | 'low';
  /** Supported (machine/cable/chest-supported) vs free (balance and setup demands). */
  readonly stability: 'supported' | 'free';
  /** Staple / standard / fallback selection tier. */
  readonly tier: ExerciseTier;
  /** Systemic fatigue cost (stacking high-fatigue lifts in one session is avoided). */
  readonly fatigue: FatigueCost;
  /** Curated staple for these program styles specifically. */
  readonly preferredFor: readonly ProgramStyle[];
  /** Browsing tags for the library (strength, core, mobility, cardio); at least one. Not used by generation. */
  readonly categories: readonly ExerciseCategory[];
}

export type ExerciseLoadability = Exercise['loadability'];

/**
 * An ordered progression chain (easiest → hardest) for exercises progressed
 * by variation rather than load. `entry` is the default starting step; steps
 * before it are regressions.
 */
export interface ProgressionChain {
  readonly id: string;
  readonly steps: readonly string[];
  readonly entry: string;
}
