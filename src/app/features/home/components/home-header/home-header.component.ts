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
        @if (name()) {
          <span class="hello">{{ greeting() }},</span>
        }
        @let line = waveLine();
        <span class="name">{{ line.lead }}<span class="keep">{{ line.last }}&nbsp;<span class="wave" aria-hidden="true">👋</span></span></span>
      </h1>
      @if (streak(); as days) {
        <button type="button" class="streak" data-testid="home-streak" [attr.aria-label]="days + ' day streak: see your streak'" (click)="openStreak.emit()">
          <span class="flame" aria-hidden="true">🔥</span>
          <span class="streak-text" aria-hidden="true">
            <span class="streak-value">{{ days }} day</span>
            <span class="streak-label">streak</span>
          </span>
        </button>
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
  /** The streak page (current and best streak, the activity grid). */
  readonly openStreak = output<void>();

  protected readonly brand = APP_BRAND;
  /**
   * The big line (the name, else the greeting) split before its last word: that word and the wave stay together on
   * a narrow phone, so the wave never sits on a line of its own.
   */
  protected readonly waveLine = computed(() => {
    const text = (this.name() || this.greeting()).trim();
    const cut = text.lastIndexOf(' ') + 1;
    return { lead: text.slice(0, cut), last: text.slice(cut) };
  });
  protected readonly bellLabel = computed(() => {
    const n = this.unread();
    return n > 0 ? `Notifications, ${n} unread` : 'Notifications';
  });
}
