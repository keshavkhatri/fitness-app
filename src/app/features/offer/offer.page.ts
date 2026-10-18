import { ChangeDetectionStrategy, Component, computed, inject, input, resource, signal } from '@angular/core';
import { IonContent, IonFooter, IonIcon, NavController } from '@ionic/angular';

import { AuthService } from '../../core/auth/auth.service';
import { BillingProduct } from '../../core/entitlements/billing';
import { FREE_FEATURES, PREMIUM_FEATURES } from '../../core/entitlements/access-policy';
import { EntitlementService } from '../../core/entitlements/entitlement.service';
import { FirstRunOfferService } from '../../core/entitlements/first-run-offer.service';
import { HOME_PATH } from '../../core/profile/onboarding.guards';
import { FitnessButtonComponent, LoadingSkeletonComponent, NoticeComponent } from '../../shared/ui';
import { safeNext } from '../auth/auth-content';

/**
 * Free or Premium. Shown once at the end of first-run setup (after the assessment), and any time from
 * You. Free is always one tap away, and is never styled as the lesser choice.
 *
 * Honest by construction: prices, billing periods and trial terms are shown only as the billing
 * provider states them. With no provider integrated (today), there is nothing to buy: the Premium
 * card says so plainly instead of simulating a checkout, and nobody becomes Premium. A purchase counts
 * only once the provider's own entitlement check confirms it (EntitlementService).
 */
@Component({
  selector: 'app-offer',
  templateUrl: './offer.page.html',
  styleUrl: './offer.page.scss',
  imports: [IonContent, IonFooter, IonIcon, FitnessButtonComponent, LoadingSkeletonComponent, NoticeComponent],
  host: { class: 'fit-theme-dashboard' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfferPage {
  /** Query parameter: where to go after choosing (an in-app path; anything else goes Home). */
  readonly next = input<string>();

  protected readonly entitlements = inject(EntitlementService);
  private readonly offer = inject(FirstRunOfferService);
  private readonly auth = inject(AuthService);
  private readonly nav = inject(NavController);

  protected readonly freeFeatures = FREE_FEATURES;
  protected readonly premiumFeatures = PREMIUM_FEATURES;
  protected readonly leaving = signal(false);

  protected readonly billing = resource({ loader: () => this.entitlements.availability() });
  /** The store's products, or null while loading / when there is nothing to buy. */
  protected readonly products = computed<readonly BillingProduct[] | null>(() => {
    const value = this.billing.hasValue() ? this.billing.value() : null;
    return value?.status === 'available' && value.products.length > 0 ? value.products : null;
  });
  protected readonly premiumActive = computed(() => this.entitlements.entitlement().status === 'premium');

  constructor() {
    void this.entitlements.refresh();
  }

  protected async subscribe(product: BillingProduct): Promise<void> {
    const result = await this.entitlements.buy(product.id);
    if (result.status === 'idle' && this.premiumActive()) {
      await this.leave();
    }
  }

  protected async restore(): Promise<void> {
    if ((await this.entitlements.restore()).status === 'premium') {
      await this.leave();
    }
  }

  /** Free: always available, recorded so first-run setup never shows this again. */
  protected async continueFree(): Promise<void> {
    await this.leave();
  }

  private async leave(): Promise<void> {
    if (this.leaving()) {
      return;
    }
    this.leaving.set(true);
    try {
      this.entitlements.dismissPurchase();
      await this.offer.choose('free', this.auth.user()?.id ?? null).catch(() => undefined);
      await this.nav.navigateRoot(safeNext(this.next(), HOME_PATH));
    } finally {
      this.leaving.set(false);
    }
  }
}
