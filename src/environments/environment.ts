// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

// Bundled into the app and readable by anyone: public values only, never
// API keys or other secrets (the OpenAI key lives in server/.env).
import { REVENUECAT_ANDROID_PUBLIC_KEY, REVENUECAT_PRO_ENTITLEMENT_ID } from './billing';
import { PRIVATE_TESTING_PROMO_CODE } from './private-testing';

export const environment = {
  production: false,
  /** The StokeForm API (server/): accounts today, user data later. A public URL, never a secret. */
  apiBaseUrl: 'http://localhost:8787' as string | null,
  /** The local InBody extraction server (`npm run server:start`). */
  inbodyExtractionEndpoint: 'http://localhost:8787/v1/inbody-extractions' as string | null,
  /**
   * Exercise demonstration photos from a third-party CDN (free-exercise-db). Off: every exercise has its own bundled
   * StokeForm guide image (assets/exercise-art), so nothing is loaded from another server.
   */
  exerciseMediaBaseUrl: null as string | null,
  /** RevenueCat subscriptions (Android). The key is shared by every environment: see billing.ts. */
  revenueCat: { androidApiKey: REVENUECAT_ANDROID_PUBLIC_KEY, entitlementId: REVENUECAT_PRO_ENTITLEMENT_ID } as {
    androidApiKey: string | null;
    entitlementId: string;
  },
  /** Promo-code test access for private testing: on in development and debug builds, off in `environment.prod.ts`. */
  privateTesting: { enabled: true, promoCode: PRIVATE_TESTING_PROMO_CODE } as { enabled: boolean; promoCode: string },
  /** No error reporting from development builds. */
  sentryDsn: null as string | null,
  release: null as string | null,
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
