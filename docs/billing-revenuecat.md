# Pro subscriptions (RevenueCat) and private testing

StokeForm's paid tier is **Pro**. It is sold on Android through Google Play Billing, managed by **RevenueCat**. Inside the code the paid tier is still called `premium` (`Plan`, `FEATURE_MATRIX` tier, route names): only what people read says Pro.

What exists today: the app side of the integration, complete and tested. What does not exist until you set it up: a RevenueCat project, Google Play products and a public SDK key. Until a key is in `src/environments/billing.ts` the app behaves exactly as before: `NO_BILLING`, nobody can buy, `/offer` says Pro "isn't set up in this version of the app".

**Pro today is one feature:** building and editing your own workout plan (`custom-workout-plan` in `core/entitlements/access-policy.ts`, the single source of truth). Everything else, including the generated plan and the exercise library, is Free. Nothing else is gated without your approval.

## How it fits together

```
EntitlementService  ──asks──▶  BILLING_PROVIDER ─▶ RevenueCatBillingProvider ─▶ RevenueCat SDK ─▶ Google Play
       │                                         └▶ NO_BILLING (no key yet)
       └──also reads──▶  PrivateTestingService (promo code; on only while the build enables it)
```

| Piece | File |
| --- | --- |
| Provider-neutral boundary, `NO_BILLING` | `src/app/core/entitlements/billing.ts` |
| RevenueCat provider (offerings, purchase, restore, customer info, listener) | `src/app/core/entitlements/revenuecat/revenuecat-billing.provider.ts` |
| SDK adapter (lazy-loaded; faked in tests) | `…/revenuecat/revenuecat-sdk.ts` |
| Key and entitlement id | `src/environments/billing.ts` (public values only) |
| Which provider the app uses | `billingProviderFactory` (used in `src/app/app.config.ts`) |
| What is Pro (`canAccess`) | `src/app/core/entitlements/access-policy.ts` |
| Real subscription vs test access | `src/app/core/entitlements/entitlement.service.ts` |
| Private-testing promo code | `src/app/core/entitlements/private-testing/` |
| Plan screen | `src/app/features/offer/` |

Rules the code keeps:

- A button tap never grants Pro. `purchase()` only reports what the store said; Pro exists only when RevenueCat's customer info shows the `pro` entitlement active and unexpired (`activeSubscription()`), read again after every purchase, restore and customer-info update.
- Missing, expired, errored (offline) or unresolved subscription status is Free.
- Prices, billing periods and product names are the store's, via RevenueCat's `priceString` and `subscriptionPeriod`. Nothing is invented. No trial is shown in the app: if you configure a free trial in Google Play, Google's own purchase sheet states its terms.
- The SDK is configured once, only with a valid `goog_` key, only on Android; purchases in progress are not duplicated.
- No RevenueCat private (REST) key, webhook secret or Google service-account key is in the app.

**What this is not.** The entitlement is RevenueCat's own record of the subscription, read on the device. There is no StokeForm server-side verification and no RevenueCat webhook handler. That is acceptable for a client-side feature like the custom plan editor (there is nothing on the server to protect), but a Pro feature that stores data on the server must check the entitlement on the server (RevenueCat REST API or webhooks) before it is trusted. Not built.

## Identifiers

The app hard-codes only the entitlement id. Products come from the current offering, so you can change prices and packages in RevenueCat without a new build.

| What | Value | Where it is set |
| --- | --- | --- |
| Android package (application id) | `com.fitnessapp.app` | already the app's id |
| RevenueCat entitlement | `pro` | RevenueCat dashboard; also `REVENUECAT_PRO_ENTITLEMENT_ID` in `src/environments/billing.ts` |
| RevenueCat offering | `default`, marked **current** | RevenueCat dashboard (the app uses whatever offering is current) |
| Packages in the offering | `$rc_monthly` (and optionally `$rc_annual`) | RevenueCat dashboard; use the standard package types |
| Google Play subscription | `stokeform_pro` | Google Play Console |
| Google Play base plans | `monthly` (and optionally `annual`) | Google Play Console |
| RevenueCat product ids | `stokeform_pro:monthly`, `stokeform_pro:annual` | RevenueCat (imported from Play) |
| Public SDK key | `goog_…` | `REVENUECAT_ANDROID_PUBLIC_KEY` in `src/environments/billing.ts` |

These names are suggestions; if you choose others, only the entitlement id (`pro`) has to match the code.

## Set-up checklist (do these once, to sell Pro)

### Google Play Console

1. Have a Google Play developer account with a merchant (payments) profile.
2. Create the app with package name `com.fitnessapp.app` and complete the store listing and the policy declarations Play asks for.
3. Upload a **release-signed** build to the **Internal testing** track. Google Play Billing only works for a build installed from Play (side-loaded or `adb`-installed debug APKs cannot buy). A release signing key does not exist in this repo yet (`android/` has no release signing configuration): create an upload key and configure signing before this step.
4. **Monetize > Subscriptions**: create `stokeform_pro` with a base plan `monthly` (and optionally `annual`). Set the prices (you choose them; this code has none) and **activate** the base plans.
5. **Setup > License testing**: add the Google accounts of testers so their test purchases cost nothing.
6. **API access** (or IAM): create a service account for RevenueCat and invite it to the Play Console with the permissions RevenueCat's guide lists (view app information, view financial data, manage orders and subscriptions). Download its JSON key. Treat the key as a secret: it goes into RevenueCat only, never into this repo or the app.

