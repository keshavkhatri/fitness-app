import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { IonIcon, NavController } from '@ionic/angular';

import { FitnessProfileService } from '../../core/profile/fitness-profile.service';
import { ONBOARDING_REVIEW_PATH } from '../../core/profile/onboarding.guards';
import { UnitPreferenceService } from '../../core/profile/unit-preference.service';
import { ThemePreference, ThemeService } from '../../core/theme/theme.service';
import { UnitSystem } from '../../domain/fitness-profile';
import { BODY_COMPOSITION_HISTORY_PATH } from '../body-composition/body-composition-paths';
import { MEASUREMENT_HISTORY_PATH } from '../body-measurements/measurement-paths';
import { WEIGHT_HISTORY_PATH } from '../body-weight/weight-history-paths';
import { FITNESS_REVIEW_PATH } from '../fitness-review/fitness-review-paths';
import { LinkCardComponent } from '../nutrition/components/link-card.component';
import { UNIT_SYSTEM_OPTIONS } from '../onboarding/onboarding-content';
import { CLOCK } from '../../core/time/clock';
import { UserIdentityService } from '../../core/identity/user-identity.service';
import { QuickAddLauncher } from '../../shell/quick-add/quick-add-launcher.service';
import { IdentitySheetComponent } from './identity-sheet.component';
import { YouHeaderComponent } from './you-header.component';
import { YOU_TILES, YouDestination, toGoal, toYouHeader } from './you-view-model';
import {
  FitnessChipComponent,
  PageLayoutComponent,
  SegmentOption,
  SegmentedControlComponent,
} from '../../shared/ui';

const THEME_OPTIONS: readonly SegmentOption<ThemePreference>[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Settings that exist in the product plan but are not built yet. */
const UPCOMING_SETTINGS: readonly string[] = ['Notifications', 'Connected health apps', 'Subscription'];

const COPY = {
  goal: 'Your goal',
  sections: 'Your data',
  progress: { title: 'Progress', detail: 'Training activity and performance' },
  settings: 'Settings',
  appearance: 'Appearance',
  units: 'Units',
  upcoming: 'Coming soon',
} as const;

const TEST_IDS: Readonly<Record<YouDestination, string>> = {
  profile: 'profile-entry',
  weight: 'weight-history-entry',
  measurements: 'measurements-entry',
  'body-composition': 'body-composition-entry',
  review: 'review-entry',
  'quick-add': 'quick-add-entry',
};

/**
 * The personal hub (dashboard theme): who you are (name, photo, age and
 * height from the profile), your goal, entry points to every body-tracking
 * screen, and the app's settings (appearance, units).
 */
@Component({
  selector: 'app-you',
  templateUrl: './you.page.html',
  styleUrl: './you.page.scss',
  host: { class: 'fit-theme-dashboard' },
  imports: [
    IonIcon,
    IdentitySheetComponent,
    LinkCardComponent,
    YouHeaderComponent,
    FitnessChipComponent,
    PageLayoutComponent,
    SegmentedControlComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YouPage {
  protected readonly theme = inject(ThemeService);
  protected readonly themeOptions = THEME_OPTIONS;
  protected readonly upcomingSettings = UPCOMING_SETTINGS;
  protected readonly copy = COPY;
  protected readonly tiles = YOU_TILES;
  protected readonly testIds = TEST_IDS;
  private readonly clock = inject(CLOCK);

  private readonly nav = inject(NavController);
  private readonly profiles = inject(FitnessProfileService);
  private readonly units = inject(UnitPreferenceService);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly unitOptions = UNIT_SYSTEM_OPTIONS;
  /** The profile's display units (follows edits made elsewhere); null until read and without a profile. */
  protected readonly unitSystem = linkedSignal<UnitSystem | null>(() => this.profiles.profile()?.unitSystem ?? null);
  protected readonly unitsError = signal(false);

  protected readonly identity = inject(UserIdentityService);
  protected readonly identityOpen = signal(false);
  protected readonly identitySaving = signal(false);
  protected readonly identityError = signal<string | null>(null);
  private readonly quickAdd = inject(QuickAddLauncher);

  protected readonly header = computed(() => toYouHeader(this.identity.identity().name, this.profiles.profile(), this.clock()));
  protected readonly goal = computed(() => toGoal(this.profiles.profile()));

  constructor() {
    void this.profiles.load();
    void this.identity.load().catch(() => undefined);
  }

  protected openIdentity(): void {
    this.identityError.set(null);
    this.identityOpen.set(true);
  }

  protected async saveIdentity(next: { name: string | null; photo: string | null }): Promise<void> {
    this.identitySaving.set(true);
    this.identityError.set(null);
    try {
      await this.identity.save(next);
      this.identityOpen.set(false);
    } catch {
      this.identityError.set("Couldn't save. Try again.");
    } finally {
      this.identitySaving.set(false);
    }
  }

  /** The Quick Add sheet (start a workout, log food, weight, measurements, InBody). */
  protected openQuickAdd(): void {
    this.quickAdd.show();
  }

  /** Shown at once; a failed save puts the previous choice back and says so. */
  protected async setUnits(next: UnitSystem): Promise<void> {
    const previous = this.unitSystem();
    this.unitSystem.set(next);
    this.unitsError.set(false);
    // Render the choice now: a save that fails within the same tick would
    // otherwise revert before the control ever saw it, leaving it on `next`.
    this.cdr.detectChanges();
    const result = await this.units.set(next);
    if (!result.ok) {
      this.unitSystem.set(previous);
      this.unitsError.set(true);
    }
  }

  /** The profile review (saving re-runs the assessment; backing out returns here). */
  protected openProfile(): void {
    void this.nav.navigateForward(ONBOARDING_REVIEW_PATH, { queryParams: { returnTo: '/you' } });
  }

  protected openTile(id: YouDestination): void {
    switch (id) {
      case 'profile':
        return this.openProfile();
      case 'weight':
        return this.openWeightHistory();
      case 'measurements':
        return this.openMeasurements();
      case 'body-composition':
        return this.openBodyComposition();
      case 'review':
        void this.nav.navigateForward(FITNESS_REVIEW_PATH);
        return;
      case 'quick-add':
        return this.openQuickAdd();
    }
  }

  protected openProgress(): void {
    void this.nav.navigateForward(['/you', 'progress']);
  }

  protected openWeightHistory(): void {
    void this.nav.navigateForward(WEIGHT_HISTORY_PATH);
  }

  protected openMeasurements(): void {
    void this.nav.navigateForward(MEASUREMENT_HISTORY_PATH);
  }

  protected openBodyComposition(): void {
    void this.nav.navigateForward(BODY_COMPOSITION_HISTORY_PATH);
  }
}
