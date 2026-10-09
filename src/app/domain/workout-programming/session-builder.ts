import { Exercise } from './exercise.model';
import { estimateSessionMinutes } from './duration';
import { WorkoutResult, fail, ok } from './errors';
import { ObjectiveSelection, SelectionContext, selectForObjective } from './exercise-selection';
import { prescribe, progressionFor } from './prescription';
import { sequenceCategoryFor } from './sequencing';
import { SessionTemplate, TrainingObjective, isObjectiveRequired } from './session-templates';
import {
  ObjectiveCoverage,
  PlanWarning,
  PlannedExercise,
  VolumeAdjustment,
  WeeklyRepetition,
  WorkoutSession,
} from './workout-plan.model';
import { VolumeItem, balanceWeeklyVolume, volumeGroupsOf, volumeTargets, weeklySets } from './weekly-volume';
import { NumberRange } from './workout-config';
import { SessionType, SplitStrategy, VOLUME_GROUPS, VolumeGroup } from './workout-taxonomy';

const SESSION_LABELS: Readonly<Record<SessionType, string>> = {
  'full-body': 'Full Body',
  upper: 'Upper',
  lower: 'Lower',
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
};

export interface SessionRequest {
  readonly id: string;
  readonly dayIndex: number;
  readonly sessionType: SessionType;
  readonly variant: string | null;
  readonly template: SessionTemplate;
}

export interface ResistanceWeekRequest {
  readonly sessions: readonly SessionRequest[];
  readonly includeFinisher: boolean;
  readonly exerciseBudget: number;
  /** The week's split (some weekly minimums depend on it). */
  readonly strategy: SplitStrategy;
}

export interface BuiltResistanceWeek {
  readonly sessions: readonly WorkoutSession[];
  readonly warnings: readonly PlanWarning[];
  readonly volume: Readonly<Record<VolumeGroup, number>>;
  readonly targets: Readonly<Record<VolumeGroup, NumberRange>>;
}

interface ObjectivePick {
  readonly objective: TrainingObjective;
  readonly required: boolean;
  readonly selection: ObjectiveSelection;
  readonly volume: VolumeItem;
}

interface DraftSession {
  readonly request: SessionRequest;
  readonly objectives: readonly { readonly objective: TrainingObjective; readonly required: boolean }[];
  readonly picks: ObjectivePick[];
  readonly unfilled: Set<string>;
}

/**
 * Builds every resistance session of a week from training objectives:
 *
 *  1. Required objectives, every session. They cannot be displaced by any
 *     other objective. A required objective with no compatible exercise makes
 *     the week impossible (the caller may fall back to another split).
 *  2. Optional objectives fill the remaining budget, highest priority first,
 *     boosted when the candidate trains a muscle group still below its
 *     weekly range.
 *  3. Default prescriptions from profiles, then small set redistribution
 *     toward the weekly volume ranges (never making a session too long),
 *     then set adjustments for sessions that would be unrealistically short
 *     or long.
 *  4. Explicit sequencing, weekly repetition metadata, coverage report and
 *     duration estimate.
 */
