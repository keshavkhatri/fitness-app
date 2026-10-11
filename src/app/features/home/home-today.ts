import { DaySummaryView, ProgressView } from '../nutrition/nutrition-view-model';
import { WORKOUT_COPY } from '../workout/workout-content';
import { HomeWorkoutView } from './home-training';
import { HomeWeightView } from './home-weight';

/**
 * Home's "Your day" card: today's training as the ring, plus three compact
 * tiles (Train, Fuel, Body), all from data the app records. There is no
 * device activity data (steps, sleep, recovery) and no combined "day score":
 * the ring only ever measures sets of today's workout, never mixed units.
 */

/** What tapping a tile does; the page maps it to its existing navigation. */
export type HomeTileAction =
  | { readonly kind: 'resume'; readonly sessionId: string }
  | { readonly kind: 'open-session'; readonly sessionId: string }
  | { readonly kind: 'workout-tab' }
  | { readonly kind: 'set-up-profile' }
  | { readonly kind: 'nutrition' }
  | { readonly kind: 'retry-nutrition' }
  | { readonly kind: 'weight-history' }
  | { readonly kind: 'log-weight' }
  | { readonly kind: 'retry-weight' };

export interface HomeTileView {
  readonly key: 'train' | 'fuel' | 'body';
  readonly label: string;
  readonly icon: string;
  /** The tile's number or one-word state: "8/22", "1,420", "78.4", "Rest". */
  readonly value: string;
  /** Unit or target after the value: "sets", "/ 2,000 kcal", "kg". */
  readonly unit: string | null;
  /** A thin bar for values measured against a target; null otherwise. */
  readonly progress: (ProgressView & { readonly tone: 'primary' | 'warning' }) | null;
  /** One short supporting line: "Over target", "−1.2 kg · 30 days". */
  readonly note: string | null;
  /** The whole tile for assistive tech (value and what a tap does). */
  readonly accessibleLabel: string;
  readonly action: HomeTileAction;
}

export type HomeRingView =
  /** Sets of today's workout: done (or all, once a workout was finished today) of planned. */
  | {
      readonly kind: 'progress';
      readonly value: number;
      readonly max: number;
      /** "36%" */
      readonly label: string;
      /** "sets" | "done" */
      readonly caption: string;
      readonly valueText: string;
    }
  /** No set count applies (rest, activity, no plan): an icon and a word, never a fake percentage. */
  | { readonly kind: 'state'; readonly icon: string; readonly label: string };

export interface HomeTodayView {
  readonly ring: HomeRingView;
  /** One short line under the card title. */
  readonly status: string;
  readonly train: HomeTileView;
}

/**
 * @param workout Today's workout (Home's workout view model).
 * @param finishedToday A training workout was finished today (history); null while unknown.
 */
export function toHomeToday(workout: HomeWorkoutView, finishedToday: boolean | null): HomeTodayView {
  if (workout.kind === 'resume') {
    const { setsDone: done, setsTotal: total } = workout;
    return {
      ring: setsRing(done, total, workout.progress),
      status: 'Pick up where you left off.',
      train: trainTile(`${done}/${total}`, 'sets', setsBar(done, total, workout.progress), `${workout.progress}. Resume ${workout.title}.`, {
        kind: 'resume',
        sessionId: workout.sessionId,
      }),
    };
  }
  if (finishedToday) {
    const valueText = 'Workout done today';
    return {
      ring: { kind: 'progress', value: 1, max: 1, label: '100%', caption: 'done', valueText },
      status: 'Workout done. Nice work.',
      train: trainTile('Done', null, { value: 1, max: 1, valueText, tone: 'primary' }, `${valueText}. Open your plan.`, { kind: 'workout-tab' }),
    };
  }
  switch (workout.kind) {
    case 'resistance': {
      const total = workout.setsTotal;
      const open = { kind: 'open-session', sessionId: workout.sessionId } as const;
      if (total === null || total === 0) {
        return {
          ring: { kind: 'state', icon: 'barbell', label: 'Today' },
          status: 'Your workout is ready.',
          train: trainTile('Planned', null, null, `${workout.title} planned today. Open workout.`, open),
        };
      }
      const valueText = WORKOUT_COPY.resume.progress(0, total);
      return {
        ring: setsRing(0, total, valueText),
        status: 'Your workout is ready.',
        train: trainTile(`0/${total}`, 'sets', setsBar(0, total, valueText), `${workout.title}: ${valueText}. Open workout.`, open),
      };
    }
    case 'activity':
      return {
        ring: { kind: 'state', icon: 'walk-outline', label: 'Light' },
        status: 'Light activity today.',
        train: trainTile('Light', null, null, `${workout.title} today. Open activity.`, { kind: 'open-session', sessionId: workout.sessionId }),
      };
    case 'rest':
      return {
        ring: { kind: 'state', icon: 'moon-outline', label: 'Rest' },
        status: 'Rest day. Recover well.',
        train: trainTile('Rest', null, null, 'Rest day today. Open your plan.', { kind: 'workout-tab' }),
      };
    case 'no-profile':
      return {
        ring: { kind: 'state', icon: 'sparkles-outline', label: 'Start' },
        status: 'Set up your profile to get a plan.',
        train: trainTile('No plan', null, null, 'No training plan yet. Set up your profile.', { kind: 'set-up-profile' }),
      };
    default:
      return {
        ring: { kind: 'state', icon: 'barbell', label: 'Plan' },
        status: 'Your plan is unavailable.',
        train: trainTile('—', null, null, 'Training plan unavailable. Open Workout.', { kind: 'workout-tab' }),
      };
  }
}

