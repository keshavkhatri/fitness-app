import { BILLING_PROVIDER, BillingProvider, NO_BILLING } from '../billing';

/**
 * Test-only: a billing provider whose authoritative check reports an active subscription, so specs can
 * exercise Premium behaviour through the real EntitlementService. It is never provided by the app, and
 * grants nothing outside the TestBed that provides it.
 */
export const PREMIUM_TEST_BILLING: BillingProvider = {
  ...NO_BILLING,
  id: 'test-premium',
  activeSubscription: async () => ({ productId: 'test-premium', active: true, expiresAt: null }),
};

export const premiumBillingProvider = () => ({ provide: BILLING_PROVIDER, useValue: PREMIUM_TEST_BILLING });