### RevenueCat dashboard

1. Create a project and add an **Android (Google Play)** app with package name `com.fitnessapp.app`. Upload the service-account JSON from step 6 above.
2. **Products**: import (or add) `stokeform_pro:monthly` and optionally `stokeform_pro:annual`.
3. **Entitlements**: create `pro` and attach the products.
4. **Offerings**: create `default`, add a `$rc_monthly` package (and `$rc_annual`), attach the products, and **make it the current offering**.
5. **API keys**: copy the **public** SDK key for the Android app (starts with `goog_`). Do **not** copy the secret (REST) key anywhere in this project.
6. Put the public key in `src/environments/billing.ts` (`REVENUECAT_ANDROID_PUBLIC_KEY`) and rebuild. It is public by design.

### Verify a real purchase

Install the Internal-testing build from the Play link on a phone signed in with a **license tester** account, open `/offer` (You > Your plan), subscribe, and check that the app unlocks Build my own and that the purchase appears in RevenueCat. Then cancel in Google Play and confirm Pro ends at the period's end, and test Restore on a second install. **Until this has been done with real products and a tester account, a real Google Play purchase has not been shown to work.**

## Private testing (friends and family) with a promo code

Side-loaded APKs cannot make Play purchases, so testers use a **promo code** to try Pro. It is a shared, fixed code (`STOKEFORMLAB`, defined once in `src/environments/private-testing.ts`).

**It is in the live build while testing is private.** There is no separate test build: the normal live build (`npm run android:debug:cloud`, or `npm run build`) shows "Have a promo code?" on the plan screen. Development and debug builds on this PC have it too.

### Turning it off (before a public launch)

The whole mechanism is one flag in `src/environments/environment.prod.ts`:

```ts
privateTesting: { enabled: true, promoCode: PRIVATE_TESTING_PROMO_CODE },
```

- **Switch it off:** set `enabled: false`. The promo entry disappears and test access can no longer be unlocked, even on a phone that had it on. (The code is still in the bundle.)
- **Remove it completely:** delete the `privateTesting` block and the `PRIVATE_TESTING_PROMO_CODE` import from `environment.prod.ts`. The switch then defaults to off and the code leaves the bundle. Verify:

```
npm run build
grep -c STOKEFORMLAB www/*.js         # must print 0 for every file
```

- **Delete the feature:** remove `src/environments/private-testing.ts`, `core/entitlements/private-testing/`, the promo section of the offer page and the `testing` parts of `EntitlementService`.

### Using it

1. Open the app, go to **You > Your plan** (or the offer after first-run setup).
2. Tap **Have a promo code?**, type the code (any case, spaces ignored) and tap **Apply code**. The screen says "Test access is on" and shows a "Test access is on" warning notice: it is clearly not a subscription, and nothing is charged. You can then open **Build my own** on the Workout tab.
3. **Turn it off**: the **Turn off test access** button in that notice. You are back on Free (or on your real subscription, if you have one). The code can be typed again any number of times; it is never used up.
4. **Check Free:** with test access off, Build my own sends you to the plan screen; generated plans and the exercise library work either way.

The switch is stored on the device only and survives restarts. After a reinstall, type the code again.

### Installing the APK for friends and family

1. Build: `npm run android:debug:cloud` (JDK 21 and the Android SDK, as for the other debug builds). The APK is `android/app/build/outputs/apk/debug/app-debug.apk`.
2. Send the file (Google Drive link, messaging app, USB). It is a **debug-signed** APK.
3. On the phone: open the file, allow "install unknown apps" for the app used to open it, install. Google Play Protect may warn about an app it does not know: choose "Install anyway".
4. To update, install the newer APK over the old one (data is kept). This works only for APKs signed with the **same key**: every APK built on this computer uses its debug key, but one built on another computer has a different key and needs the old app uninstalled first (which deletes its local data).
5. Share the code only with people you trust.

### Security limits (read before sharing)

- The code is a shared secret inside the app. Anyone with the live build can read it out of the app, and anyone who knows it can share it. Test access is stored in the device's local storage, which a determined user can edit. It protects nothing from the public and is not payment verification.
- It never touches RevenueCat, is never reported as a purchase or subscription (`EntitlementService.source` is `test`, not `subscription`) and does not weaken the real flow: a real subscription is still decided by RevenueCat alone, and `source` reports `subscription` whenever one is active.
- **Turn it off before anything public** (Play Store listing, an open beta link, social media): see "Turning it off" above and run the `grep`. Because the code is in the live build, anyone you give that build to can read it.

## Tests

`core/entitlements/revenuecat/revenuecat-billing.provider.spec.ts` (configuration, offerings, purchases, entitlement states, restore, listener, through `EntitlementService`), `core/entitlements/private-testing/private-testing.spec.ts` (configuration per build, code handling, persistence, test access versus subscription, custom-plan guard), `features/offer/offer.page.spec.ts` (Pro plan states and the promo UI), `features/you/you.page.spec.ts` (plan row). The optimized live build was also run in a browser to confirm the promo flow end to end.
