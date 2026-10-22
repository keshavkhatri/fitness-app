import { InjectionToken } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

import { PlannedReminder, ReminderAction } from '../../domain/reminders';

export type ReminderPermission = 'granted' | 'denied' | 'prompt';

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
  /** Called with the reminder's action when the user taps it. */
  onTap(handler: (action: ReminderAction) => void): void;
}

const CHANNEL_ID = 'reminders';

const toPermission = (state: string): ReminderPermission => (state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'prompt');

function capacitorDevice(): ReminderDevice {
  let channel: Promise<void> | null = null;
  const ensureChannel = () =>
    (channel ??= LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Reminders',
      description: 'Training days, streaks, weigh-ins and meals',
      importance: 3,
      visibility: 0, // private: the lock screen shows only that there is a notification
    }).catch(() => undefined));
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
          extra: { action: r.action },
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
      void LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
        const action = (event.notification.extra as { action?: ReminderAction } | undefined)?.action;
        if (action && typeof action === 'object' && typeof action.kind === 'string') {
          handler(action);
        }
      });
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
};

export const REMINDER_DEVICE = new InjectionToken<ReminderDevice>('REMINDER_DEVICE', {
  providedIn: 'root',
  factory: () => (Capacitor.isNativePlatform() ? capacitorDevice() : NO_REMINDER_DEVICE),
});
