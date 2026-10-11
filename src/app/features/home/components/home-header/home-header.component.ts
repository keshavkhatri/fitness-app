import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { APP_BRAND } from '../../../../core/brand';
import { FitnessAvatarComponent } from '../../../../shared/ui';

/**
 * Home's header: the wordmark, the notification bell (a dot while anything
 * is unread), the avatar (opens You), the greeting with the user's name and
 * the active-day streak. Presentational only.
 */
@Component({
  selector: 'app-home-header',
  template: `
    <div class="top">
      <span class="brand">{{ brand }}</span>
      <div class="actions">
        <button type="button" class="bell" data-testid="home-notifications" [attr.aria-label]="bellLabel()" (click)="openNotifications.emit()">
          <ion-icon name="notifications" aria-hidden="true" />
          @if (unread() > 0) {
            <span class="dot" data-testid="home-notifications-dot" aria-hidden="true"></span>
          }
        </button>
        <button type="button" class="avatar" data-testid="home-profile" aria-label="You: profile and settings" (click)="openProfile.emit()">
          <fit-avatar [name]="name()" [photo]="photo()" [size]="44" />
        </button>
      </div>
    </div>

    <div class="greeting-row">
      <h1 class="greeting">
        @if (name(); as n) {
          <span class="hello">{{ greeting() }},</span>
          <span class="name">{{ n }}&nbsp;<span class="wave" aria-hidden="true">👋</span></span>
        } @else {
          <span class="name">{{ greeting() }}&nbsp;<span class="wave" aria-hidden="true">👋</span></span>
        }
      </h1>
      @if (streak(); as days) {
        <p class="streak" data-testid="home-streak">
          <span class="flame" aria-hidden="true">🔥</span>
          <span class="streak-text">
            <span class="streak-value">{{ days }} day</span>
            <span class="streak-label">streak</span>
          </span>
        </p>
      }
    </div>
  `,
  styleUrl: './home-header.component.scss',
  imports: [IonIcon, FitnessAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeHeaderComponent {
  /** "Good morning" (no comma). */
  readonly greeting = input.required<string>();
  readonly name = input<string | null>(null);
  readonly photo = input<string | null>(null);
  /** Consecutive active days; hidden when 0 or unknown. */
  readonly streak = input<number | null>(null);
  readonly unread = input(0);

  readonly openNotifications = output<void>();
  readonly openProfile = output<void>();

  protected readonly brand = APP_BRAND;
  protected readonly bellLabel = computed(() => {
    const n = this.unread();
    return n > 0 ? `Notifications, ${n} unread` : 'Notifications';
  });
}
