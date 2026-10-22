import { InjectionToken } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

import { PlannedReminder, REMINDER_KINDS, ReminderAction, ReminderKind } from '../../domain/reminders';

export type ReminderPermission = 'granted' | 'denied' | 'prompt';

/** A notification this app showed (a reminder, or a push shown while the app was open), as the device reports it. */
export interface ShownNotification {
  /** The notification log's key: `reminder:<plan key>` or `push:<id>`; null when unknown (shown by an older version). */
  readonly key: string | null;
  readonly kind: ReminderKind | null;
  readonly title: string;
  readonly body: string;
  readonly action: ReminderAction | null;
  /** When a reminder was scheduled for (ISO-8601); null for a push. */
  readonly at: string | null;
}

/**
 * The device's notification scheduler, behind a small seam: the Android app uses Capacitor Local Notifications;
 * the web build (and tests) have none, so reminders are simply off there.
 */
export interface ReminderDevice {
  readonly available: boolean;
  permission(): Promise<ReminderPermission>;
  requestPermission(): Promise<ReminderPermission>;
  schedule(reminders: readonly PlannedReminder[]): Promise<void>;
  cancel(ids: readonly number[]): Promise<void>;
  /** Called when the user taps one of this app's notifications in the system shade. */
  onTap(handler: (tapped: ShownNotification) => void): void;
  /** Called when one is shown while the app is open. */
  onShown(handler: (shown: ShownNotification) => void): void;
}

/** The app's one Android channel, for local reminders and server pushes alike (AndroidManifest.xml names it too). */
export const CHANNEL_ID = 'reminders';

const toPermission = (state: string): ReminderPermission => (state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'prompt');

let channel: Promise<void> | null = null;
/**
 * Creates the channel once. Android drops any notification posted to a channel that doesn't exist, so every
 * path that shows one (reminders, pushes arriving while the app is open) awaits this first.
 */
export const ensureNotificationChannel = (): Promise<void> =>
  (channel ??= LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: 'Reminders',
    description: 'Training days, streaks, weigh-ins and meals',
    importance: 3,
    visibility: 0, // private: the lock screen shows only that there is a notification
  }).catch(() => {
    channel = null;
  }));

/** What a scheduled notification carries back (its `extra`), read defensively. */
function toShown(notification: { title?: string; body?: string; extra?: unknown }): ShownNotification {
  const extra = (notification.extra ?? {}) as { action?: unknown; key?: unknown; kind?: unknown; at?: unknown };
  const action = extra.action as ReminderAction | undefined;
  return {
    key: typeof extra.key === 'string' ? extra.key : null,
    kind: (REMINDER_KINDS as readonly unknown[]).includes(extra.kind) ? (extra.kind as ReminderKind) : null,
    title: notification.title ?? '',
    body: notification.body ?? '',
    action: action && typeof action === 'object' && typeof action.kind === 'string' ? action : null,
    at: typeof extra.at === 'string' && !Number.isNaN(Date.parse(extra.at)) ? extra.at : null,
  };
}

function capacitorDevice(): ReminderDevice {
  const ensureChannel = ensureNotificationChannel;
  // Created at launch too, so a push that arrives while the app is closed finds it.
  void ensureChannel();
  return {
    available: true,
    permission: async () => toPermission((await LocalNotifications.checkPermissions()).display),
    requestPermission: async () => toPermission((await LocalNotifications.requestPermissions()).display),
    async schedule(reminders) {
      if (reminders.length === 0) {
        return;
      }
      await ensureChannel();
      await LocalNotifications.schedule({
        notifications: reminders.map((r) => ({
          id: r.id,
          title: r.title,
          body: r.body,
          channelId: CHANNEL_ID,
          schedule: { at: r.at, allowWhileIdle: true },
          extra: { action: r.action, key: `reminder:${r.key}`, kind: r.kind, at: r.at.toISOString() },
          autoCancel: true,
        })),
      });
    },
    async cancel(ids) {
      if (ids.length > 0) {
        await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
      }
    },
    onTap(handler) {
      void LocalNotifications.addListener('localNotificationActionPerformed', (event) => handler(toShown(event.notification)));
    },
    onShown(handler) {
      void LocalNotifications.addListener('localNotificationReceived', (notification) => handler(toShown(notification)));
    },
  };
}

/** No scheduler (the web build): reminders can't be turned on. */
export const NO_REMINDER_DEVICE: ReminderDevice = {
  available: false,
  permission: async () => 'denied',
  requestPermission: async () => 'denied',
  schedule: async () => undefined,
  cancel: async () => undefined,
  onTap: () => undefined,
  onShown: () => undefined,
};

export const REMINDER_DEVICE = new InjectionToken<ReminderDevice>('REMINDER_DEVICE', {
  providedIn: 'root',
  factory: () => (Capacitor.isNativePlatform() ? capacitorDevice() : NO_REMINDER_DEVICE),
});
