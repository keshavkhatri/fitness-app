import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IonIcon, NavController } from '@ionic/angular';

import { FitnessProfileService } from '../../core/profile/fitness-profile.service';
import { ONBOARDING_REVIEW_PATH } from '../../core/profile/onboarding.guards';
import { BODY_COMPOSITION_HISTORY_PATH } from '../body-composition/body-composition-paths';
import { MEASUREMENT_HISTORY_PATH } from '../body-measurements/measurement-paths';
import { WEIGHT_HISTORY_PATH } from '../body-weight/weight-history-paths';
import { FITNESS_REVIEW_PATH } from '../fitness-review/fitness-review-paths';
import { LinkCardComponent } from '../nutrition/components/link-card.component';
import { CLOCK } from '../../core/time/clock';
import { UserIdentityService } from '../../core/identity/user-identity.service';
import { QuickAddLauncher } from '../../shell/quick-add/quick-add-launcher.service';
import { IdentitySheetComponent } from './identity-sheet.component';
import { YouHeaderComponent } from './you-header.component';
import { YOU_TILES, YouDestination, toGoal, toYouHeader } from './you-view-model';
import { PageLayoutComponent } from '../../shared/ui';
import { SETTINGS_PATH } from './settings.page';

const COPY = {
  goal: 'Your goal',
  sections: 'Your data',
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
 * screen, and a way into Settings (account, plan, units, appearance).
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
    PageLayoutComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YouPage {
  protected readonly copy = COPY;
  protected readonly tiles = YOU_TILES;
  protected readonly testIds = TEST_IDS;
  private readonly clock = inject(CLOCK);

  private readonly nav = inject(NavController);
  private readonly profiles = inject(FitnessProfileService);

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

  protected openSettings(): void {
    void this.nav.navigateForward(SETTINGS_PATH);
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
