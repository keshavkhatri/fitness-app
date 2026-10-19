import { Injectable, inject } from '@angular/core';
import type { CustomerInfo, PurchasesPackage } from '@revenuecat/purchases-capacitor';

import { ActiveSubscription, BillingAvailability, BillingProduct, BillingProvider, NO_BILLING, PurchaseOutcome } from '../billing';
import { BILLING_PLATFORM_IS_ANDROID, REVENUECAT_CONFIG } from './revenuecat.config';
import { REVENUECAT_SDK } from './revenuecat-sdk';

/** RevenueCat error codes the app reacts to (the SDK's PURCHASES_ERROR_CODE values). */
const CODE = {
  cancelled: '1',
  notAllowed: '3',
  invalid: '4',
  productNotAvailable: '5',
  alreadyPurchased: '6',
  paymentPending: '20',
} as const;

const PERIOD_UNITS: Record<string, string> = { D: 'day', W: 'week', M: 'month', Y: 'year' };

/** "P1M" -> "month", "P3M" -> "3 months": the store's own billing period in words; '' when it isn't a plain one. */
export function periodLabel(iso: string | null): string {
  const match = /^P(\d+)([DWMY])$/.exec(iso ?? '');
  if (!match) {
    return '';
  }
  const unit = PERIOD_UNITS[match[2]];
  return match[1] === '1' ? unit : `${match[1]} ${unit}s`;
}

const errorCode = (error: unknown): string | null => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' || typeof code === 'number' ? String(code) : null;
};

/**
 * Google Play subscriptions through RevenueCat, behind the app's provider-neutral billing boundary.
 *
 * - Nothing here grants access. `activeSubscription()` reports RevenueCat's own customer entitlement (the
 *   entitlement configured as "pro", active and unexpired); a completed purchase only makes EntitlementService
 *   read it again. This is RevenueCat's view of the subscription, not our own server-side verification: the app
 *   has no webhook or backend integration with RevenueCat.
 * - Prices, periods and product names come from the store through RevenueCat. Nothing is hard-coded, and no
 *   trial is shown (Google Play's own purchase sheet states the trial terms of an offer, if one is configured).
 * - The SDK is configured once, only with a valid public key, only on Android.
 */
@Injectable({ providedIn: 'root' })
export class RevenueCatBillingProvider implements BillingProvider {
  readonly id = 'revenuecat';

  private readonly sdk = inject(REVENUECAT_SDK);
  private readonly config = inject(REVENUECAT_CONFIG);
  private readonly android = inject(BILLING_PLATFORM_IS_ANDROID);

  private configuring: Promise<void> | null = null;
  private purchasing: Promise<PurchaseOutcome> | null = null;
  private packages = new Map<string, PurchasesPackage>();

  /** Configures the SDK once. Rejects (and tries again next time) if that fails. */
  private configure(): Promise<void> {
    if (!this.config.apiKey) {
      return Promise.reject(new Error('RevenueCat is not configured.'));
    }
    const apiKey = this.config.apiKey;
    this.configuring ??= this.sdk.configure({ apiKey }).catch((error) => {
      this.configuring = null;
      throw error;
    });
    return this.configuring;
  }

  private get usable(): boolean {
    return this.android && this.config.apiKey !== null;
  }

  async availability(): Promise<BillingAvailability> {
    if (this.config.apiKey === null) {
      return { status: 'unavailable', reason: 'not-configured' };
    }
    if (!this.android) {
      return { status: 'unavailable', reason: 'platform-unsupported' };
    }
    try {
      await this.configure();
      const offerings = await this.sdk.getOfferings();
      const available = offerings.current?.availablePackages ?? [];
      this.packages = new Map(available.map((p) => [p.identifier, p]));
      // No current offering, or one without packages, is a dashboard set-up gap, not a store outage.
      if (available.length === 0) {
        return { status: 'unavailable', reason: 'not-configured' };
      }
      return { status: 'available', products: available.map(toProduct) };
    } catch {
      return { status: 'unavailable', reason: 'store-error' };
    }
  }

  purchase(productId: string): Promise<PurchaseOutcome> {
    // A second tap while one purchase is running joins it instead of starting another.
    this.purchasing ??= this.runPurchase(productId).finally(() => {
      this.purchasing = null;
    });
    return this.purchasing;
  }

  private async runPurchase(productId: string): Promise<PurchaseOutcome> {
    if (!this.usable) {
      return { kind: 'failed', reason: 'not-available' };
    }
    try {
      await this.configure();
      let target = this.packages.get(productId);
      if (!target) {
        await this.availability();
        target = this.packages.get(productId);
      }
      if (!target) {
        return { kind: 'failed', reason: 'not-available' };
      }
      await this.sdk.purchasePackage({ aPackage: target });
      return { kind: 'completed' };
    } catch (error) {
      const code = errorCode(error);
      if (code === CODE.cancelled || (error as { userCancelled?: unknown } | null)?.userCancelled === true) {
        return { kind: 'cancelled' };
      }
      switch (code) {
        case CODE.paymentPending:
          return { kind: 'pending' };
        case CODE.alreadyPurchased:
          // The store says it is already owned: report "completed" so the entitlement is read again and decides.
          return { kind: 'completed' };
        case CODE.productNotAvailable:
          return { kind: 'failed', reason: 'not-available' };
        case CODE.notAllowed:
        case CODE.invalid:
          return { kind: 'failed', reason: 'payment-declined' };
        default:
          return { kind: 'failed', reason: 'store-error' };
      }
    }
  }

  async restore(): Promise<void> {
    if (!this.usable) {
      return;
    }
    await this.configure();
    await this.sdk.restorePurchases();
  }

  async activeSubscription(): Promise<ActiveSubscription | null> {
    if (!this.usable) {
      return null;
    }
    await this.configure();
    const { customerInfo } = await this.sdk.getCustomerInfo();
    return this.proFrom(customerInfo);
  }

  /** Calls `listener` whenever RevenueCat reports changed customer info (a renewal, expiry, refund or restore). */
  watch(listener: () => void): void {
    if (!this.usable) {
      return;
    }
    void this.configure()
      .then(() => this.sdk.addCustomerInfoUpdateListener(() => listener()))
      .catch(() => undefined);
  }

  private proFrom(info: CustomerInfo): ActiveSubscription | null {
    const entitlement = info.entitlements?.active?.[this.config.entitlementId];
    if (!entitlement) {
      return null;
    }
    return { productId: entitlement.productIdentifier, active: entitlement.isActive === true, expiresAt: entitlement.expirationDate ?? null };
  }
}

function toProduct(pack: PurchasesPackage): BillingProduct {
  return {
    id: pack.identifier,
    title: pack.product.title,
    price: pack.product.priceString,
    period: periodLabel(pack.product.subscriptionPeriod),
    trial: null,
  };
}

/**
 * The app's billing provider: RevenueCat once a valid public SDK key is configured, otherwise NO_BILLING
 * (nothing can be bought, everyone is on Free). Used by app.config.ts for BILLING_PROVIDER.
 */
export function billingProviderFactory(): BillingProvider {
  return inject(REVENUECAT_CONFIG).apiKey ? inject(RevenueCatBillingProvider) : NO_BILLING;
}
