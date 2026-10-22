/** The settings every environment file may carry (`environment.ts` is the type the app compiles against). */
export interface PrivateTestingEnvironment {
  /** Turns on the promo-code test access. Omitted means off. */
  readonly enabled: boolean;
  readonly promoCode: string;
}

export interface RevenueCatEnvironment {
  /** Public SDK key for Google Play (`goog_...`); null while billing isn't configured. */
  readonly androidApiKey: string | null;
  readonly entitlementId: string;
}

export interface AppEnvironment {
  readonly production: boolean;
  readonly apiBaseUrl: string | null;
  readonly inbodyExtractionEndpoint: string | null;
  readonly exerciseMediaBaseUrl: string | null;
  readonly revenueCat?: RevenueCatEnvironment;
  readonly privateTesting?: PrivateTestingEnvironment;
  /** Sentry error reporting (core/monitoring): the project's DSN (public, not a secret); null turns reporting off. */
  readonly sentryDsn?: string | null;
  /** The release name errors are reported under (match android/app/build.gradle versionName). */
  readonly release?: string | null;
}
