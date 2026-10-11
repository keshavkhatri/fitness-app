import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, NavController } from '@ionic/angular';

import { CLOCK, localIsoDate } from '../../core/time/clock';
import { EmptyStateComponent, FitnessCardComponent, LoadingSkeletonComponent } from '../../shared/ui';
import { NEW_WEIGHT_PATH } from '../body-weight/weight-history-paths';
import { NEW_FOOD_PATH } from '../nutrition/nutrition-paths';
import { activeWorkoutPath, workoutSessionPath } from '../workout/workout-paths';
import { NotificationInboxService } from './notification-inbox.service';
import { AppNotification } from './notifications';

export const NOTIFICATIONS_PATH = '/home/notifications';
/** Home opens its recovery check-in when navigated to with this query param. */
export const CHECK_IN_QUERY = { checkIn: 'recovery' } as const;

/**
 * The notification inbox (Home's bell). Opening it marks every reminder read;
 * the ones that were new keep a "New" marker while the page is open.
 */
@Component({
  selector: 'app-notifications',
  template: `
    <ion-header class="ion-no-border subpage-header">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/home" text="Home" />
        </ion-buttons>
        <ion-title>Notifications</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="page-body">
        @if (loading()) {
          <div aria-busy="true"><span class="visually-hidden">Loading notifications</span><fit-skeleton height="72px" radius="card" /></div>
        } @else if (inbox.items().length === 0) {
          <fit-empty-state icon="notifications-outline" title="You're all caught up" description="Reminders about today's training, food and check-ins appear here." />
        } @else {
          <fit-card padding="none">
            <ul class="list">
              @for (item of inbox.items(); track item.id) {
                <li>
                  <button type="button" class="item" [attr.data-testid]="'notification-' + item.id.split(':')[0]" (click)="open(item)">
                    <span class="icon" [attr.data-tone]="item.tone" aria-hidden="true"><ion-icon [name]="item.icon" /></span>
                    <span class="text">
                      <span class="title">{{ item.title }}</span>
                      <span class="message">{{ item.message }}</span>
                    </span>
                    @if (wasNew().has(item.id)) {
                      <span class="new">New</span>
                    }
                  </button>
                </li>
              }
            </ul>
          </fit-card>
        }
      </div>
    </ion-content>
  `,
  styleUrl: './notifications.page.scss',
  imports: [IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonIcon, EmptyStateComponent, FitnessCardComponent, LoadingSkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'fit-theme-dashboard' },
})
export class NotificationsPage {
  protected readonly inbox = inject(NotificationInboxService);
  private readonly nav = inject(NavController);
  private readonly clock = inject(CLOCK);

  protected readonly loading = signal(true);
  /** Ids that were unread when the page opened. */
  protected readonly wasNew = signal<ReadonlySet<string>>(new Set());

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const items = await this.inbox.refresh();
    this.wasNew.set(new Set(items.filter((n) => !this.inbox.isRead(n.id)).map((n) => n.id)));
    this.loading.set(false);
    await this.inbox.markAllRead().catch(() => undefined);
  }

  protected open(item: AppNotification): void {
    const a = item.action;
    switch (a.kind) {
      case 'resume':
        void this.nav.navigateForward(activeWorkoutPath(a.sessionId));
        break;
      case 'open-session':
        void this.nav.navigateForward(workoutSessionPath(a.sessionId));
        break;
      case 'recovery-check-in':
        void this.nav.navigateBack('/home', { queryParams: CHECK_IN_QUERY });
        break;
      case 'log-weight':
        void this.nav.navigateForward(NEW_WEIGHT_PATH);
        break;
      case 'log-food':
        void this.nav.navigateForward(NEW_FOOD_PATH, { queryParams: { date: localIsoDate(this.clock()) } });
        break;
    }
  }
}
