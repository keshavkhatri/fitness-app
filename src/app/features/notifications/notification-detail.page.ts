import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { IonContent, IonFooter, IonHeader, IonIcon, IonRouterOutlet, IonToolbar, NavController } from '@ionic/angular';

import { CLOCK, localIsoDate } from '../../core/time/clock';
import { FitnessButtonComponent, LoadingSkeletonComponent } from '../../shared/ui';
import { NOTIFICATIONS_PATH, runNotificationAction } from './notification-actions';
import { NotificationInboxService } from './notification-inbox.service';
import { sessionIdPhoto } from '../workout/workout-photos';
import { formatTime } from './notification-log';
import { ACTION_LABELS, CATEGORY_LABELS, NotificationAction, notificationDayLabel } from './notifications';

/**
 * One notification in full (warm light): its category icon, title, message, the
 * day it is for (and the time, for one the phone showed), the facts it was built
 * from, and the action that opens the screen it is about (a push may have none). Opening it marks it read (stored, so it stays read).
 * A reminder that is no longer current (e.g. yesterday's) says so instead.
 */
@Component({
  selector: 'app-notification-detail',
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <div class="toolbar">
          <button type="button" class="icon-button" aria-label="Back to notifications" (click)="back()">
            <ion-icon name="chevron-back" aria-hidden="true" />
          </button>
        </div>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <main class="body">
        @if (loading()) {
          <div aria-busy="true"><span class="visually-hidden" role="status">Loading notification</span><fit-skeleton height="220px" radius="card" /></div>
        } @else if (notification(); as n) {
          <header class="hero">
            <span class="hero-icon" [attr.data-category]="n.category" aria-hidden="true"><ion-icon [name]="n.icon" /></span>
            <p class="category">{{ categoryLabels[n.category] }}</p>
            <h1 class="title" data-testid="notification-title">{{ n.title }}</h1>
            <p class="when" data-testid="notification-when">{{ dayLabel() }}</p>
          </header>

          @if (photo(); as src) {
            <img class="photo" [src]="src" alt="" decoding="async" data-testid="notification-photo" />
          }

          <p class="message" data-testid="notification-message">{{ n.message }}</p>

          @if (n.details.length) {
            <dl class="details" data-testid="notification-details">
              @for (detail of n.details; track detail.label) {
                <div class="detail">
                  <span class="detail-icon" aria-hidden="true"><ion-icon [name]="detail.icon" /></span>
                  <dt>{{ detail.label }}</dt>&ngsp;
                  <dd>{{ detail.value }}</dd>
                </div>&ngsp;
              }
            </dl>
          }
        } @else {
          <div class="gone" data-testid="notification-gone">
            <span class="bell" aria-hidden="true"><ion-icon name="notifications-outline" /></span>
            <h1 class="title">This notification is no longer available</h1>
            <p class="message">To-dos are for one day, and notifications are kept for 30 days; this one has passed or is already done.</p>
          </div>
        }
      </main>
    </ion-content>
    <ion-footer class="ion-no-border">
      <div class="footer">
        @if (notification()?.action; as action) {
          <button fit-button type="button" size="lg" block data-testid="notification-action" (click)="act(action)">
            {{ actionLabels[action.kind] }}
            <ion-icon class="arrow" name="arrow-forward" aria-hidden="true" />
          </button>
        }
        <button fit-button type="button" size="lg" block [variant]="notification()?.action ? 'ghost' : 'primary'" (click)="back()">
          Back to notifications
        </button>
      </div>
    </ion-footer>
  `,
  styleUrl: './notification-detail.page.scss',
  imports: [IonHeader, IonToolbar, IonContent, IonFooter, IonIcon, FitnessButtonComponent, LoadingSkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'fit-theme-dashboard' },
})
export class NotificationDetailPage implements OnInit {
  /** Route parameter. */
  readonly notificationId = input.required<string>();

  private readonly inbox = inject(NotificationInboxService);
  private readonly nav = inject(NavController);
  private readonly clock = inject(CLOCK);
  private readonly outlet = inject(IonRouterOutlet, { optional: true });

  protected readonly categoryLabels = CATEGORY_LABELS;
  protected readonly actionLabels = ACTION_LABELS;
  protected readonly loading = signal(true);
  protected readonly notification = computed(() => (this.loading() ? null : this.inbox.find(this.notificationId())));
  /** A workout reminder shows its session's photo. */
  protected readonly photo = computed(() => {
    const action = this.notification()?.action;
    return action && 'sessionId' in action ? sessionIdPhoto(action.sessionId) : null;
  });
  protected readonly dayLabel = computed(() => {
    const n = this.notification();
    if (!n) {
      return '';
    }
    const day = notificationDayLabel(n.date, localIsoDate(this.clock()));
    return n.at ? `${day} · ${formatTime(n.at)}` : day;
  });

  ngOnInit(): void {
    // The route input is set by now.
    void this.load();
  }

  private async load(): Promise<void> {
    // Opened directly (e.g. after a reload): build today's inbox first.
    if (this.inbox.items().length === 0) {
      await this.inbox.refresh().catch(() => undefined);
    }
    this.loading.set(false);
    if (this.inbox.find(this.notificationId())) {
      await this.inbox.markRead(this.notificationId()).catch(() => undefined);
    }
  }

  protected act(action: NotificationAction): void {
    runNotificationAction(this.nav, action, this.clock());
  }

  /** Back to the inbox as it was left (same filter); straight to it when opened directly. */
  protected back(): void {
    if (this.outlet?.canGoBack()) {
      void this.nav.back();
    } else {
      void this.nav.navigateBack(NOTIFICATIONS_PATH);
    }
  }
}
