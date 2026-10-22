import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, linkedSignal, signal } from '@angular/core';
import { IonBackButton, IonContent, IonIcon, NavController } from '@ionic/angular';

import { PrivateTestingService } from '../../core/entitlements/private-testing/private-testing.service';
import { FitnessProfileService } from '../../core/profile/fitness-profile.service';
import { OFFER_PATH } from '../../core/profile/onboarding.guards';
import { UnitPreferenceService } from '../../core/profile/unit-preference.service';
import { ThemePreference, ThemeService } from '../../core/theme/theme.service';
import { UnitSystem } from '../../domain/fitness-profile';
import { FitnessChipComponent, SegmentOption, SegmentedControlComponent } from '../../shared/ui';
import { PromoCodeSheetComponent } from '../offer/components/promo-code-sheet.component';
import { RestoreSheetComponent } from '../offer/components/restore-sheet.component';
import { UNIT_SYSTEM_OPTIONS } from '../onboarding/onboarding-content';
import { AccountCardComponent } from './account-card.component';
import { PlanStatusComponent } from './plan-status.component';

const THEME_OPTIONS: readonly SegmentOption<ThemePreference>[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Settings that exist in the product plan but are not built yet. */
const UPCOMING_SETTINGS: readonly string[] = ['Connected health apps'];

export const SETTINGS_PATH = '/you/settings';

/**
 * Every app setting in one place (from You): your account, appearance, units, your plan (with Restore purchases and, for
 * private testers, the promo code), and what is coming.
 */
@Component({
  selector: 'app-settings',
  template: `
    <ion-content>
      <main class="body">
        <div class="topbar">
          <ion-back-button class="back" defaultHref="/you" text="" icon="chevron-back" aria-label="Back to You" />
          <h1 class="title">Settings</h1>
        </div>

        <app-account-card />

        <section class="card" aria-labelledby="settings-appearance">
          <h2 class="setting-title" id="settings-appearance">Appearance</h2>
          <fit-segmented-control
            name="theme-preference"
            legend="Theme"
            [options]="themeOptions"
            [value]="theme.preference()"
            (valueChange)="theme.setPreference($event)"
          />
          <p class="hint">System follows your device's light or dark setting.</p>
        </section>

        @if (unitSystem(); as units) {
          <section class="card" aria-labelledby="settings-units">
            <h2 class="setting-title" id="settings-units">Units</h2>
            <fit-segmented-control name="unit-system" legend="Units" [options]="unitOptions" [value]="units" (valueChange)="setUnits($event)" />
            <p class="hint">Weights and measurements are shown in kg and cm, or lb and in. Your recorded values stay the same.</p>
            @if (unitsError()) {
              <p class="error" role="alert" data-testid="units-error">Couldn't change your units. Try again.</p>
            }
          </section>
        }

        <section class="card" aria-labelledby="settings-plan">
          <h2 class="setting-title" id="settings-plan">Your plan</h2>
          <app-plan-status (openPlans)="openPlans()" />
          <ul class="rows">
            @if (testing.available && !testing.active()) {
              <li>
                <button type="button" class="row" data-testid="settings-promo" (click)="promoOpen.set(true)">
                  <ion-icon name="gift-outline" aria-hidden="true" /><span>Enter promo code</span><ion-icon class="chevron" name="chevron-forward" aria-hidden="true" />
                </button>
              </li>
            }
            <li>
              <button type="button" class="row" data-testid="settings-restore" (click)="restoreOpen.set(true)">
                <ion-icon name="sync-outline" aria-hidden="true" /><span>Restore purchases</span><ion-icon class="chevron" name="chevron-forward" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </section>

        <section class="card" aria-labelledby="settings-notifications">
          <h2 class="setting-title" id="settings-notifications">Notifications</h2>
          <ul class="rows">
            <li>
              <button type="button" class="row" data-testid="settings-notifications" (click)="openNotifications()">
                <ion-icon name="notifications-outline" aria-hidden="true" /><span>Reminders</span><ion-icon class="chevron" name="chevron-forward" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </section>

        <section class="card" aria-labelledby="settings-upcoming">
          <h2 class="setting-title" id="settings-upcoming">Coming soon</h2>
          <ul class="rows">
            @for (setting of upcomingSettings; track setting) {
              <li class="upcoming">
                <span>{{ setting }}</span>
                <fit-chip>Coming soon</fit-chip>
              </li>
            }
          </ul>
        </section>
      </main>
    </ion-content>

    @if (testing.available) {
      <app-promo-code-sheet [(open)]="promoOpen" />
    }
    <app-restore-sheet [(open)]="restoreOpen" />
  `,
  styles: `
    @use 'mixins' as fx;

    ion-content {
      --background: var(--color-bg);
    }

    .body {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      max-width: var(--page-max-width);
      margin: 0 auto;
      padding: calc(var(--ion-safe-area-top, 0px) + var(--space-2)) var(--space-4) var(--space-10);
    }

    .topbar {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .back {
      --background: var(--color-surface);
      --border-radius: var(--radius-pill);
      --color: var(--color-text);
      --icon-font-size: 22px;
      --padding-start: 0;
      --padding-end: 0;
      --icon-margin-start: 0;
      --icon-margin-end: 0;

      display: block;
      width: 44px;
      height: 44px;
    }

    .title {
      @include fx.text(h1, bold);
    }

    .card {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: var(--space-4);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }

    .setting-title {
      @include fx.text(body-sm, semibold);
    }

    .hint {
      @include fx.text(body-sm);
      color: var(--color-text-secondary);
    }

    .error {
      @include fx.text(body-sm, medium);
      color: var(--color-danger-text);
    }

    .rows {
      margin: 0;
      padding: 0;
      list-style: none;

      li {
        border-top: var(--border-hairline) solid var(--color-border);
      }
    }

    .row {
      @include fx.button-reset;
      @include fx.focus-ring;
      @include fx.text(body-sm);

      display: flex;
      align-items: center;
      gap: var(--space-3);
      width: 100%;
      min-height: 52px;

      span {
        flex: 1;
      }

      ion-icon {
        font-size: 20px;
      }
    }

    .chevron {
      color: var(--color-text-secondary);
    }

    .upcoming {
      @include fx.text(body-sm);
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: var(--tap-target-min);
    }
  `,
  host: { class: 'fit-theme-dashboard' },
  imports: [
    IonBackButton,
    IonContent,
    IonIcon,
    AccountCardComponent,
    FitnessChipComponent,
    PlanStatusComponent,
    PromoCodeSheetComponent,
    RestoreSheetComponent,
    SegmentedControlComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage {
  protected readonly theme = inject(ThemeService);
  protected readonly testing = inject(PrivateTestingService);
  protected readonly themeOptions = THEME_OPTIONS;
  protected readonly unitOptions = UNIT_SYSTEM_OPTIONS;
  protected readonly upcomingSettings = UPCOMING_SETTINGS;

  private readonly nav = inject(NavController);

  protected openNotifications(): void {
    void this.nav.navigateForward(['/you', 'settings', 'notifications']);
  }

  private readonly profiles = inject(FitnessProfileService);
  private readonly units = inject(UnitPreferenceService);
  private readonly cdr = inject(ChangeDetectorRef);

  /** The profile's display units (follows edits made elsewhere); null until read and without a profile. */
  protected readonly unitSystem = linkedSignal<UnitSystem | null>(() => this.profiles.profile()?.unitSystem ?? null);
  protected readonly unitsError = signal(false);
  protected readonly promoOpen = signal(false);
  protected readonly restoreOpen = signal(false);

  constructor() {
    void this.profiles.load();
  }

  /** Shown at once; a failed save puts the previous choice back and says so. */
  protected async setUnits(next: UnitSystem): Promise<void> {
    const previous = this.unitSystem();
    this.unitSystem.set(next);
    this.unitsError.set(false);
    // Render the choice now: a save that fails within the same tick would otherwise revert before the control saw it.
    this.cdr.detectChanges();
    const result = await this.units.set(next);
    if (!result.ok) {
      this.unitSystem.set(previous);
      this.unitsError.set(true);
    }
  }

  /** The plan screen; choosing there comes back here. */
  protected openPlans(): void {
    void this.nav.navigateForward(OFFER_PATH, { queryParams: { next: SETTINGS_PATH } });
  }
}
