import { InjectionToken } from '@angular/core';

/**
 * The boundary to a real billing provider (Google Play Billing, App Store, or a cross-platform service).
 * None is integrated yet: the default provider reports billing as unavailable, so nobody can buy, and
 * nobody becomes Premium. Choosing and integrating a provider is a product decision (docs/access-model.md).
 *
 * Rules for any implementation:
 * - Prices, periods and trial terms come only from the provider (already formatted for the store's
 *   locale and currency). The app never invents or hard-codes them.
 * - `purchase()` reports what the store said; it never grants anything. Premium is decided only by
 *   `activeSubscription()`, the provider's authoritative entitlement check (server-verified where the
 *   provider supports it).
 */

/** A trial is offered only when the provider confirms this user is eligible and gives its exact terms. */
export interface TrialOffer {
  /** As the store words it, e.g. "7 days". */
  readonly length: string;
  /** What is charged when the trial ends, e.g. "£4.99/month". */
  readonly renewalPrice: string;
  /** How and until when it can be cancelled, as the store states it. */
  readonly cancellationTerms: string;
}

export interface BillingProduct {
  readonly id: string;
  readonly title: string;
  /** Formatted by the store, e.g. "£4.99". */
  readonly price: string;
  /** Billing interval as the store states it, e.g. "month", "year". */
  readonly period: string;
  /** null unless the provider confirmed eligibility and terms. */
  readonly trial: TrialOffer | null;
}

export type BillingUnavailableReason = 'not-configured' | 'platform-unsupported' | 'store-error';

export type BillingAvailability =
  | { readonly status: 'unavailable'; readonly reason: BillingUnavailableReason }
  | { readonly status: 'available'; readonly products: readonly BillingProduct[] };

/** What the provider says this user is currently subscribed to (the authoritative check). */
export interface ActiveSubscription {
  readonly productId: string;
  /** False once cancelled and lapsed, refunded, or in an unrecovered billing problem. */
  readonly active: boolean;
  /** ISO time the current period ends, if the provider reports one. */
  readonly expiresAt: string | null;
}

export type PurchaseFailureReason = 'payment-declined' | 'store-error' | 'not-available' | 'not-confirmed';

/** The store's answer to a purchase attempt. Never an entitlement on its own. */
export type PurchaseOutcome =
  | { readonly kind: 'completed' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly reason: PurchaseFailureReason };

export interface BillingProvider {
  /** For diagnostics only. */
  readonly id: string;
  availability(): Promise<BillingAvailability>;
  purchase(productId: string): Promise<PurchaseOutcome>;
  /** Asks the store to restore earlier purchases; the result is read back with activeSubscription(). */
  restore(): Promise<void>;
  /** The authoritative entitlement check. null when there is no subscription. */
  activeSubscription(): Promise<ActiveSubscription | null>;
  /**
   * Optional: calls the listener when the provider learns the customer's subscription changed (a renewal, an
   * expiry, a refund or a restore). The listener only asks EntitlementService to read activeSubscription() again.
   */
  watch?(listener: () => void): void;
}

/** The default until a provider is integrated: nothing can be bought, and nothing is ever Premium. */
export const NO_BILLING: BillingProvider = {
  id: 'none',
  availability: async () => ({ status: 'unavailable', reason: 'not-configured' }),
  purchase: async () => ({ kind: 'failed', reason: 'not-available' }),
  restore: async () => undefined,
  activeSubscription: async () => null,
};

export const BILLING_PROVIDER = new InjectionToken<BillingProvider>('BILLING_PROVIDER', {
  providedIn: 'root',
  factory: () => NO_BILLING,
});
