import { TRAINING_EXPERIENCE_LEVELS, TrainingExperience } from '../fitness-profile';
import { Exercise, ProgressionChain } from './exercise.model';
import { TrainingObjective } from './session-templates';
import { WorkoutGenerationInput } from './workout-input.model';
import { WorkoutProgrammingConfig } from './workout-config';
import { SelectionReason } from './workout-plan.model';
import { ProgramStyle } from './workout-taxonomy';

/**
 * Exercise selection for training objectives.
 *
 * Hard filters (never traded off): the objective's patterns and accepted
 * movement classes, equipment, location and difficulty. Everything else is
 * a configurable weighted score; equal scores are broken by exercise id.
 */

const experienceRank = (level: TrainingExperience) => TRAINING_EXPERIENCE_LEVELS.indexOf(level);

/** Location and equipment only (used for progression-chain neighbours, whatever their difficulty). */
export function isPerformable(exercise: Exercise, input: WorkoutGenerationInput): boolean {
  return (
    exercise.locations.some((location) => input.locations.includes(location)) &&
    exercise.requires.every((item) => input.equipment.includes(item))
  );
}

/**
 * Hard constraints for selection: performable with the user's setup and not
 * above their experience.
 *
 * Extension point: user exclusions / limitations become additional filters here.
 */
export function isExerciseAvailable(exercise: Exercise, input: WorkoutGenerationInput): boolean {
  return isPerformable(exercise, input) && experienceRank(exercise.difficulty) <= experienceRank(input.experience);
}

export interface ChainLookup {
  readonly chain: ProgressionChain;
  readonly index: number;
  readonly entryIndex: number;
}

export interface SelectionContext {
  readonly input: WorkoutGenerationInput;
  readonly style: ProgramStyle;
  readonly config: WorkoutProgrammingConfig;
  /** Pre-filtered available exercises. */
  readonly pool: readonly Exercise[];
  readonly chains: ReadonlyMap<string, ChainLookup>;
}

/** What has already been chosen, which influences the next choice. */
export interface SelectionState {
  readonly session: readonly Exercise[];
  /** Exercise ids already used anywhere this week. */
  readonly week: ReadonlySet<string>;
  /** Whether this objective prefers an exercise not used yet this week. */
  readonly prefersVariety: boolean;
}

export interface ObjectiveMatch {
  readonly patternIndex: number;
  readonly substitute: boolean;
}

/** Does the exercise satisfy the objective (pattern + movement class)? */
export function matchObjective(exercise: Exercise, objective: TrainingObjective): ObjectiveMatch | null {
  const patternIndex = objective.patterns.indexOf(exercise.pattern);
  if (patternIndex < 0) {
    return null;
  }
  if (exercise.movementClass === 'full') {
    return { patternIndex, substitute: false };
  }
  return objective.substituteClasses?.includes(exercise.movementClass) ? { patternIndex, substitute: true } : null;
}

export interface ScoredExercise {
  readonly exercise: Exercise;
  readonly score: number;
  readonly substitute: boolean;
  readonly reasons: readonly SelectionReason[];
}

