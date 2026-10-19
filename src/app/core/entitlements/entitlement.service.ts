import { Injectable, computed, inject, signal } from '@angular/core';
import { CLOCK } from '../time/clock';
import { BILLING_PROVIDER, BillingAvailability, NO_BILLING, PurchaseFailureReason } from './billing';
import { PrivateTestingService } from './private-testing/private-testing.service';

/**
 * What the user may access. Separate from sign-in (AuthService), profile completion and assessment review
 * (OnboardingStatusService): a signed-out guest is Free, and so is a signed-in user without a verified
 * subscription. Premium exists only while the billing provider's own check says so.
 */
export type Entitlement =
  | { readonly status: 'loading' }
  | {
      readonly status: 'free';
      /**
       * default: no subscription; expired: one existed but is no longer active;
       * unverified: the provider couldn't be asked (never treated as Premium).
       */
      readonly reason: 'default' | 'expired' | 'unverified';
    }
  | { readonly status: 'premium'; readonly productId: string; readonly expiresAt: string | null };

/** A purchase attempt, apart from what the user is entitled to. */
export type PurchaseState =
  | { readonly status: 'idle' }
  | { readonly status: 'pending'; readonly productId: string }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly reason: PurchaseFailureReason };

export type Plan = 'free' | 'premium';

/**
 * What "Restore purchases" found: `restored` (a subscription is confirmed now), `none` (the store has no active
 * Pro subscription for this account), `failed` (the store could not be asked, e.g. offline) or `unavailable`
 * (billing isn't set up in this build, or not on this platform).
 */
export type RestoreResult = 'restored' | 'none' | 'failed' | 'unavailable';

/**
 * Why the user has Pro right now. `subscription` is a real, confirmed subscription from the billing provider;
 * `test` is private-testing access (a promo code in a build that enables it), which is NOT a subscription and
 * never reported as a purchase; `none` is Free.
 */
export type AccessSource = 'subscription' | 'test' | 'none';

@Injectable({ providedIn: 'root' })
export class EntitlementService {
  private readonly billing = inject(BILLING_PROVIDER);
  private readonly clock = inject(CLOCK);
  private readonly testing = inject(PrivateTestingService);

  private readonly current = signal<Entitlement>({ status: 'loading' });
  /** The real subscription state from the billing provider. Test access is separate (`source`, `plan`). */
  readonly entitlement = this.current.asReadonly();
  /** Private-testing access is switched on (never true in a build without private testing). */
  readonly testAccess = this.testing.active;
  readonly source = computed<AccessSource>(() => (this.current().status === 'premium' ? 'subscription' : this.testing.active() ? 'test' : 'none'));
  /**
   * For access decisions: Pro only for a verified subscription or for private-testing access; anything else,
   * including "still loading", an error or an expired subscription, is Free. Turning test access off falls
   * back to the real entitlement.
   */
  readonly plan = computed<Plan>(() => (this.source() === 'none' ? 'free' : 'premium'));

  private readonly purchaseState = signal<PurchaseState>({ status: 'idle' });
  readonly purchase = this.purchaseState.asReadonly();
  /** Whether a billing provider is configured at all (false: nothing can be bought or restored). */
  readonly billingConfigured = this.billing.id !== NO_BILLING.id;

  constructor() {
    // A provider that can tell us about changes (a renewal, expiry or refund) makes the entitlement read again.
    this.billing.watch?.(() => void this.refresh());
  }

  /** Re-reads the entitlement from the provider's authoritative check. Never grants Pro on error. */
  async refresh(): Promise<Entitlement> {
    await this.testing.restore();
    let next: Entitlement;
    try {
      const subscription = await this.billing.activeSubscription();
      if (!subscription) {
        next = { status: 'free', reason: 'default' };
      } else if (subscription.active && (subscription.expiresAt === null || Date.parse(subscription.expiresAt) > this.clock().getTime())) {
        next = { status: 'premium', productId: subscription.productId, expiresAt: subscription.expiresAt };
      } else {
        next = { status: 'free', reason: 'expired' };
      }
    } catch {
      next = { status: 'free', reason: 'unverified' };
    }
    this.current.set(next);
    return next;
  }

  /** What can be bought right now, with the store's own prices and terms. */
  async availability(): Promise<BillingAvailability> {
    try {
      return await this.billing.availability();
    } catch {
      return { status: 'unavailable', reason: 'store-error' };
    }
  }

  /**
   * Starts a purchase. A "completed" answer from the store is not trusted on its own: the entitlement is
   * re-read from the provider, and only a confirmed subscription makes the user Premium. Cancelled or
   * failed purchases leave the user exactly where they were (Free).
   */
  async buy(productId: string): Promise<PurchaseState> {
    if (this.purchaseState().status === 'pending') {
      return this.purchaseState();
    }
    this.purchaseState.set({ status: 'pending', productId });
    let next: PurchaseState;
    try {
      const outcome = await this.billing.purchase(productId);
      switch (outcome.kind) {
        case 'completed':
          next = (await this.refresh()).status === 'premium' ? { status: 'idle' } : { status: 'failed', reason: 'not-confirmed' };
          break;
        case 'pending':
          // The store is still processing (e.g. a deferred payment): stay Free until confirmed.
          next = { status: 'pending', productId };
          break;
        case 'cancelled':
          next = { status: 'cancelled' };
          break;
        case 'failed':
          next = { status: 'failed', reason: outcome.reason };
          break;
      }
    } catch {
      next = { status: 'failed', reason: 'store-error' };
    }
    this.purchaseState.set(next);
    return next;
  }

  /** Restores earlier purchases, then re-reads the entitlement (an expired one resolves to Free). */
  async restore(): Promise<Entitlement> {
    try {
      await this.billing.restore();
    } catch {
      // The authoritative check below decides either way.
    }
    return this.refresh();
  }

  /**
   * Restore purchases, with an honest outcome for the screen. Nothing is granted here: the entitlement is read
   * again from the provider, and only a confirmed subscription counts as restored.
   */
  async restorePurchases(): Promise<RestoreResult> {
    if (!this.billingConfigured) {
      return 'unavailable';
    }
    const availability = await this.availability();
    if (availability.status === 'unavailable' && availability.reason === 'platform-unsupported') {
      return 'unavailable';
    }
    let failed = false;
    try {
      await this.billing.restore();
    } catch {
      failed = true;
    }
    const entitlement = await this.refresh();
    if (entitlement.status === 'premium') {
      return 'restored';
    }
    return failed || (entitlement.status === 'free' && entitlement.reason === 'unverified') ? 'failed' : 'none';
  }

  /** Clears a finished purchase attempt's message (e.g. after the user acknowledged it). */
  dismissPurchase(): void {
    if (this.purchaseState().status !== 'pending') {
      this.purchaseState.set({ status: 'idle' });
    }
  }
}