/** Today's calories against the day's target (Nutrition's own summary; no arithmetic here). */
export function toFuelTile(nutrition: DaySummaryView | 'error'): HomeTileView {
  const base = { key: 'fuel', label: 'Fuel', icon: 'restaurant' } as const;
  if (nutrition === 'error') {
    return {
      ...base,
      value: '—',
      unit: null,
      progress: null,
      note: 'Couldn’t load',
      accessibleLabel: 'Fuel: couldn’t load nutrition. Try again.',
      action: { kind: 'retry-nutrition' },
    };
  }
  const c = nutrition.calories;
  return {
    ...base,
    value: c.eaten,
    unit: c.target ? `/ ${c.target} kcal` : 'kcal',
    progress: c.progress ? { ...c.progress, tone: c.over ? 'warning' : 'primary' } : null,
    note: c.over ? 'Over target' : null,
    // Nutrition's value text already carries the remaining/over amount.
    accessibleLabel: `Fuel: ${c.progress?.valueText ?? c.headline}. Open nutrition.`,
    action: { kind: 'nutrition' },
  };
}

/** The latest recorded weigh-in (never the profile weight); no target, so no bar. */
export function toBodyTile(weight: HomeWeightView): HomeTileView {
  const base = { key: 'body', label: 'Body', icon: 'scale-outline', progress: null } as const;
  switch (weight.kind) {
    case 'ready':
      return {
        ...base,
        value: weight.value,
        unit: weight.unit,
        note: weight.change ?? weight.dateLabel,
        accessibleLabel: weight.accessibleLabel,
        action: { kind: 'weight-history' },
      };
    case 'empty':
      return {
        ...base,
        value: 'Log',
        unit: null,
        note: 'No weigh-ins yet',
        accessibleLabel: 'Body: no weigh-ins yet. Log your weight.',
        action: { kind: 'log-weight' },
      };
    default:
      return {
        ...base,
        value: '—',
        unit: null,
        note: 'Couldn’t load',
        accessibleLabel: 'Body: couldn’t load your weight. Try again.',
        action: { kind: 'retry-weight' },
      };
  }
}

function setsRing(done: number, total: number, valueText: string): HomeRingView {
  const max = Math.max(total, 1);
  return { kind: 'progress', value: done, max, label: `${Math.round((Math.min(done, max) / max) * 100)}%`, caption: 'sets', valueText };
}

function setsBar(done: number, total: number, valueText: string): HomeTileView['progress'] {
  return { value: done, max: Math.max(total, 1), valueText, tone: 'primary' };
}

function trainTile(
  value: string,
  unit: string | null,
  progress: HomeTileView['progress'],
  description: string,
  action: HomeTileAction,
): HomeTileView {
  return { key: 'train', label: 'Train', icon: 'barbell', value, unit, progress, note: null, accessibleLabel: `Train: ${description}`, action };
}
