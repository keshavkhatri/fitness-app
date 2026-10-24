import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { IonBackButton, IonContent, IonIcon, NavController } from '@ionic/angular';

import { AuthService } from '../../core/auth/auth.service';
import { CONTACT_URL, OPEN_EXTERNAL, PRIVACY_URL, TERMS_URL } from '../../core/legal/legal-links';
import { FitnessProfileService } from '../../core/profile/fitness-profile.service';
import { UnitPreferenceService } from '../../core/profile/unit-preference.service';
import { ThemePreference, ThemeService } from '../../core/theme/theme.service';
import { UnitSystem } from '../../domain/fitness-profile';
import { SegmentOption, SegmentedControlComponent } from '../../shared/ui';
import { UNIT_SYSTEM_OPTIONS } from '../onboarding/onboarding-content';
import { AccountCardComponent } from './account-card.component';
import { CloudBackupComponent } from './cloud-backup.component';
import { DailyGoalsComponent } from './daily-goals.component';
import { HealthStepsCardComponent } from './health-steps-card.component';
import { DELETE_ACCOUNT_PATH } from './delete-account.page';

const THEME_OPTIONS: readonly SegmentOption<ThemePreference>[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export const SETTINGS_PATH = '/you/settings';

/**
 * Every app setting in one place (from You): your account, cloud backup, appearance, units, daily goals, step counting
 * (Health Connect), reminders, privacy (the policy, terms and support on stokeform.com, and deleting
 * the account or erasing this phone's data).
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

        <app-cloud-backup />

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

        <app-daily-goals />

        <app-health-steps-card />

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

        <section class="card" aria-labelledby="settings-privacy">
          <h2 class="setting-title" id="settings-privacy">Privacy and account</h2>
          <ul class="rows">
            <li>
              <button type="button" class="row" data-testid="settings-privacy" (click)="openSite(privacyUrl)">
                <ion-icon name="shield-checkmark-outline" aria-hidden="true" /><span>Privacy policy</span><ion-icon class="chevron" name="open-outline" aria-hidden="true" />
              </button>
            </li>
            <li>
              <button type="button" class="row" data-testid="settings-terms" (click)="openSite(termsUrl)">
                <ion-icon name="document-text-outline" aria-hidden="true" /><span>Terms of use</span><ion-icon class="chevron" name="open-outline" aria-hidden="true" />
              </button>
            </li>
            <li>
              <button type="button" class="row" data-testid="settings-contact" (click)="openSite(contactUrl)">
                <ion-icon name="mail-outline" aria-hidden="true" /><span>Contact support</span><ion-icon class="chevron" name="open-outline" aria-hidden="true" />
              </button>
            </li>
            <li>
              <button type="button" class="row danger" data-testid="settings-delete-account" (click)="openDeleteAccount()">
                <ion-icon name="trash-outline" aria-hidden="true" /><span>{{ signedIn() ? 'Delete account' : 'Erase data on this phone' }}</span
                ><ion-icon class="chevron" name="chevron-forward" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </section>
      </main>
    </ion-content>

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

    .row.danger {
      color: var(--color-danger-text);
    }
  `,
  host: { class: 'fit-theme-dashboard' },
  imports: [
    IonBackButton,
    IonContent,
    IonIcon,
    AccountCardComponent,
    CloudBackupComponent,
    DailyGoalsComponent,
    HealthStepsCardComponent,
    SegmentedControlComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage {
  protected readonly theme = inject(ThemeService);
  protected readonly themeOptions = THEME_OPTIONS;
  protected readonly unitOptions = UNIT_SYSTEM_OPTIONS;

  private readonly nav = inject(NavController);
  private readonly openExternal = inject(OPEN_EXTERNAL);
  private readonly auth = inject(AuthService);

  protected readonly privacyUrl = PRIVACY_URL;
  protected readonly termsUrl = TERMS_URL;
  protected readonly contactUrl = CONTACT_URL;
  protected readonly signedIn = computed(() => this.auth.state().status === 'signed-in');

  /** The privacy policy, terms and contact page are on stokeform.com. */
  protected openSite(url: string): void {
    void this.openExternal(url).catch(() => undefined);
  }

  protected openDeleteAccount(): void {
    void this.nav.navigateForward(DELETE_ACCOUNT_PATH);
  }

  protected openNotifications(): void {
    void this.nav.navigateForward(['/you', 'settings', 'notifications']);
  }

  private readonly profiles = inject(FitnessProfileService);
  private readonly units = inject(UnitPreferenceService);
  private readonly cdr = inject(ChangeDetectorRef);

  /** The profile's display units (follows edits made elsewhere); null until read and without a profile. */
  protected readonly unitSystem = linkedSignal<UnitSystem | null>(() => this.profiles.profile()?.unitSystem ?? null);
  protected readonly unitsError = signal(false);

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
}
