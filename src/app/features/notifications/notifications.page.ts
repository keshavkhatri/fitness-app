import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonToolbar, NavController } from '@ionic/angular';

import { ThemeService } from '../../core/theme/theme.service';
import { CLOCK, localIsoDate } from '../../core/time/clock';
import { LoadingSkeletonComponent, SegmentOption, SegmentedControlComponent } from '../../shared/ui';
import { notificationPath } from './notification-actions';
import { NotificationInboxService } from './notification-inbox.service';
import { formatTime } from './notification-log';
import { AppNotification, CATEGORY_LABELS, NotificationFilter, filterNotifications, groupByDay, isNotificationFilter } from './notifications';

export { CHECK_IN_QUERY, NOTIFICATIONS_PATH } from './notification-actions';

const FILTER_OPTIONS: readonly SegmentOption<NotificationFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'workout', label: 'Workouts' },
  { value: 'nutrition', label: 'Nutrition' },
];

/** What each filter says when it has nothing to show. */
const EMPTY: Readonly<Record<NotificationFilter | 'none', { readonly title: string; readonly text: string }>> = {
  none: { title: 'No notifications yet', text: "Today's to-dos and the reminders your phone shows appear here." },
  all: { title: 'No notifications yet', text: "Today's to-dos and the reminders your phone shows appear here." },
  unread: { title: 'All caught up!', text: "You've seen all your notifications." },
  workout: { title: 'No workout notifications', text: 'Reminders about planned and in-progress workouts appear here.' },
  nutrition: { title: 'No nutrition notifications', text: 'A reminder appears here on days nothing has been logged yet.' },
};

/**
 * The notification inbox (Home's bell): today's to-dos and the notifications
 * the phone showed, by day (see NotificationInboxService), filtered by All,
 * Unread, Workouts or Nutrition. A reminder is marked read when its detail is opened,
 * or with "Mark all read"; filtering never changes read state.
 *
 * The filter is the `filter` query parameter, so it survives opening a
 * detail and coming back. Dark when it lists everything or the unread ones;
 * the category filters and the empty inbox use the warm light theme.
 */
