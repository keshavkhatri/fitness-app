import {
  DEFAULT_STEP_GOAL,
  RecoveryLevel,
  formatSteps,
  recoveryFraction,
  stepsFraction,
} from '../../domain/daily-check-in';
import { HomeWorkoutView } from './home-training';

/**
 * Home's "Your day, in motion" card: three daily goals and their combined
 * share as the ring.
 *
 * - Move: steps the user logged against the daily step goal.
 * - Train: today's planned workout (done, or sets done while in progress).
 *   Days without a planned workout (rest, light activity, no plan) leave
 *   Train out of the ring unless a workout was finished anyway.
 * - Recover: today's self-reported recovery check-in (poor 25% … great 100%).
 *
 * The ring is the mean of the goals that apply today, each 0–100% of its own
 * target, so no units are mixed. Nothing is measured by a device.
 */

export type HomeTileAction =
  | { readonly kind: 'log-steps' }
  | { readonly kind: 'check-in-recovery' }
  | { readonly kind: 'resume'; readonly sessionId: string }
  | { readonly kind: 'open-session'; readonly sessionId: string }
  | { readonly kind: 'workout-tab' }
  | { readonly kind: 'set-up-profile' };

export interface HomeTileView {
  readonly key: 'move' | 'train' | 'recover';
  readonly label: string;
  readonly icon: string;
  /** The emphasised part: "8.2k", "1/1", "Good". */
  readonly value: string;
  /** Plain text after it: "steps", "done"; null when none. */
  readonly unit: string | null;
  /** 0–1 for the tile's bar; null when the goal doesn't apply today. */
  readonly fraction: number | null;
  /** A measured number (bold) or a word (quiet), as in the reference. */
  readonly emphasis: 'number' | 'word';
  readonly accessibleLabel: string;
  readonly action: HomeTileAction;
}

export interface HomeDayView {
  /** Rounded percentage of today's goals, 0–100. */
  readonly percent: number;
  readonly valueText: string;
  readonly status: string;
  readonly tiles: readonly [HomeTileView, HomeTileView, HomeTileView];
}

export interface HomeDayFacts {
  readonly workout: HomeWorkoutView;
  /** A training workout was finished today (history). */
  readonly finishedToday: boolean;
  /** Steps logged today; null when none were logged. */
  readonly steps: number | null;
  readonly recovery: RecoveryLevel | null;
  readonly stepGoal?: number;
}

const RECOVERY_LABELS: Readonly<Record<RecoveryLevel, string>> = { poor: 'Poor', fair: 'Fair', good: 'Good', great: 'Great' };
const NUMBER = new Intl.NumberFormat('en-US');

export const RECOVERY_OPTIONS: readonly { readonly value: RecoveryLevel; readonly label: string }[] = (
  ['poor', 'fair', 'good', 'great'] as const
).map((value) => ({ value, label: RECOVERY_LABELS[value] }));

export function toHomeDay(f: HomeDayFacts): HomeDayView {
  const goal = f.stepGoal ?? DEFAULT_STEP_GOAL;
  const tiles = [moveTile(f.steps, goal), trainTile(f.workout, f.finishedToday), recoverTile(f.recovery)] as const;
  const applicable = tiles.map((t) => t.fraction).filter((x): x is number => x !== null);
  // toFixed first: 0.785 * 100 is 78.49999… in binary floating point.
  const percent = Math.round(Number(((applicable.reduce((sum, x) => sum + x, 0) / applicable.length) * 100).toFixed(6)));
  return { percent, valueText: `${percent}% of today's goals`, status: statusFor(percent), tiles };
}

function moveTile(steps: number | null, goal: number): HomeTileView {
  const value = steps ?? 0;
  return {
    key: 'move',
    label: 'Move',
    icon: 'walk',
    value: formatSteps(value),
    unit: 'steps',
    fraction: stepsFraction(value, goal),
    emphasis: 'number',
    accessibleLabel: `Move: ${NUMBER.format(value)} of ${NUMBER.format(goal)} steps. Log steps.`,
    action: { kind: 'log-steps' },
  };
}

function trainTile(w: HomeWorkoutView, finishedToday: boolean): HomeTileView {
  const base = { key: 'train', label: 'Train', icon: 'barbell', emphasis: 'word' } as const;
  if (w.kind === 'resume') {
    return {
      ...base,
      value: '0/1',
      unit: 'done',
      fraction: w.setsTotal > 0 ? w.setsDone / w.setsTotal : 0,
      accessibleLabel: `Train: ${w.progress}. Resume ${w.title}.`,
      action: { kind: 'resume', sessionId: w.sessionId },
    };
  }
  if (finishedToday) {
    return { ...base, value: '1/1', unit: 'done', fraction: 1, accessibleLabel: 'Train: today’s workout is done. Open your plan.', action: { kind: 'workout-tab' } };
  }
  switch (w.kind) {
    case 'resistance':
      return {
        ...base,
        value: '0/1',
        unit: 'done',
        fraction: 0,
        accessibleLabel: `Train: ${w.title} planned today, not done yet. Open workout.`,
        action: { kind: 'open-session', sessionId: w.sessionId },
      };
    case 'activity':
      return { ...base, value: 'Light day', unit: null, fraction: null, accessibleLabel: `Train: ${w.title} today. Open activity.`, action: { kind: 'open-session', sessionId: w.sessionId } };
    case 'rest':
      return { ...base, value: 'Rest day', unit: null, fraction: null, accessibleLabel: 'Train: rest day. Open your plan.', action: { kind: 'workout-tab' } };
    case 'no-profile':
      return { ...base, value: 'No plan', unit: null, fraction: null, accessibleLabel: 'Train: no plan yet. Set up your profile.', action: { kind: 'set-up-profile' } };
    default:
      return { ...base, value: 'No plan', unit: null, fraction: null, accessibleLabel: 'Train: plan unavailable. Open Workout.', action: { kind: 'workout-tab' } };
  }
}

function recoverTile(level: RecoveryLevel | null): HomeTileView {
  const base = { key: 'recover', label: 'Recover', icon: 'leaf', unit: null, emphasis: 'word', action: { kind: 'check-in-recovery' } } as const;
  if (!level) {
    return { ...base, value: 'Check in', fraction: 0, accessibleLabel: 'Recover: not checked in today. Check in.' };
  }
  const label = RECOVERY_LABELS[level];
  return { ...base, value: label, fraction: recoveryFraction(level), accessibleLabel: `Recover: feeling ${label.toLowerCase()} today. Change check-in.` };
}

function statusFor(percent: number): string {
  if (percent >= 100) {
    return 'Every goal done. Great work!';
  }
  if (percent >= 70) {
    return 'Almost there. Keep it up!';
  }
  if (percent > 0) {
    return 'Stay consistent. You’ve got this!';
  }
  return 'A fresh day. Let’s get moving!';
}
