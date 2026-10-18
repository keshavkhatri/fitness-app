import { Injectable, computed, inject, signal } from '@angular/core';
import { CLOCK } from '../time/clock';
import { BILLING_PROVIDER, BillingAvailability, PurchaseFailureReason } from './billing';

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

@Injectable({ providedIn: 'root' })
export class EntitlementService {
  private readonly billing = inject(BILLING_PROVIDER);
  private readonly clock = inject(CLOCK);

  private readonly current = signal<Entitlement>({ status: 'loading' });
  readonly entitlement = this.current.asReadonly();
  /** For access decisions: anything but a verified subscription (including "still loading") is Free. */
  readonly plan = computed<Plan>(() => (this.current().status === 'premium' ? 'premium' : 'free'));

  private readonly purchaseState = signal<PurchaseState>({ status: 'idle' });
  readonly purchase = this.purchaseState.asReadonly();

  /** Re-reads the entitlement from the provider's authoritative check. Never grants Premium on error. */
  async refresh(): Promise<Entitlement> {
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

  /** Clears a finished purchase attempt's message (e.g. after the user acknowledged it). */
  dismissPurchase(): void {
    if (this.purchaseState().status !== 'pending') {
      this.purchaseState.set({ status: 'idle' });
    }
  }
}
