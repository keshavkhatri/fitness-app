// Bundled into the app and readable by anyone: public values only, never
// API keys or other secrets.
import { REVENUECAT_ANDROID_PUBLIC_KEY, REVENUECAT_PRO_ENTITLEMENT_ID } from './billing';
import { PRIVATE_TESTING_PROMO_CODE } from './private-testing';

export const environment = {
  production: true,
  /** The StokeForm API on Google Cloud Run (server/CLOUD_RUN.md). null hides accounts. */
  apiBaseUrl: 'https://deploy-fitness-app-backend-893557393361.europe-west1.run.app' as string | null,
  /** The hosted extraction server on Google Cloud Run (server/CLOUD_RUN.md). null hides report upload. */
  inbodyExtractionEndpoint: 'https://deploy-fitness-app-backend-893557393361.europe-west1.run.app/v1/inbody-extractions' as string | null,
  /**
   * Exercise demonstration photos (free-exercise-db, public domain), pinned to
   * one commit; replace with the app's own host when there is one, or null to hide them.
   */
  exerciseMediaBaseUrl: 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/' as string | null,
  /** RevenueCat subscriptions (Android). The key is shared by every environment: see billing.ts. */
  revenueCat: { androidApiKey: REVENUECAT_ANDROID_PUBLIC_KEY, entitlementId: REVENUECAT_PRO_ENTITLEMENT_ID } as {
    androidApiKey: string | null;
    entitlementId: string;
  },
  /**
   * Promo-code test access: ON while the live build is only for private testers. Before a public launch set
   * `enabled: false` (or delete this block and the import above): the switch then defaults to off and the code
   * leaves the bundle. See docs/billing-revenuecat.md.
   */
  privateTesting: { enabled: true, promoCode: PRIVATE_TESTING_PROMO_CODE } as { enabled: boolean; promoCode: string },
};
