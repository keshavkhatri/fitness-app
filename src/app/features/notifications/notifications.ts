import { IsoCalendarDate } from '../../domain/fitness-profile';
import { HomeWorkoutView } from '../home/home-training';

/**
 * The in-app notification inbox: short reminders derived from the user's own
 * data each time it's read (nothing is pushed or scheduled; there are no
 * system notifications yet). Each item has an id that is stable for its day,
 * so a reminder read today stays read, and tomorrow's is new.
 */
export interface AppNotification {
  readonly id: string;
  readonly icon: string;
  /** Domain hue of the icon: training, nutrition (primary) or body. */
  readonly tone: 'train' | 'primary' | 'body';
  readonly title: string;
  readonly message: string;
  readonly action: NotificationAction;
}

export type NotificationAction =
  | { readonly kind: 'resume'; readonly sessionId: string }
  | { readonly kind: 'open-session'; readonly sessionId: string }
  | { readonly kind: 'recovery-check-in' }
  | { readonly kind: 'log-weight' }
  | { readonly kind: 'log-food' };

export interface NotificationFacts {
  readonly today: IsoCalendarDate;
  /** Today's workout as Home shows it; null when unknown. */
  readonly workout: HomeWorkoutView | null;
  /** A training workout was finished today. */
  readonly trainedToday: boolean;
  readonly recoveryCheckedIn: boolean;
  /** Food logged today. */
  readonly foodLogged: boolean;
  /** Days since the latest weigh-in; null without any. */
  readonly daysSinceWeighIn: number | null;
}

/** Most relevant first. */
export function buildNotifications(f: NotificationFacts): AppNotification[] {
  const items: AppNotification[] = [];
  const w = f.workout;
  if (w?.kind === 'resume') {
    items.push({
      id: `resume:${w.sessionId}:${f.today}`,
      icon: 'play',
      tone: 'train',
      title: 'Workout in progress',
      message: `${w.title} · ${w.progress}`,
      action: { kind: 'resume', sessionId: w.sessionId },
    });
  } else if (w?.kind === 'resistance' && !f.trainedToday) {
    items.push({
      id: `planned:${w.sessionId}:${f.today}`,
      icon: 'barbell',
      tone: 'train',
      title: `${w.title} is planned today`,
      message: `${w.countLabel} · ${w.durationLabel}`,
      action: { kind: 'open-session', sessionId: w.sessionId },
    });
  }
  if (!f.recoveryCheckedIn) {
    items.push({
      id: `recovery:${f.today}`,
      icon: 'leaf',
      tone: 'primary',
      title: 'How recovered do you feel?',
      message: 'A one-tap check-in for today.',
      action: { kind: 'recovery-check-in' },
    });
  }
  if (!f.foodLogged) {
    items.push({
      id: `food:${f.today}`,
      icon: 'restaurant',
      tone: 'primary',
      title: 'Nothing logged yet today',
      message: 'Log a meal to track calories and protein.',
      action: { kind: 'log-food' },
    });
  }
  if (f.daysSinceWeighIn === null || f.daysSinceWeighIn >= 7) {
    items.push({
      id: `weigh-in:${f.today}`,
      icon: 'scale-outline',
      tone: 'body',
      title: 'Time to weigh in',
      message: f.daysSinceWeighIn === null ? 'Record your first weigh-in.' : `Your last weigh-in was ${f.daysSinceWeighIn} days ago.`,
      action: { kind: 'log-weight' },
    });
  }
  return items;
}
