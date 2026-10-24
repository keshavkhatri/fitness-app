// Bundled into the app and readable by anyone: public values only, never
// API keys or other secrets.
import { PAID_PLANS_LIVE, REVENUECAT_ANDROID_PUBLIC_KEY, REVENUECAT_PRO_ENTITLEMENT_ID } from './billing';
import { PRIVATE_TESTING_PROMO_CODE } from './private-testing';

export const environment = {
  production: true,
  /** The StokeForm API on Google Cloud Run (server/CLOUD_RUN.md). null hides accounts. */
  apiBaseUrl: 'https://deploy-fitness-app-backend-893557393361.europe-west1.run.app' as string | null,
  /** The hosted extraction server on Google Cloud Run (server/CLOUD_RUN.md). null hides report upload. */
  inbodyExtractionEndpoint: 'https://deploy-fitness-app-backend-893557393361.europe-west1.run.app/v1/inbody-extractions' as string | null,
  /**
   * Exercise demonstration photos from a third-party CDN (free-exercise-db). Off: every exercise has its own bundled
   * StokeForm guide image (assets/exercise-art), so nothing is loaded from another server.
   */
  exerciseMediaBaseUrl: null as string | null,
  /** Pro is sold (billing.ts). Off: everything is free, Pro features included. */
  paidPlans: PAID_PLANS_LIVE as boolean,
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
  /** Sentry error reporting: set the project's DSN (Sentry › Settings › Client Keys) to turn it on. */
  sentryDsn: "https://ec04c59005cf045f9698ace9e6806c24@o4512301116948480.ingest.us.sentry.io/4512301121273856" as string | null,
  release: 'stokeform@1.0.0' as string | null,
};
