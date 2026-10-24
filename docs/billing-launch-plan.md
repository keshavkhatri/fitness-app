# Turning on Pro subscriptions: step-by-step plan

StokeForm launches **free only**. This is the plan for adding paid Pro later. The app's RevenueCat integration (SDK, purchase, restore, entitlement check) is already built and tested: see `docs/billing-revenuecat.md` for how it works. What is left is store and dashboard setup, a few app changes, legal wording and a real test purchase.

## Part 1: Google Play Console (owner)

1. **Payments profile**: Setup › Payments profile. Add the bank account and tax details (PAN, plus GST if registered). Verification can take days, so start this first.
2. **Create the subscription**: Monetize with Play › Products › Subscriptions.
   - Product id `stokeform_pro`.
   - Base plan `monthly`, auto-renewing, at the chosen price. Optionally add `annual`.
   - Optional free-trial offer.
   - **Activate** the base plans.
3. **License testers**: Setup › License testing. Add testers' Gmail addresses. Their purchases are free test purchases that renew every few minutes.
4. **Service account for RevenueCat**: create it in Google Cloud, then invite it in Play Console › Users and permissions with these permissions:
   - view app information
   - view financial data
   - manage orders and subscriptions

   Download its JSON key. It is a secret: it goes into RevenueCat only, never into the repo or the app.

## Part 2: RevenueCat dashboard (owner)

5. Create a project and add a **Google Play** app with package `com.stokeformfitness.app`. Upload the service-account JSON. Validation can take up to 36 hours after Play grants access.
6. **Products**: import `stokeform_pro:monthly` (and `:annual`).
7. **Entitlements**: create `pro` and attach the products. The id `pro` must match `REVENUECAT_PRO_ENTITLEMENT_ID` in `src/environments/billing.ts`.
8. **Offerings**: create `default` with a `$rc_monthly` package (and `$rc_annual`) and mark it **Current**.
9. **API keys**: copy the **public** Android SDK key (starts with `goog_`). Never put the secret REST key anywhere in this project.

## Part 3: App changes

10. Put the public key in `REVENUECAT_ANDROID_PUBLIC_KEY` (`src/environments/billing.ts`).
11. **Turn paid plans on**: set `PAID_PLANS_LIVE = true` in `src/environments/billing.ts`.
    - With it off (the free launch), every built feature is open to everyone, including the custom plan editor (`canAccess` in `core/entitlements/access-policy.ts`), and the onboarding "Build my own" option has no Pro badge.
    - With it on, the custom plan is Pro again, and the Workout tab's Pro gate and badges come back automatically.
12. **Bring back the paid screens** removed for the free launch, from git history and re-checked against what Pro really unlocks:
    - `/offer` (`features/offer/`): the Free/Pro comparison, Go Pro, prices, Subscribe and Restore purchases. It currently only says "Everything is free" with Continue for free. The unused pieces are still in `features/offer/components/`.
    - Settings › "Your plan" (`features/you/plan-status.component.ts`), plus the Enter promo code and Restore purchases rows.

    Show only the store's real price (RevenueCat `priceString`). The old static ₹299 preview price was deleted and must not come back.
13. **Link purchases to the StokeForm account**: call `Purchases.logIn(userId)` at sign-in and `logOut` at sign-out. Without this, RevenueCat uses an anonymous id per install (Restore still works through the Google account). It is needed before any server-side Pro check.
14. Add a **Manage subscription** link that opens Google Play's subscription page. Play expects an easy way to cancel.
15. Bump `versionCode` in `android/app/build.gradle`, run `npm run android:release` and upload to Internal testing.

## Part 4: Legal and Play forms

16. **Privacy policy** (`website/privacy.html`): add RevenueCat as a processor of purchase data. It is in the US, so it is another transfer outside India.
17. **Terms** (`website/terms.html`): add subscription terms:
    - price and auto-renewal
    - cancelling in Google Play
    - refunds under Google Play's policy
    - trial terms, if a trial is offered
18. **Play Console › Data safety**: add "Financial info › Purchase history", collected for app functionality and processed by RevenueCat.

## Part 5: Test a real purchase

19. Install from the Internal testing link on a phone signed in with a license-tester account.
20. Go to You › Your plan and subscribe. Check that the Pro feature unlocks and that the purchase appears in RevenueCat.
21. Test Restore purchases on a second install.
22. Cancel in Google Play and confirm Pro ends at the end of the period.

## Before any public release

- Set `privateTesting.enabled` to `false` in `src/environments/environment.prod.ts`, so the promo code stops working. See `docs/billing-revenuecat.md`, "Turning it off".