@Component({
  selector: 'app-notifications',
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <div class="toolbar">
          <button type="button" class="icon-button" aria-label="Back to home" (click)="backHome()">
            <ion-icon name="chevron-back" aria-hidden="true" />
          </button>
          @if (inbox.unreadCount() > 0) {
            <button type="button" class="mark-all" data-testid="mark-all-read" [disabled]="markingAll()" (click)="markAllRead()">
              <ion-icon name="checkmark-done-outline" aria-hidden="true" />
              Mark all read
            </button>
          }
        </div>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <main class="body">
        <h1 class="title">Notifications</h1>
        <fit-segmented-control
          class="filters"
          name="notification-filter"
          legend="Show notifications"
          variant="pills"
          [options]="filterOptions"
          [value]="activeFilter()"
          (valueChange)="setFilter($event)"
        />

        @if (loading()) {
          <div class="loading" aria-busy="true">
            <span class="visually-hidden" role="status">Loading notifications</span>
            <fit-skeleton height="84px" radius="card" />
            <fit-skeleton height="84px" radius="card" />
          </div>
        } @else if (visible().length) {
          @for (group of groups(); track group.date; let first = $first) {
            <section [attr.aria-labelledby]="'notifications-' + group.date">
              <h2 class="group" [id]="'notifications-' + group.date">{{ group.label }}</h2>
              <ul class="list" [attr.data-testid]="first ? 'notification-list' : 'notification-list-' + group.date">
                @for (item of group.items; track item.id) {
                  @let unread = !inbox.isRead(item.id);
                  <li [style.--i]="$index">
                    <button
                      type="button"
                      class="item"
                      [class.unread]="unread"
                      [attr.data-testid]="'notification-' + item.id.split(':')[0]"
                      (click)="open(item)"
                    >
                      <span class="icon" [attr.data-category]="item.category" aria-hidden="true"><ion-icon [name]="item.icon" /></span>
                      <span class="text">
                        <span class="title-row">
                          <span class="item-title">{{ item.title }}</span>
                          @if (unread) {
                            <span class="dot" aria-hidden="true"></span>
                          }
                        </span>&ngsp;
                        <span class="message">{{ item.message }}</span>
                        <span class="visually-hidden">. {{ categoryLabels[item.category] }}, {{ spoken(item, group.label) }}{{ unread ? ', unread' : '' }}.</span>
                      </span>
                      <span class="meta" aria-hidden="true">
                        <span class="time">{{ when(item, group.label) }}</span>
                        <ion-icon name="chevron-forward" />
                      </span>
                    </button>
                  </li>
                }
              </ul>
            </section>
          }
        } @else {
          @let empty = emptyCopy();
          <div class="empty" data-testid="notifications-empty">
            <span class="bell" aria-hidden="true"><ion-icon [name]="activeFilter() === 'unread' && hasAny() ? 'checkmark-done-outline' : 'notifications-outline'" /></span>
            <h2 class="empty-title">{{ empty.title }}</h2>
            <p class="empty-text">{{ empty.text }}</p>
          </div>
        }
      </main>
    </ion-content>
  `,
  styleUrls: ['./notifications.page.scss', './notifications-list.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, LoadingSkeletonComponent, SegmentedControlComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.fit-theme-immersive]': 'dark()',
    '[class.fit-theme-dashboard]': '!dark()',
  },
})
export class NotificationsPage {
  /** Query parameter (`?filter=unread`); anything unknown is All. */
  readonly filter = input<string>();

  protected readonly inbox = inject(NotificationInboxService);
  private readonly nav = inject(NavController);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly theme = inject(ThemeService);
  private readonly clock = inject(CLOCK);

  protected readonly filterOptions = FILTER_OPTIONS;
  protected readonly categoryLabels = CATEGORY_LABELS;
  protected readonly loading = signal(true);
  protected readonly markingAll = signal(false);

  protected readonly activeFilter = computed<NotificationFilter>(() => {
    const value = this.filter();
    return isNotificationFilter(value) ? value : 'all';
  });
  protected readonly hasAny = computed(() => this.inbox.items().length > 0);
  protected readonly visible = computed(() => filterNotifications(this.inbox.items(), this.activeFilter(), (id) => this.inbox.isRead(id)));
  protected readonly groups = computed(() => groupByDay(this.visible(), localIsoDate(this.clock())));
  protected readonly emptyCopy = computed(() => EMPTY[this.hasAny() ? this.activeFilter() : 'none']);
  protected readonly dark = computed(() => this.hasAny() && (this.activeFilter() === 'all' || this.activeFilter() === 'unread'));

  constructor() {
    // Light status-bar text while the dark inbox shows.
    let release: (() => void) | null = null;
    effect(() => {
      if (this.dark() && !release) {
        release = this.theme.holdAlwaysDark();
      } else if (!this.dark() && release) {
        release();
        release = null;
      }
    });
    inject(DestroyRef).onDestroy(() => release?.());
    void this.load();
  }

  private async load(): Promise<void> {
    // Rebuilt from today's data on every visit; ids are stable, so nothing is duplicated.
    await this.inbox.refresh().catch(() => undefined);
    this.loading.set(false);
  }

  protected setFilter(filter: NotificationFilter): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { filter: filter === 'all' ? null : filter },
      replaceUrl: true,
    });
  }

  protected async markAllRead(): Promise<void> {
    this.markingAll.set(true);
    try {
      await this.inbox.markAllRead();
    } catch {
      // Stays unread; the button remains.
    } finally {
      this.markingAll.set(false);
    }
  }

  /** A sent notification's time ("8:00 AM"); a to-do is for the day. */
  protected when(item: AppNotification, day: string): string {
    return item.at ? formatTime(item.at) : day;
  }

  /** "today", "yesterday at 8:00 AM", "Tuesday, Oct 20 at 8:00 AM". */
  protected spoken(item: AppNotification, day: string): string {
    const label = day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : day;
    return item.at ? `${label} at ${formatTime(item.at)}` : label;
  }

  protected open(item: AppNotification): void {
    void this.nav.navigateForward(notificationPath(item.id));
  }

  protected backHome(): void {
    void this.nav.navigateBack('/home');
  }
}
