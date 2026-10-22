import { InjectionToken } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';

import { CHANNEL_ID, ensureNotificationChannel } from './reminder-device';

/** What a push carries besides its text (string fields only; never health values). */
export type PushData = Readonly<Record<string, string>>;

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
  /** Called with the push's data when the user taps it. */
  onTap(handler: (data: PushData) => void): void;
}

/** A push that arrives while the app is open isn't shown by Android: show it as a local notification. */
const FOREGROUND_ID_BASE = 900_000_000;

function capacitorPushDevice(): PushDevice {
  let foreground = 0;
  void ensureNotificationChannel();
  void PushNotifications.addListener('pushNotificationReceived', async (push) => {
    await ensureNotificationChannel();
    void LocalNotifications.schedule({
      notifications: [
        {
          id: FOREGROUND_ID_BASE + (foreground++ % 1000),
          title: push.title ?? 'StokeForm',
          body: push.body ?? '',
          channelId: CHANNEL_ID,
          extra: { push: push.data ?? {} },
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
      void PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => handler((notification.data ?? {}) as PushData));
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
};

export const PUSH_DEVICE = new InjectionToken<PushDevice>('PUSH_DEVICE', {
  providedIn: 'root',
  factory: () => (Capacitor.isNativePlatform() ? capacitorPushDevice() : NO_PUSH_DEVICE),
});
