import { ChangeDetectionStrategy, Component, computed, inject, input, resource, signal } from '@angular/core';
import { IonContent, IonFooter, IonIcon, NavController } from '@ionic/angular';

import { AuthService } from '../../core/auth/auth.service';
import { BillingProduct } from '../../core/entitlements/billing';
import { EntitlementService } from '../../core/entitlements/entitlement.service';
import { FirstRunOfferService } from '../../core/entitlements/first-run-offer.service';
import { PrivateTestingService } from '../../core/entitlements/private-testing/private-testing.service';
import { HOME_PATH } from '../../core/profile/onboarding.guards';
import { FitnessButtonComponent, LoadingSkeletonComponent, NoticeComponent } from '../../shared/ui';
import { safeNext } from '../auth/auth-content';
import { OfferHeroComponent } from './components/offer-hero.component';
import { PlanComparisonComponent } from './components/plan-comparison.component';
import { PromoCodeSheetComponent } from './components/promo-code-sheet.component';
import { RestoreSheetComponent } from './components/restore-sheet.component';

/**
 * Free or Pro. Shown once at the end of first-run setup (after the assessment), and any time from You.
 * Free is always one tap away, and is never styled as the lesser choice.
 *
 * Honest by construction: prices, billing periods and product names are shown only as the billing provider
 * (RevenueCat, from Google Play) states them. With nothing configured there is nothing to buy: the Pro card
 * says so plainly instead of simulating a checkout. A purchase counts only once the provider's own entitlement
 * check confirms it (EntitlementService). Restore and the private-testing promo code open their own sheets;
 * promo access is always called test access, never a purchase or a subscription.
 */
@Component({
  selector: 'app-offer',
  templateUrl: './offer.page.html',
  styleUrl: './offer.page.scss',
  imports: [
    IonContent,
    IonFooter,
    IonIcon,
    FitnessButtonComponent,
    LoadingSkeletonComponent,
    NoticeComponent,
    OfferHeroComponent,
    PlanComparisonComponent,
    PromoCodeSheetComponent,
    RestoreSheetComponent,
  ],
  host: { class: 'fit-theme-dashboard' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfferPage {
  /** Query parameter: where to go after choosing (an in-app path; anything else goes Home). */
  readonly next = input<string>();

  protected readonly entitlements = inject(EntitlementService);
  protected readonly testing = inject(PrivateTestingService);
  private readonly offer = inject(FirstRunOfferService);
  private readonly auth = inject(AuthService);
  private readonly nav = inject(NavController);

  protected readonly leaving = signal(false);
  protected readonly promoOpen = signal(false);
  protected readonly restoreOpen = signal(false);

  protected readonly billing = resource({ loader: () => this.entitlements.availability() });
  /** The store's products, or null while loading / when there is nothing to buy. */
  protected readonly products = computed<readonly BillingProduct[] | null>(() => {
    const value = this.billing.hasValue() ? this.billing.value() : null;
    return value?.status === 'available' && value.products.length > 0 ? value.products : null;
  });
  /** Why nothing can be bought, once the store has answered. */
  protected readonly unavailableReason = computed(() => {
    const value = this.billing.hasValue() ? this.billing.value() : null;
    if (value?.status === 'unavailable') {
      return value.reason;
    }
    return value?.status === 'available' && value.products.length === 0 ? 'not-configured' : null;
  });

  /** A real, confirmed subscription. */
  protected readonly subscribed = computed(() => this.entitlements.source() === 'subscription');
  /** Private-testing access (not a subscription). */
  protected readonly testActive = computed(() => this.entitlements.source() === 'test');
  /** Either way the user has Pro now. */
  protected readonly hasPro = computed(() => this.entitlements.plan() === 'premium');

  constructor() {
    void this.entitlements.refresh();
  }

  protected async subscribe(product: BillingProduct): Promise<void> {
    const result = await this.entitlements.buy(product.id);
    if (result.status === 'idle' && this.subscribed()) {
      await this.leave();
    }
  }

  protected retry(): void {
    this.billing.reload();
  }

  /** Turns test access off: the real subscription state decides again. */
  protected async stopTestAccess(): Promise<void> {
    await this.testing.deactivate();
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