export function buildResistanceWeek(
  request: ResistanceWeekRequest,
  context: SelectionContext,
  catalog: ReadonlyMap<string, Exercise>,
): WorkoutResult<BuiltResistanceWeek> {
  const { config, style, input } = context;
  const week = new Set<string>();
  const variationRoles = config.variation.rolesByStyle[style][input.experience];
  const prefersVariety = (objective: TrainingObjective) =>
    objective.repetition === 'vary' || variationRoles.includes(objective.role);

  const drafts: DraftSession[] = request.sessions.map((session) => {
    const objectives = [...session.template.objectives];
    if (request.includeFinisher) {
      objectives.push(config.conditioningFinisher.objective);
    }
    return {
      request: session,
      objectives: objectives.map((objective) => ({
        objective,
        required: isObjectiveRequired(objective, style, input.experience),
      })),
      picks: [],
      unfilled: new Set<string>(),
    };
  });

  const choose = (draft: DraftSession, objective: TrainingObjective) =>
    selectForObjective(
      objective,
      { session: draft.picks.map((p) => p.selection.exercise), week, prefersVariety: prefersVariety(objective) },
      context,
    );
  const accept = (draft: DraftSession, objective: TrainingObjective, required: boolean, selection: ObjectiveSelection) => {
    const defaults = prescribe(selection.exercise, objective.role, style, input.experience, config);
    draft.picks.push({
      objective,
      required,
      selection,
      volume: { exercise: selection.exercise, role: objective.role, sets: defaults.sets },
    });
    week.add(selection.exercise.id);
  };
  const byPriority = (a: { objective: TrainingObjective }, b: { objective: TrainingObjective }) =>
    b.objective.priority - a.objective.priority;

  // 1. Required objectives, across the whole week in priority order, so main
  //    lifts claim their exercise before secondary "vary" objectives choose.
  const required = drafts
    .flatMap((draft, day) => draft.objectives.filter((o) => o.required).map((o, index) => ({ draft, day, index, ...o })))
    .sort((a, b) => byPriority(a, b) || a.day - b.day || a.index - b.index);
  for (const { draft, objective } of required) {
    const selection = choose(draft, objective);
    if (!selection) {
      return fail(
        'impossible-session-requirements',
        `No compatible exercise for required objective "${objective.id}" of "${draft.request.template.id}".`,
        {
          sessionId: draft.request.id,
          templateId: draft.request.template.id,
          objectiveId: objective.id,
          reason: 'no-compatible-exercise',
        },
      );
    }
    accept(draft, objective, true, selection);
  }

  const items = () => drafts.flatMap((d) => d.picks.map((p) => p.volume));
  const targets = volumeTargets(style, input.experience, drafts.length, request.strategy, config);

  // 2. Optional objectives, guided by weekly volume deficits.
  for (const draft of drafts) {
    const optional = draft.objectives.filter((o) => !o.required);
    while (draft.picks.length < request.exerciseBudget) {
      const totals = weeklySets(items());
      let best: { objective: TrainingObjective; selection: ObjectiveSelection; effective: number; deficit: boolean } | null =
        null;
      for (const { objective } of optional) {
        if (draft.picks.some((p) => p.objective.id === objective.id) || draft.unfilled.has(objective.id)) {
          continue;
        }
        const selection = choose(draft, objective);
        if (!selection) {
          draft.unfilled.add(objective.id);
          continue;
        }
        const deficit = volumeGroupsOf(selection.exercise).some((g) => totals[g] < targets[g].min);
        const effective = objective.priority + (deficit ? config.weeklyVolume.deficitPriorityBonus : 0);
        if (!best || effective > best.effective) {
          best = { objective, selection, effective, deficit };
        }
      }
      if (!best) {
        break;
      }
      const selection: ObjectiveSelection = best.deficit
        ? { ...best.selection, reasons: [...best.selection.reasons, 'weekly-volume-deficit'] }
        : best.selection;
      accept(draft, best.objective, false, selection);
    }
  }

  // 3. Weekly volume redistribution, within realistic session lengths.
  const defaults = new Map(items().map((item) => [item, item.sets]));
  const sessionOf = new Map(drafts.flatMap((d) => d.picks.map((p) => [p.volume, d] as const)));
  const minutesOf = (draft: DraftSession, extra?: VolumeItem) =>
    estimateSessionMinutes(
      draft.picks.map((p) => ({
        ...prescribe(p.selection.exercise, p.objective.role, style, input.experience, config),
        sets: p.volume.sets + (p.volume === extra ? 1 : 0),
      })),
      config,
    );
  const { min: minMinutes, max: maxMinutes } = config.duration.targetSessionMinutes;
  const fitsSession = (item: VolumeItem) => {
    const draft = sessionOf.get(item);
    return !!draft && minutesOf(draft, item) <= maxMinutes;
  };
  const adjustments = balanceWeeklyVolume(items(), targets, input.experience, config, fitsSession);

  // 4. Sessions estimated below the realistic minimum get one more set at a
  //    time on existing exercises (resistance work before core, fewest sets
  //    first, then session order), never above the per-exercise maximum, a
  //    weekly muscle-group maximum or the session maximum. Conditioning is
  //    not padded.
  const lengthened = new Set<VolumeItem>();
  const maxSets = config.weeklyVolume.maxSetsPerExercise[input.experience];
  for (const draft of drafts) {
    while (minutesOf(draft) < minMinutes) {
      const totals = weeklySets(items());
      const item = draft.picks
        .map((p) => p.volume)
        .filter((v) => v.role !== 'conditioning' && v.sets < maxSets && fitsSession(v))
        .filter((v) => volumeGroupsOf(v.exercise).every((g) => v.role === 'core' || totals[g] + 1 <= targets[g].max))
        .reduce<VolumeItem | null>((best, v) => {
          if (!best) {
            return v;
          }
          const order = Number(v.role === 'core') - Number(best.role === 'core') || v.sets - best.sets;
          return order < 0 ? v : best;
        }, null);
      if (!item) {
        break;
      }
      item.sets += 1;
      lengthened.add(item);
    }
  }

  // 5. Sessions estimated above the realistic maximum lose one set at a time
  //    from non-primary work: accessories, core and conditioning before
  //    secondary lifts, most sets first, preferring cuts that keep every muscle
  //    group at its weekly minimum. Never below the per-exercise minimum.
  const shortened = new Set<VolumeItem>();
  const trimRank = (v: VolumeItem) => (v.role === 'secondary' ? 1 : 0);
  for (const draft of drafts) {
    while (minutesOf(draft) > maxMinutes) {
      const totals = weeklySets(items());
      const keepsMinimum = (v: VolumeItem) =>
        v.role === 'core' || volumeGroupsOf(v.exercise).every((g) => totals[g] - 1 >= targets[g].min);
      const item = draft.picks
        .map((p) => p.volume)
        .filter((v) => v.role !== 'primary' && v.sets > config.weeklyVolume.minSetsPerExercise)
        .reduce<VolumeItem | null>((best, v) => {
          if (!best) {
            return v;
          }
          const order =
            Number(keepsMinimum(best)) - Number(keepsMinimum(v)) || trimRank(v) - trimRank(best) || best.sets - v.sets;
          return order > 0 ? v : best;
        }, null);
      if (!item) {
        break;
      }
      item.sets -= 1;
      shortened.add(item);
    }
  }

  const adjustmentFor = (item: VolumeItem): VolumeAdjustment | null => {
    const mine = adjustments.filter((a) => a.item === item);
    const delta = item.sets - (defaults.get(item) ?? item.sets);
    if (delta === 0) {
      return null;
    }
    const reason: VolumeAdjustment['reason'] = shortened.has(item)
      ? 'session-duration-above-target'
      : lengthened.has(item)
        ? 'session-duration-below-target'
        : delta < 0
          ? 'weekly-volume-above-target'
          : 'weekly-volume-below-target';
    return { setsDelta: delta, groups: [...new Set(mine.map((a) => a.group))], reason };
  };

  // 6. Assemble sessions.
  const usage = new Map<string, number>();
  for (const id of drafts.flatMap((d) => d.picks.map((p) => p.selection.exercise.id))) {
    usage.set(id, (usage.get(id) ?? 0) + 1);
  }
  const repetitionFor = (pick: ObjectivePick): WeeklyRepetition => {
    if ((usage.get(pick.selection.exercise.id) ?? 0) < 2) {
      return 'single';
    }
    return prefersVariety(pick.objective) ? 'repeated' : 'foundational';
  };
  const order = config.sequencing.order;

  const warnings: PlanWarning[] = [];
  const sessions: WorkoutSession[] = drafts.map((draft) => {
    const objectiveIndex = new Map(draft.objectives.map((o, i) => [o.objective.id, i]));
    const ordered = draft.picks
      .map((pick) => ({ pick, category: sequenceCategoryFor(pick.selection.exercise, pick.objective.role) }))
      .sort(
        (a, b) =>
          order.indexOf(a.category) - order.indexOf(b.category) ||
          (objectiveIndex.get(a.pick.objective.id) ?? 0) - (objectiveIndex.get(b.pick.objective.id) ?? 0),
      );

    const exercises: PlannedExercise[] = ordered.map(({ pick, category }, index) => {
      const rx = prescribe(pick.selection.exercise, pick.objective.role, style, input.experience, config);
      return {
        exerciseId: pick.selection.exercise.id,
        order: index + 1,
        sets: pick.volume.sets,
        target: rx.target,
        restSeconds: rx.restSeconds,
        notes: rx.notes,
        prescriptionProfile: rx.profile,
        sequenceCategory: category,
        progression: progressionFor(pick.selection.exercise, rx.target, context, catalog),
        selection: {
          objectiveId: pick.objective.id,
          role: pick.objective.role,
          matchedPattern: pick.selection.exercise.pattern,
          movementClass: pick.selection.exercise.movementClass,
          substitute: pick.selection.substitute,
          score: pick.selection.score,
          candidateCount: pick.selection.candidateCount,
          reasons: pick.selection.reasons,
        },
        volumeAdjustment: adjustmentFor(pick.volume),
        weeklyRepetition: repetitionFor(pick),
      };
    });

    const coverage: ObjectiveCoverage[] = draft.objectives.map(({ objective, required }) => {
      const pick = draft.picks.find((p) => p.objective.id === objective.id);
      if (pick) {
        if (pick.selection.substitute) {
          warnings.push({
            code: 'objective-substituted',
            sessionId: draft.request.id,
            objectiveId: objective.id,
            exerciseId: pick.selection.exercise.id,
            substituteClass: pick.selection.exercise.movementClass,
          });
        }
        return {
          objectiveId: objective.id,
          role: objective.role,
          required,
          status: pick.selection.substitute ? 'substituted' : 'filled',
          exerciseId: pick.selection.exercise.id,
          reason: pick.selection.substitute ? 'no-full-movement-available' : null,
        };
      }
      if (draft.unfilled.has(objective.id) || !choose(draft, objective)) {
        warnings.push({ code: 'objective-unfilled', sessionId: draft.request.id, objectiveId: objective.id, role: objective.role });
        return {
          objectiveId: objective.id,
          role: objective.role,
          required,
          status: 'unfilled',
          exerciseId: null,
          reason: 'no-compatible-exercise',
        };
      }
      return {
        objectiveId: objective.id,
        role: objective.role,
        required,
        status: 'not-selected',
        exerciseId: null,
        reason: 'session-budget-reached',
      };
    });

    return {
      kind: 'resistance',
      id: draft.request.id,
      name: draft.request.variant
        ? `${SESSION_LABELS[draft.request.sessionType]} ${draft.request.variant}`
        : SESSION_LABELS[draft.request.sessionType],
      dayIndex: draft.request.dayIndex,
      sessionType: draft.request.sessionType,
      variant: draft.request.variant,
      templateId: draft.request.template.id,
      estimatedDurationMinutes: estimateSessionMinutes(exercises, config),
      exercises,
      objectives: coverage,
    };
  });

  for (const session of sessions) {
    if (session.exercises.length < config.volume.minimumExercisesPerSession) {
      return fail(
        'impossible-session-requirements',
        `Only ${session.exercises.length} exercises available for "${session.templateId}"; at least ${config.volume.minimumExercisesPerSession} are required.`,
        { sessionId: session.id, templateId: session.templateId, available: session.exercises.length },
      );
    }
  }

  const volume = weeklySets(items());
  for (const group of VOLUME_GROUPS) {
    const target = targets[group];
    if (volume[group] < target.min || volume[group] > target.max) {
      warnings.push({ code: 'weekly-volume-outside-target', group, sets: volume[group], target });
    }
  }

  return ok({ sessions, warnings, volume, targets });
}
