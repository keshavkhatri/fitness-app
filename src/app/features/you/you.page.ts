import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, linkedSignal, signal } from '@angular/core';
import { IonIcon, NavController } from '@ionic/angular';

import { FitnessProfileService } from '../../core/profile/fitness-profile.service';
import { ONBOARDING_REVIEW_PATH } from '../../core/profile/onboarding.guards';
import { UnitPreferenceService } from '../../core/profile/unit-preference.service';
import { ThemePreference, ThemeService } from '../../core/theme/theme.service';
import { UnitSystem } from '../../domain/fitness-profile';
import { BODY_COMPOSITION_HISTORY_PATH } from '../body-composition/body-composition-paths';
import { MEASUREMENT_HISTORY_PATH } from '../body-measurements/measurement-paths';
import { WEIGHT_HISTORY_PATH } from '../body-weight/weight-history-paths';
import { UNIT_SYSTEM_OPTIONS } from '../onboarding/onboarding-content';
import {
  FitnessCardComponent,
  FitnessChipComponent,
  PageLayoutComponent,
  SectionHeaderComponent,
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

/** Profile and settings shell. */
@Component({
  selector: 'app-you',
  templateUrl: './you.page.html',
  styleUrl: './you.page.scss',
  imports: [
    IonIcon,
    FitnessCardComponent,
    FitnessChipComponent,
    PageLayoutComponent,
    SectionHeaderComponent,
    SegmentedControlComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YouPage {
  protected readonly theme = inject(ThemeService);
  protected readonly themeOptions = THEME_OPTIONS;
  protected readonly upcomingSettings = UPCOMING_SETTINGS;

  private readonly nav = inject(NavController);
  private readonly profiles = inject(FitnessProfileService);
  private readonly units = inject(UnitPreferenceService);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly unitOptions = UNIT_SYSTEM_OPTIONS;
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
