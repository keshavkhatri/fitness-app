import { TrainingExperience } from '../fitness-profile';
import { Exercise } from './exercise.model';
import { NumberRange, WorkoutProgrammingConfig } from './workout-config';
import { WeeklyVolumeEntry } from './workout-plan.model';
import {
  ObjectiveRole,
  ProgramStyle,
  SplitStrategy,
  VOLUME_GROUPS,
  VOLUME_GROUP_BY_MUSCLE,
  VolumeGroup,
} from './workout-taxonomy';

/**
 * Weekly volume accounting: direct (primary-muscle) working sets per muscle
 * group. Core and conditioning work is not counted toward muscle volume.
 */

export interface VolumeItem {
  readonly exercise: Exercise;
  readonly role: ObjectiveRole;
  sets: number;
}

export function volumeGroupsOf(exercise: Exercise): VolumeGroup[] {
  const groups = exercise.primaryMuscles
    .map((muscle) => VOLUME_GROUP_BY_MUSCLE[muscle])
    .filter((g): g is VolumeGroup => g !== null);
  return [...new Set(groups)];
}

const counts = (role: ObjectiveRole) => role !== 'core' && role !== 'conditioning';

export function weeklySets(items: readonly VolumeItem[]): Record<VolumeGroup, number> {
  const totals = Object.fromEntries(VOLUME_GROUPS.map((g) => [g, 0])) as Record<VolumeGroup, number>;
  for (const item of items) {
    if (counts(item.role)) {
      for (const group of volumeGroupsOf(item.exercise)) {
        totals[group] += item.sets;
      }
    }
  }
  return totals;
}

/**
 * Targets for this user: minimums scaled down for fewer resistance sessions
 * than the reference, and dropped to 0 where a conditional minimum does not
 * apply to this week (too few sessions or an excluded split).
 */
export function volumeTargets(
  style: ProgramStyle,
  experience: TrainingExperience,
  resistanceSessions: number,
  strategy: SplitStrategy,
  config: WorkoutProgrammingConfig,
): Record<VolumeGroup, NumberRange> {
  const scale = Math.min(1, resistanceSessions / config.weeklyVolume.referenceSessionsPerWeek);
  const base = config.weeklyVolume.targets[style][experience];
  const applies = (group: VolumeGroup) => {
    const rule = config.weeklyVolume.conditionalMinimums[group];
    return !rule || (resistanceSessions >= rule.minResistanceSessions && !rule.excludedStrategies.includes(strategy));
  };
  return Object.fromEntries(
    VOLUME_GROUPS.map((g) => [g, { min: applies(g) ? Math.round(base[g].min * scale) : 0, max: base[g].max }]),
  ) as Record<VolumeGroup, NumberRange>;
}

export function volumeStatus(sets: number, target: NumberRange): WeeklyVolumeEntry['status'] {
  if (sets < target.min) {
    return 'below';
  }
  return sets > target.max ? 'above' : 'within';
}

export interface Adjustment {
  readonly item: VolumeItem;
  readonly delta: 1 | -1;
  readonly group: VolumeGroup;
}

/**
 * Small, deterministic redistribution of sets toward the weekly ranges.
 * Each step fixes the group furthest outside its range by one set:
 *  - below: +1 set on an exercise training it (fewest sets first, earliest
 *    in the week), never above the per-exercise maximum and never pushing
 *    another group over its maximum;
 *  - above: −1 set on a non-primary exercise training it (accessories first,
 *    most sets first, latest in the week), never below the per-exercise
 *    minimum and never pulling another group under its minimum.
 * Stops when everything is within range, nothing can move, or after
 * `maxAdjustments` steps. Items must be passed in week order.
 *
 * `canAdd` lets the caller veto an increase (e.g. it would make the session
 * too long).
 */
export function balanceWeeklyVolume(
  items: readonly VolumeItem[],
  targets: Record<VolumeGroup, NumberRange>,
  experience: TrainingExperience,
  config: WorkoutProgrammingConfig,
  canAdd: (item: VolumeItem) => boolean = () => true,
): Adjustment[] {
  const { minSetsPerExercise, maxSetsPerExercise, maxAdjustments } = config.weeklyVolume;
  const maxSets = maxSetsPerExercise[experience];
  const adjustments: Adjustment[] = [];
  const eligible = items.filter((item) => counts(item.role));

  for (let step = 0; step < maxAdjustments; step++) {
    const totals = weeklySets(items);
    const gap = (g: VolumeGroup) => Math.max(targets[g].min - totals[g], totals[g] - targets[g].max, 0);
    const outside = VOLUME_GROUPS.filter((g) => gap(g) > 0).sort((a, b) => gap(b) - gap(a));
    let changed = false;

    for (const group of outside) {
      const below = totals[group] < targets[group].min;
      const trains = eligible.filter((item) => volumeGroupsOf(item.exercise).includes(group));
      const candidate = below
        ? trains
            .filter((item) => item.sets < maxSets && canAdd(item))
            .filter((item) => volumeGroupsOf(item.exercise).every((g) => g === group || totals[g] + 1 <= targets[g].max))
            .sort((a, b) => a.sets - b.sets)[0]
        : [...trains]
            .reverse() // latest in the week first on ties (sort is stable)
            .filter((item) => item.role !== 'primary' && item.sets > minSetsPerExercise)
            .filter((item) => volumeGroupsOf(item.exercise).every((g) => g === group || totals[g] - 1 >= targets[g].min))
            .sort((a, b) => Number(b.role === 'accessory') - Number(a.role === 'accessory') || b.sets - a.sets)[0];
      if (candidate) {
        candidate.sets += below ? 1 : -1;
        adjustments.push({ item: candidate, delta: below ? 1 : -1, group });
        changed = true;
        break;
      }
    }
    if (!changed) {
      break;
    }
  }
  return adjustments;
}
