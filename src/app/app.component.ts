import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { IonApp, IonRouterOutlet, NavController } from '@ionic/angular';

import { CLOCK } from './core/time/clock';
import { runNotificationAction } from './features/notifications/notification-actions';
import { REMINDER_DEVICE } from './features/reminders/reminder-device';
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
    const nav = inject(NavController);
    const clock = inject(CLOCK);
    // Reminders are planned from what is recorded now: on launch and every time the app comes back.
    void reminders.load().then(() => reminders.refresh());
    if (Capacitor.isNativePlatform()) {
      void App.addListener('appStateChange', ({ isActive }) => isActive && void reminders.refresh());
    }
    inject(REMINDER_DEVICE).onTap((action) =>
      action.kind === 'streak' ? void nav.navigateForward('/home/streak') : runNotificationAction(nav, action, clock()),
    );
  }
}