export function scoreExercise(
  exercise: Exercise,
  objective: TrainingObjective,
  match: ObjectiveMatch,
  state: SelectionState,
  context: SelectionContext,
): ScoredExercise {
  const w = context.config.selection;
  const { style } = context;
  const experience = context.input.experience;
  const mainObjective = objective.role === 'primary' || objective.role === 'secondary';
  const reasons: SelectionReason[] = [];
  let score = 100;
  const add = (points: number, reason: SelectionReason) => {
    if (points !== 0) {
      score += points;
      reasons.push(reason);
    }
  };

  // 1. Objective fit.
  if (match.patternIndex === 0) {
    reasons.push('preferred-pattern');
  } else {
    add(-w.fallbackPatternPenalty * match.patternIndex, 'fallback-pattern');
  }
  add(match.substitute ? -w.substituteClassPenalty : 0, 'substitute-class');
  if (mainObjective) {
    if (exercise.mechanics === 'compound') {
      reasons.push('compound-for-main-objective');
    } else {
      add(-w.isolationInCompoundObjectivePenalty, 'isolation-in-main-objective');
    }
  }

  // 2. Goal suitability.
  add(w.loadabilityBonus[style][exercise.loadability], 'loadable-for-goal');
  if (style === 'strength' && mainObjective) {
    add(exercise.stability === 'free' ? w.strengthFreeWeightBonus : 0, 'free-weight-for-strength');
  }
  if (style === 'general') {
    add(exercise.laterality === 'unilateral' ? w.generalUnilateralBonus : 0, 'unilateral-for-general-fitness');
  }

  // 3. Experience suitability.
  // Within a progression chain, prefer the step that matches the user's level.
  const chain = context.chains.get(exercise.id);
  add(chain && exercise.difficulty === experience ? w.experienceMatchBonus : 0, 'experience-match');
  if (experience === 'beginner') {
    add(exercise.stability === 'supported' ? w.beginnerSupportedBonus : 0, 'supported-for-beginner');
  }
  if (experience === 'advanced') {
    add(
      exercise.stability === 'free' && exercise.loadability !== 'low' ? w.advancedFreeWeightBonus : 0,
      'free-weight-for-advanced',
    );
  }
  add(chain && chain.index < chain.entryIndex ? -w.regressionPenalty : 0, 'regression-step');

  // 4. Staple / fallback status.
  if (exercise.tier === 'staple') {
    add(w.tierBonus.staple, 'staple-exercise');
  } else if (exercise.tier === 'fallback') {
    add(w.tierBonus.fallback, 'fallback-exercise');
  }
  add(exercise.preferredFor.includes(style) ? w.curatedStyleBonus : 0, 'curated-for-style');

  // 5. Session and weekly balance.
  const overlaps = state.session.filter((other) =>
    other.primaryMuscles.some((muscle) => exercise.primaryMuscles.includes(muscle)),
  ).length;
  add(-w.primaryMuscleOverlapPenalty * overlaps, 'muscle-overlap-penalty');
  const fatigued = exercise.fatigue === 'high' && state.session.some((other) => other.fatigue === 'high');
  add(fatigued ? -w.excessFatiguePenalty : 0, 'excess-fatigue-penalty');
  add(state.prefersVariety && state.week.has(exercise.id) ? -w.weeklyRepeatPenalty : 0, 'weekly-repeat-penalty');

  return { exercise, score, substitute: match.substitute, reasons };
}

/** Candidates for an objective, best first (score desc, then id asc). Excludes exercises already in the session. */
export function rankCandidates(
  objective: TrainingObjective,
  state: SelectionState,
  context: SelectionContext,
): ScoredExercise[] {
  const inSession = new Set(state.session.map((e) => e.id));
  const ranked: ScoredExercise[] = [];
  for (const exercise of context.pool) {
    if (inSession.has(exercise.id)) {
      continue;
    }
    const match = matchObjective(exercise, objective);
    if (match) {
      ranked.push(scoreExercise(exercise, objective, match, state, context));
    }
  }
  return ranked.sort((a, b) => b.score - a.score || (a.exercise.id < b.exercise.id ? -1 : 1));
}

export interface ObjectiveSelection extends ScoredExercise {
  readonly candidateCount: number;
}

/** Best exercise for an objective, or null when nothing compatible is available. */
export function selectForObjective(
  objective: TrainingObjective,
  state: SelectionState,
  context: SelectionContext,
): ObjectiveSelection | null {
  const ranked = rankCandidates(objective, state, context);
  if (ranked.length === 0) {
    return null;
  }
  const best = ranked[0];
  const tied = ranked.length > 1 && ranked[1].score === best.score;
  return {
    ...best,
    reasons: tied ? [...best.reasons, 'tie-broken-by-id'] : best.reasons,
    candidateCount: ranked.length,
  };
}
