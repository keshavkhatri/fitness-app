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
  readonly category: NotificationCategory;
  readonly icon: string;
  /** Domain hue of the icon: training, nutrition (primary) or body. */
  readonly tone: 'train' | 'primary' | 'body';
  readonly title: string;
  readonly message: string;
  /** The day the reminder is for (reminders are built per day; there is no delivery time). */
  readonly date: IsoCalendarDate;
  /** Facts shown on the detail screen, from the same data the reminder was built from. */
  readonly details: readonly NotificationDetail[];
  readonly action: NotificationAction;
}

/** What a reminder is about; drives the inbox filters and icons. */
export type NotificationCategory = 'workout' | 'nutrition' | 'recovery' | 'progress';

export interface NotificationDetail {
  readonly icon: string;
  readonly label: string;
  readonly value: string;
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
      category: 'workout',
      icon: 'play',
      tone: 'train',
      title: 'Workout in progress',
      message: `${w.title} · ${w.progress}`,
      date: f.today,
      details: [
        { icon: 'barbell-outline', label: 'Workout', value: w.title },
        { icon: 'layers-outline', label: 'Progress', value: w.progress },
      ],
      action: { kind: 'resume', sessionId: w.sessionId },
    });
  } else if (w?.kind === 'resistance' && !f.trainedToday) {
    items.push({
      id: `planned:${w.sessionId}:${f.today}`,
      category: 'workout',
      icon: 'barbell',
      tone: 'train',
      title: `${w.title} is planned today`,
      message: `${w.countLabel} · ${w.durationLabel}`,
      date: f.today,
      details: [
        { icon: 'calendar-outline', label: 'Workout', value: w.title },
        ...(w.focusAreas.length ? [{ icon: 'body-outline', label: 'Focus areas', value: w.focusAreas.join(', ') }] : []),
        { icon: 'list-outline', label: 'Exercises', value: w.countLabel },
        { icon: 'time-outline', label: 'Estimated time', value: w.durationLabel },
      ],
      action: { kind: 'open-session', sessionId: w.sessionId },
    });
  }
  if (!f.recoveryCheckedIn) {
    items.push({
      id: `recovery:${f.today}`,
      category: 'recovery',
      icon: 'leaf',
      tone: 'primary',
      title: 'How recovered do you feel?',
      message: 'A one-tap check-in for today.',
      date: f.today,
      details: [],
      action: { kind: 'recovery-check-in' },
    });
  }
  if (!f.foodLogged) {
    items.push({
      id: `food:${f.today}`,
      category: 'nutrition',
      icon: 'restaurant',
      tone: 'primary',
      title: 'Nothing logged yet today',
      message: 'Log a meal to track calories and protein.',
      date: f.today,
      details: [],
      action: { kind: 'log-food' },
    });
  }
  if (f.daysSinceWeighIn === null || f.daysSinceWeighIn >= 7) {
    items.push({
      id: `weigh-in:${f.today}`,
      category: 'progress',
      icon: 'scale-outline',
      tone: 'body',
      title: 'Time to weigh in',
      message: f.daysSinceWeighIn === null ? 'Record your first weigh-in.' : `Your last weigh-in was ${f.daysSinceWeighIn} days ago.`,
      date: f.today,
      details:
        f.daysSinceWeighIn === null
          ? []
          : [{ icon: 'calendar-outline', label: 'Last weigh-in', value: `${f.daysSinceWeighIn} days ago` }],
      action: { kind: 'log-weight' },
    });
  }
  return items;
}

/** The primary action's label on the detail screen. */
export const ACTION_LABELS: Readonly<Record<NotificationAction['kind'], string>> = {
  resume: 'Resume workout',
  'open-session': 'View workout',
  'recovery-check-in': 'Check in now',
  'log-weight': 'Log weight',
  'log-food': 'Log food',
};

export const CATEGORY_LABELS: Readonly<Record<NotificationCategory, string>> = {
  workout: 'Workout',
  nutrition: 'Nutrition',
  recovery: 'Recovery',
  progress: 'Progress',
};

/** The inbox filters (as in the design: All, Unread, Workouts, Nutrition). */
export const NOTIFICATION_FILTERS = ['all', 'unread', 'workout', 'nutrition'] as const;
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number];
export const isNotificationFilter = (value: unknown): value is NotificationFilter =>
  (NOTIFICATION_FILTERS as readonly unknown[]).includes(value);

/** The items a filter shows, in their order. Filtering never changes read state. */
export function filterNotifications(
  items: readonly AppNotification[],
  filter: NotificationFilter,
  isRead: (id: string) => boolean,
): AppNotification[] {
  switch (filter) {
    case 'all':
      return [...items];
    case 'unread':
      return items.filter((n) => !isRead(n.id));
    default:
      return items.filter((n) => n.category === filter);
  }
}

const dayFormat = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

/** "Today · Thursday, October 8" (reminders are for a day, not a time). */
export function notificationDayLabel(date: IsoCalendarDate, today: IsoCalendarDate): string {
  const day = dayFormat.format(new Date(`${date}T00:00:00Z`));
  return date === today ? `Today · ${day}` : day;
}
