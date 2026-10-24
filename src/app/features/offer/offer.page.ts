import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { IonContent, IonFooter, IonIcon, NavController } from '@ionic/angular';

import { AuthService } from '../../core/auth/auth.service';
import { canAccess } from '../../core/entitlements/access-policy';
import { EntitlementService } from '../../core/entitlements/entitlement.service';
import { FirstRunOfferService } from '../../core/entitlements/first-run-offer.service';
import { HOME_PATH } from '../../core/profile/onboarding.guards';
import { PlanIntentService } from '../../core/workout/plan-intent.service';
import { CUSTOM_PLAN_EDIT_PATH, WORKOUT_PATH } from '../workout/workout-paths';
import { FitnessButtonComponent } from '../../shared/ui';
import { safeNext } from '../auth/auth-content';
import { OfferBrandComponent } from './components/offer-brand.component';
import { OFFER_COPY } from './offer-content';

/**
 * The plan screen, shown once at the end of first-run setup. StokeForm launches free only, so it says what is
 * included and offers one way on: Continue for free. Paid Pro (comparison, prices, Subscribe, Restore) comes
 * back with subscriptions: docs/billing-launch-plan.md.
 */
@Component({
  selector: 'app-offer',
  templateUrl: './offer.page.html',
  styleUrls: ['./offer.page.scss', './offer-sections.scss'],
  imports: [IonContent, IonFooter, IonIcon, FitnessButtonComponent, OfferBrandComponent],
  host: { class: 'fit-theme-dashboard' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfferPage {
  /** Query parameter: where to go after choosing (an in-app path; anything else goes Home). */
  readonly next = input<string>();

  private readonly entitlements = inject(EntitlementService);
  private readonly offer = inject(FirstRunOfferService);
  private readonly auth = inject(AuthService);
  private readonly nav = inject(NavController);
  private readonly intents = inject(PlanIntentService);

  protected readonly copy = OFFER_COPY;
  protected readonly leaving = signal(false);

  constructor() {
    void this.entitlements.refresh();
  }

  /** Recorded so first-run setup never shows this again. */
  protected async continueFree(): Promise<void> {
    if (this.leaving()) {
      return;
    }
    this.leaving.set(true);
    try {
      await this.offer.choose('free', this.auth.user()?.id ?? null).catch(() => undefined);
      await this.nav.navigateRoot(await this.destination());
    } finally {
      this.leaving.set(false);
    }
  }

  /**
   * Where the user was headed, unless they chose "Build my own" during setup: then the editor (the choice is
   * used up), or the Train tab if the editor isn't open to them.
   */
  private async destination(): Promise<string> {
    if ((await this.intents.load()) !== 'custom') {
      return safeNext(this.next(), HOME_PATH);
    }
    if (canAccess('custom-workout-plan', this.entitlements.plan())) {
      await this.intents.clear();
      return CUSTOM_PLAN_EDIT_PATH;
    }
    return WORKOUT_PATH;
  }
}
