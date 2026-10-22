import { IsoCalendarDate } from '../../domain/fitness-profile';
import { ReminderAction, ReminderKind, REMINDER_KINDS } from '../../domain/reminders';
import { AppNotification, NotificationCategory } from './notifications';

/**
 * Notifications the phone actually showed: reminders this app scheduled whose time came, and pushes from the
 * server. Kept on the device as a short history, so the inbox lists what really arrived (with its time) next to
 * today's to-dos, and a notification tapped in the system shade is the same item, read, in the inbox.
 */
export interface SentNotification {
  /** Stable for one notification: `reminder:<plan key>` or `push:<id>`, so recording twice changes nothing. */
  readonly key: string;
  readonly source: 'reminder' | 'push';
  /** The reminder kind; null for a push. */
  readonly kind: ReminderKind | null;
  readonly title: string;
  readonly body: string;
  /** When it was shown (a push seen only later: when the app learned of it). ISO-8601. */
  readonly at: string;
  readonly action: ReminderAction | null;
}

/** Entries kept: the newest, at most this many, for at most this many days. */
export const LOG_LIMIT = 100;
export const LOG_DAYS = 30;

const STYLE: Readonly<Record<ReminderKind, { category: NotificationCategory; icon: string; tone: AppNotification['tone'] }>> = {
  training: { category: 'workout', icon: 'barbell', tone: 'train' },
  'open-workout': { category: 'workout', icon: 'play', tone: 'train' },
  streak: { category: 'progress', icon: 'flame', tone: 'train' },
  meals: { category: 'nutrition', icon: 'restaurant', tone: 'primary' },
  'weigh-in': { category: 'progress', icon: 'scale-outline', tone: 'body' },
  recovery: { category: 'recovery', icon: 'leaf', tone: 'primary' },
};

/**
 * Which of today's to-dos (by their id prefix) a sent reminder of this kind already covers: the inbox shows the
 * notification that arrived instead of a second item saying the same thing.
 */
export const COVERS: Readonly<Record<ReminderKind, string>> = {
  training: 'planned',
  'open-workout': 'resume',
  streak: 'streak',
  meals: 'food',
  'weigh-in': 'weigh-in',
  recovery: 'recovery',
};

const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

/** The inbox item for a sent notification (its id is `sent:<key>`). `localDate` gives the user's calendar date. */
export function toInboxItem(sent: SentNotification, localDate: (instant: Date) => IsoCalendarDate): AppNotification {
  const style = sent.kind ? STYLE[sent.kind] : { category: 'general' as const, icon: 'notifications', tone: 'primary' as const };
  const at = new Date(sent.at);
  return {
    id: `sent:${sent.key}`,
    category: style.category,
    icon: style.icon,
    tone: style.tone,
    title: sent.title,
    message: sent.body,
    date: localDate(at),
    at: sent.at,
    details: [{ icon: 'time-outline', label: sent.source === 'push' ? 'Received' : 'Sent', value: timeFormat.format(at) }],
    action: sent.action,
  };
}

/** "8:00 AM" */
export const formatTime = (iso: string) => timeFormat.format(new Date(iso));

const isAction = (value: unknown): value is ReminderAction => {
  const a = value as { kind?: unknown; sessionId?: unknown } | null;
  if (!a || typeof a !== 'object') {
    return false;
  }
  switch (a.kind) {
    case 'resume':
    case 'open-session':
      return typeof a.sessionId === 'string' && a.sessionId.length > 0;
    case 'recovery-check-in':
    case 'log-weight':
    case 'log-food':
    case 'streak':
      return true;
    default:
      return false;
  }
};

/** Stored entries, read strictly (anything malformed is dropped). */
export function parseSentNotifications(value: unknown): SentNotification[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((raw): SentNotification[] => {
    const v = raw as Record<string, unknown> | null;
    if (
      !v ||
      typeof v['key'] !== 'string' ||
      (v['source'] !== 'reminder' && v['source'] !== 'push') ||
      typeof v['title'] !== 'string' ||
      typeof v['body'] !== 'string' ||
      typeof v['at'] !== 'string' ||
      Number.isNaN(Date.parse(v['at']))
    ) {
      return [];
    }
    const kind = (REMINDER_KINDS as readonly unknown[]).includes(v['kind']) ? (v['kind'] as ReminderKind) : null;
    return [
      {
        key: v['key'].slice(0, 200),
        source: v['source'],
        kind,
        title: v['title'].slice(0, 200),
        body: v['body'].slice(0, 500),
        at: v['at'],
        action: isAction(v['action']) ? v['action'] : null,
      },
    ];
  });
}

/**
 * The phone names one push differently depending on how the app hears of it (received while open, tapped, or
 * still in the shade), so a push with the same text within this window is the same push.
 */
const SAME_PUSH_MS = 15 * 60_000;

export const samePush = (a: SentNotification, b: SentNotification) =>
  a.source === 'push' &&
  b.source === 'push' &&
  a.title === b.title &&
  a.body === b.body &&
  Math.abs(Date.parse(a.at) - Date.parse(b.at)) < SAME_PUSH_MS;

/** Adds entries (one already there, by key or as the same push, stays as it was), newest first, trimmed to the limits. */
export function mergeSent(existing: readonly SentNotification[], added: readonly SentNotification[], now: Date): SentNotification[] {
  const byKey = new Map(existing.map((e) => [e.key, e]));
  for (const entry of added) {
    if (!byKey.has(entry.key) && ![...byKey.values()].some((e) => samePush(e, entry))) {
      byKey.set(entry.key, entry);
    }
  }
  const oldest = now.getTime() - LOG_DAYS * 86_400_000;
  return [...byKey.values()]
    .filter((e) => Date.parse(e.at) >= oldest)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, LOG_LIMIT);
}
