import { Injectable, inject } from '@angular/core';
import { NavController } from '@ionic/angular';

import { CLOCK } from '../../core/time/clock';
import { PUSH_DEVICE, ReceivedPush } from '../reminders/push-device';
import { REMINDER_DEVICE, ShownNotification } from '../reminders/reminder-device';
import { runNotificationAction } from './notification-actions';
import { NotificationInboxService } from './notification-inbox.service';
import { SentNotification } from './notification-log';
import { NotificationLogService } from './notification-log.service';

/**
 * Connects the phone's notifications to the in-app inbox: what is shown (a reminder whose time came, a push) is
 * recorded in the notification log, so the bell lists it with its time; tapping one in the system shade opens
 * its screen and marks the same inbox item read. Reminders that fired while the app was closed are recorded by
 * ReminderService when it re-plans; pushes still in the shade, by `sync()` on launch and resume.
 */
@Injectable({ providedIn: 'root' })
export class NotificationTrackingService {
  private readonly reminders = inject(REMINDER_DEVICE);
  private readonly push = inject(PUSH_DEVICE);
  private readonly log = inject(NotificationLogService);
  private readonly inbox = inject(NotificationInboxService);
  private readonly nav = inject(NavController);
  private readonly clock = inject(CLOCK);
  private started = false;

  /** Call once at startup. */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.reminders.onShown((shown) => void this.recordShown(shown));
    this.reminders.onTap((tapped) => void this.tapped(this.fromShown(tapped), tapped.action));
    this.push.onReceived((push) => void this.record([this.fromPush(push)]));
    this.push.onTap((push) => void this.tapped(this.fromPush(push), null));
    void this.sync();
  }

  /** Records pushes that arrived while the app was closed (on launch and every return to the app). */
  async sync(): Promise<void> {
    const delivered = await this.push.delivered().catch(() => []);
    await this.record(delivered.map((p) => this.fromPush(p)));
  }

  private async recordShown(shown: ShownNotification): Promise<void> {
    const entry = this.fromShown(shown);
    if (entry) {
      await this.record([entry]);
    }
  }

  private async record(entries: readonly (SentNotification | null)[]): Promise<readonly string[]> {
    const real = entries.filter((e): e is SentNotification => e !== null);
    if (real.length === 0) {
      return [];
    }
    const keys = await this.log.record(real);
    void this.inbox.refresh().catch(() => undefined);
    return keys;
  }

  private async tapped(entry: SentNotification | null, action: ShownNotification['action']): Promise<void> {
    if (action) {
      runNotificationAction(this.nav, action, this.clock());
    }
    if (entry) {
      const [key] = await this.record([entry]);
      await this.inbox.markRead(`sent:${key}`).catch(() => undefined);
    }
  }

  private fromShown(shown: ShownNotification): SentNotification | null {
    if (!shown.key) {
      return null;
    }
    const isPush = shown.key.startsWith('push:');
    return {
      key: shown.key,
      source: isPush ? 'push' : 'reminder',
      kind: isPush ? null : shown.kind,
      title: shown.title,
      body: shown.body,
      // A reminder's own time when it carries one (a tap can come long after it was shown).
      at: shown.at && Date.parse(shown.at) <= this.clock().getTime() ? shown.at : this.clock().toISOString(),
      action: shown.action,
    };
  }

  private fromPush(push: ReceivedPush): SentNotification {
    return { key: `push:${push.id}`, source: 'push', kind: null, title: push.title, body: push.body, at: this.clock().toISOString(), action: null };
  }
}
