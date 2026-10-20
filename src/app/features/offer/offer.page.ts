import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, resource, signal } from '@angular/core';
import { IonContent, IonFooter, IonIcon, NavController } from '@ionic/angular';

import { AuthService } from '../../core/auth/auth.service';
import { BillingProduct } from '../../core/entitlements/billing';
import { EntitlementService } from '../../core/entitlements/entitlement.service';
import { FirstRunOfferService } from '../../core/entitlements/first-run-offer.service';
import { PrivateTestingService } from '../../core/entitlements/private-testing/private-testing.service';
import { HOME_PATH } from '../../core/profile/onboarding.guards';
import { PlanIntentService } from '../../core/workout/plan-intent.service';
import { CUSTOM_PLAN_EDIT_PATH, WORKOUT_PATH } from '../workout/workout-paths';
import { FitnessButtonComponent, LoadingSkeletonComponent, NoticeComponent } from '../../shared/ui';
import { safeNext } from '../auth/auth-content';
import { PromoResult } from '../../core/entitlements/private-testing/private-testing.service';
import { OfferBrandComponent } from './components/offer-brand.component';
import { PromoSuccessComponent } from './components/promo-success.component';
import { RestoreSheetComponent } from './components/restore-sheet.component';
import { OFFER_COPY, PREVIEW_PRODUCT } from './offer-content';

/** Feedback for a promo code that didn't work. */
const PROMO_PROBLEMS: Partial<Record<PromoResult, string>> = {
  invalid: "That code isn't valid. Check the spelling and try again.",
  empty: 'Enter a promo code.',
  unavailable: "Promo codes aren't available in this version of the app.",
};

/**
 * Free or Pro. Shown once at the end of first-run setup (after the assessment), and any time from You.
 * Three views: the plans (Free / Pro tabs, what each includes, the private-testing promo code), Go Pro
 * (what Pro adds, its price, Subscribe, Restore) and, after a promo code works, the test-access success.
 * Free is always one tap away.
 *
 * Prices come from the billing provider (RevenueCat, from Google Play). TODO(billing): while no products are
 * configured (development), a static preview price is shown (PREVIEW_PRODUCT) and Subscribe only explains that
 * subscriptions aren't live; nothing is charged. A purchase counts only once the provider's entitlement check
 * confirms it (EntitlementService). Promo access is always called test access, never a purchase.
 */
@Component({
  selector: 'app-offer',
  templateUrl: './offer.page.html',
  styleUrls: ['./offer.page.scss', './offer-sections.scss'],
  imports: [
    IonContent,
    IonFooter,
    IonIcon,
    FitnessButtonComponent,
    LoadingSkeletonComponent,
    NoticeComponent,
    OfferBrandComponent,
    PromoSuccessComponent,
    RestoreSheetComponent,
  ],
  host: { class: 'fit-theme-dashboard' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfferPage implements OnInit {
  /** Query parameter: where to go after choosing (an in-app path; anything else goes Home). */
  readonly next = input<string>();
  /** Query parameter `start`: `pro` opens on what Pro adds (e.g. "Learn more" from a Pro gate). */
  readonly start = input<string>();

  protected readonly entitlements = inject(EntitlementService);
  protected readonly testing = inject(PrivateTestingService);
  private readonly offer = inject(FirstRunOfferService);
  private readonly auth = inject(AuthService);
  private readonly nav = inject(NavController);
  private readonly intents = inject(PlanIntentService);

  protected readonly copy = OFFER_COPY;
  protected readonly view = signal<'plans' | 'pro' | 'success'>('plans');
  /** The plan tab picked on the plans view. */
  protected readonly choice = signal<'free' | 'pro'>('pro');
  protected readonly leaving = signal(false);
  protected readonly restoreOpen = signal(false);
  protected readonly promoCode = signal('');
  protected readonly promoBusy = signal(false);
  protected readonly promoProblem = signal<string | null>(null);
  /** Subscribe was tapped on the preview price. */
  protected readonly previewNotice = signal(false);

  protected readonly billing = resource({ loader: () => this.entitlements.availability() });
  /** The store's products, or null while loading / when there is nothing to buy. */
  protected readonly products = computed<readonly BillingProduct[] | null>(() => {
    const value = this.billing.hasValue() ? this.billing.value() : null;
    return value?.status === 'available' && value.products.length > 0 ? value.products : null;
  });
  /** What the Pro card offers: the store's products, else (nothing configured) the preview price. */
  protected readonly shownProducts = computed<readonly BillingProduct[]>(() => {
    const products = this.products();
    if (products) {
      return products;
    }
    return this.unavailableReason() === 'store-error' ? [] : [PREVIEW_PRODUCT];
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

  ngOnInit(): void {
    // Route inputs are set by now.
    if (this.start() === 'pro') {
      this.view.set('pro');
    }
    // "Build my own" chosen during setup: Pro is the plan that does that.
    void this.intents.load().then((intent) => {
      if (intent === 'custom') {
        this.choice.set('pro');
      }
    });
  }

  protected async subscribe(product: BillingProduct): Promise<void> {
    if (product.id === PREVIEW_PRODUCT.id) {
      this.previewNotice.set(true);
      return;
    }
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
    this.view.set('plans');
  }

  /** Pro chosen: what Pro adds and its price. */
  protected showPro(): void {
    this.previewNotice.set(false);
    this.view.set('pro');
  }

  protected async applyPromo(): Promise<void> {
    if (this.promoBusy()) {
      return;
    }
    this.promoBusy.set(true);
    try {
      const result = await this.testing.redeem(this.promoCode());
      this.promoProblem.set(PROMO_PROBLEMS[result] ?? null);
      if (result === 'activated') {
        this.promoCode.set('');
        this.view.set('success');
      }
    } finally {
      this.promoBusy.set(false);
    }
  }

  /** Free: always available, recorded so first-run setup never shows this again. */
  protected async continueFree(): Promise<void> {
    await this.leave();
  }

  /**
   * Where to go next: where the user was headed, unless they chose "Build my own" during setup. Then a Pro
   * user goes to the editor (the choice is used up) and a Free user to the Train tab, which reminds them once.
   */
  private async destination(): Promise<string> {
    if ((await this.intents.load()) !== 'custom') {
      return safeNext(this.next(), HOME_PATH);
    }
    if (this.hasPro()) {
      await this.intents.clear();
      return CUSTOM_PLAN_EDIT_PATH;
    }
    return WORKOUT_PATH;
  }

  private async leave(): Promise<void> {
    if (this.leaving()) {
      return;
    }
    this.leaving.set(true);
    try {
      this.entitlements.dismissPurchase();
      await this.offer.choose('free', this.auth.user()?.id ?? null).catch(() => undefined);
      await this.nav.navigateRoot(await this.destination());
    } finally {
      this.leaving.set(false);
    }
  }
}
