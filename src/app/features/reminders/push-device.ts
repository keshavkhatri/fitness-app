import { InjectionToken } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';

import { CHANNEL_ID, ensureNotificationChannel } from './reminder-device';

/** What a push carries besides its text (string fields only; never health values). */
export type PushData = Readonly<Record<string, string>>;

/** A push as the phone reports it. */
export interface ReceivedPush {
  /** Firebase's id for it (or the shade notification's tag); used only to tell pushes apart. */
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly data: PushData;
}

/**
 * Firebase Cloud Messaging on the phone, behind a small seam: the Android app registers with Firebase
 * and receives the device token; the web build (and tests) have no push.
 */
export interface PushDevice {
  readonly available: boolean;
  readonly platform: 'android' | 'ios' | null;
  /** Registers with Firebase; the token arrives through `onToken` (again whenever Firebase rotates it). */
  register(): Promise<void>;
  /** Stops receiving pushes on this install (the token stops working). */
  unregister(): Promise<void>;
  onToken(handler: (token: string) => void): void;
  /** Called when the user taps a push that arrived while the app was closed. */
  onTap(handler: (push: ReceivedPush) => void): void;
  /** Called when a push arrives while the app is open (it is shown as a local notification then). */
  onReceived(handler: (push: ReceivedPush) => void): void;
  /** Pushes that arrived while the app was closed and are still in the shade. */
  delivered(): Promise<readonly ReceivedPush[]>;
}

/** A push that arrives while the app is open isn't shown by Android: show it as a local notification. */
const FOREGROUND_ID_BASE = 900_000_000;
/** Firebase's own shade notifications (the ones it posts while the app is closed) carry this tag. */
const FCM_TAG = 'FCM-Notification';

const toReceived = (push: { id?: string; tag?: string; title?: string; body?: string; data?: unknown }): ReceivedPush => ({
  id: push.id || push.tag || `${push.title ?? ''}|${push.body ?? ''}`,
  title: push.title ?? 'StokeForm',
  body: push.body ?? '',
  data: Object.fromEntries(Object.entries((push.data ?? {}) as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as PushData,
});

function capacitorPushDevice(): PushDevice {
  let foreground = 0;
  const received: ((push: ReceivedPush) => void)[] = [];
  void ensureNotificationChannel();
  void PushNotifications.addListener('pushNotificationReceived', async (raw) => {
    const push = toReceived(raw);
    received.forEach((handler) => handler(push));
    await ensureNotificationChannel();
    void LocalNotifications.schedule({
      notifications: [
        {
          id: FOREGROUND_ID_BASE + (foreground++ % 1000),
          title: push.title,
          body: push.body,
          channelId: CHANNEL_ID,
          extra: { push: push.data, key: `push:${push.id}` },
        },
      ],
    }).catch(() => undefined);
  });
  return {
    available: true,
    platform: Capacitor.getPlatform() === 'ios' ? 'ios' : 'android',
    register: () => PushNotifications.register(),
    unregister: () => PushNotifications.unregister(),
    onToken(handler) {
      void PushNotifications.addListener('registration', ({ value }) => handler(value));
    },
    onTap(handler) {
      void PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => handler(toReceived(notification)));
    },
    onReceived(handler) {
      received.push(handler);
    },
    async delivered() {
      const { notifications } = await PushNotifications.getDeliveredNotifications();
      // Only Firebase's own (this app's local reminders are in the shade too).
      return notifications.filter((n) => (n.tag ?? '').startsWith(FCM_TAG)).map(toReceived);
    },
  };
}

/** No push (the web build). */
export const NO_PUSH_DEVICE: PushDevice = {
  available: false,
  platform: null,
  register: async () => undefined,
  unregister: async () => undefined,
  onToken: () => undefined,
  onTap: () => undefined,
  onReceived: () => undefined,
  delivered: async () => [],
};

export const PUSH_DEVICE = new InjectionToken<PushDevice>('PUSH_DEVICE', {
  providedIn: 'root',
  factory: () => (Capacitor.isNativePlatform() ? capacitorPushDevice() : NO_PUSH_DEVICE),
});
