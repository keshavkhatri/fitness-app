import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { playEntrancesOnce } from './core/motion/play-once';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

import { HealthStepsService } from './core/health/health-steps.service';
import { SyncService } from './core/sync/sync.service';
import { NotificationTrackingService } from './features/notifications/notification-tracking.service';
import { PushService } from './features/reminders/push.service';
import { ReminderService } from './features/reminders/reminder.service';

@Component({
  selector: 'app-root',
  template: `
    <ion-app>
      <ion-router-outlet />
    </ion-app>
  `,
  imports: [IonApp, IonRouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  constructor() {
    const reminders = inject(ReminderService);
    const tracking = inject(NotificationTrackingService);
    const sync = inject(SyncService);
    const health = inject(HealthStepsService);
    // Steps counted by the phone (Health Connect), if the person turned that on: on launch and every return.
    void health.sync();
    // Reminders are planned from what is recorded now: on launch and every time the app comes back.
    void reminders.load().then(() => reminders.refresh());
    if (Capacitor.isNativePlatform()) {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          void reminders.refresh();
          void tracking.sync();
          // Cloud backup: fetch changes made on another phone, send this phone's.
          void sync.sync();
          void health.sync();
        }
      });
    }
    // Server pushes: this phone is registered while signed in with reminders on.
    inject(PushService).start();
    playEntrancesOnce();
    // Shown and tapped notifications go to the inbox (and a tap opens its screen).
    tracking.start();
  }
}
