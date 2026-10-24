/**
 * Billing configuration shared by every environment (the one place to change it).
 *
 * Both values are public by design: a RevenueCat *public* SDK key ships inside the app. Never put a RevenueCat
 * secret (REST / private) key, a webhook secret or a Google service-account key here or anywhere in the app.
 */

/**
 * RevenueCat public SDK key for the Google Play app (starts with `goog_`), from RevenueCat > Project settings >
 * API keys. null until it is added: the app then runs without billing (`NO_BILLING`) and /offer says Pro isn't set up.
 */
export const REVENUECAT_ANDROID_PUBLIC_KEY: string | null = null;

/**
 * Whether Pro is sold. false for the free-only launch: every built feature, Pro ones included, is open to everyone
 * and the plan screen only says StokeForm is free. Turn on with subscriptions (docs/billing-launch-plan.md).
 */
export const PAID_PLANS_LIVE = false;

/** The RevenueCat entitlement that unlocks Pro (the identifier given to it in the RevenueCat dashboard). */
export const REVENUECAT_PRO_ENTITLEMENT_ID = 'pro';
