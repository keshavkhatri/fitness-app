# Access model: accounts, setup and Free / Pro

The paid tier is called **Pro** in the app. The code still says `premium` internally (`Plan`, the feature matrix tier), unchanged on purpose.

How StokeForm decides what a person sees and may use. Four states are kept separate, and none implies another.

| State | Source of truth | Values | Code |
| --- | --- | --- | --- |
| Authentication | Better Auth session (token in the platform secret store) | `restoring` / `guest` / `signed-in` (`verified` = confirmed by the server this launch) | `core/auth/auth.service.ts` |
| Profile completion | Local profile (`fitness.profile`) | `needs-onboarding` until a profile exists | `core/profile/onboarding-status.service.ts` |
| Assessment review | Local marker (`fitness.assessment-reviewed`, the profile's `updatedAt` only) | `needs-assessment` / `complete` | same |
| Entitlement | The billing provider's own entitlement check | `loading` / `free` (`default`, `expired`, `unverified`) / `premium` | `core/entitlements/entitlement.service.ts` |

Rules:

- Pro comes from exactly two places, kept apart in `EntitlementService.source`: a **verified subscription** (`subscription`, from RevenueCat) and **private-testing access** (`test`, a promo code, on in the live build while testing is private; not a subscription). `loading`, an error, an expired subscription and "no provider" are all Free. See [billing-revenuecat.md](billing-revenuecat.md).
- Signing in or out never changes the entitlement or the setup state. Signing out never deletes local data.
- A purchase attempt (`PurchaseState`: idle / pending / cancelled / failed) is separate from the entitlement. A store's "completed" counts only after `activeSubscription()` confirms it.

## First-run journey

```
Welcome → questionnaire → summary → Account → Finish (plan preview) → Assessment → Plan offer → Home
                                       │
                                       └─ signed out: Google (system browser + app link),
                                          or the existing email screens (/auth/sign-up, /auth/sign-in,
                                          password reset) with next=/onboarding
```

- **Gate.** The profile is created by the account step, and only once the person is signed in. The assessment and the plan are made from the profile, so nothing personal exists before sign-in.
- **Draft.** Answers are kept on the device (`fitness.onboarding-progress`) through redirects, a pending email confirmation, a failed Google sign-in and app restarts, and the flow resumes at the account step.
- **Name.** The questionnaire doesn't ask for a name. It comes from the account (Google's profile name, or the name given at sign-up). If the account has none, the account step asks once and saves the name on the device and on the account (`POST /api/auth/update-user`). A name already set on this device wins. It stays editable in You.
- **Accounts off.** In a build or server with accounts off, setup continues without an account rather than stranding the person. A network error shows a retry instead.
- **Offer.** The plan offer appears once, for someone who has just finished setup. `requireAppReady` on the tab shell redirects to `/offer?next=<where they were going>` while the one-time marker `stokeform.first-run-offer` exists. "Continue with Free" is always available and clears the marker.
- **Never interrupted.** Existing users (no marker) never see the offer as a gate, and the full-screen workout routes don't check it, so an active workout is never interrupted.
- **Existing users.** Their profile already exists, so they aren't sent back through onboarding and aren't asked to sign in. They can create an account from You. Their local data stays local: nothing is uploaded and no sync is claimed.

## Feature matrix

Defined once in `core/entitlements/access-policy.ts` (`FEATURE_MATRIX`, `canAccess(feature, plan)`). Screens ask the policy and never compare plans themselves. A feature that isn't built is not accessible to anyone.

| Feature | Plan | Built |
| --- | --- | --- |
| Personal workout plan | Free | Yes |
| Exercise library (browse, search, details and photos) | Free | Yes |
| Guided workout logging with rest timer | Free | Yes |
| Workout history and summaries | Free | Yes |
| Exercise progress and personal bests | Free | Yes |
| Food log with calorie and macro targets | Free | Yes |
| Calorie check-ins | Free | Yes |
| Weight tracking | Free | Yes |
| Body measurements | Free | Yes |
| Body composition records | Free | Yes |
| Read an InBody report from a photo | Free | Yes |
| Weekly fitness review | Free | Yes |
| In-app reminders | Free | Yes |
| StokeForm account | Free | Yes |
| Custom workout plan (build and edit your own) | Premium | Yes, but unavailable until billing exists |
| Back up and sync data across devices | Premium (candidate) | No |
| Progress photos | Premium (candidate) | No |
| Connect health apps | Premium (candidate) | No |

Every feature that existed before Premium stays Free, so the offer takes nothing away. The custom workout plan is the one built Premium feature (below). The other Premium rows are proposals awaiting a product decision. When a Premium feature is server-backed, the server must enforce it too, because a client check alone is not authorization.

## Custom workout plan (Premium)

A Premium user can replace their generated plan with one they build from the exercise library, and edit it later. It is one active plan, not a template library.

- **Choice.** At the end of first-run setup the plan preview offers "Use generated plan" (Free, the default; Continue starts it) and "Build my own (Premium)". Existing users are not sent through setup again and see no first-run choice; the Workout tab's plan section has "Build my own" (generated plan) or "Edit my plan" (custom plan), a "Plan: Generated plan / Custom plan" fact, and "Use generated plan" to switch back.
- **What changes.** The training days, session ids and names, and activity days stay the generated plan's. Only each workout day's exercises and their sets, reps (or seconds for timed exercises) and rest are the user's. No target weights are stored: the plan model has none, and weights come from logging.
- **Storage.** The same plan snapshot (`fitness.workout-plan`), marked `custom: { editedAt }`. Absent mark = generated. Completed and in-progress workouts snapshot their exercises when started, so editing or replacing the plan never rewrites history.
- **Freshness.** A custom plan is never regenerated automatically. If the profile's goal, experience, days, location or equipment change afterwards, the plan is kept and the Workout tab says so; "Use generated plan" (confirmed) is the only way it is replaced.
- **Enforcement.** `canAccess('custom-workout-plan', plan)` in three places: the editor and picker routes (`requireCustomPlanAccess`, which re-reads the entitlement and sends anyone else to the offer), the first-run choice (shows a button only when allowed), and `WorkoutPlanService.saveCustomPlan` (refuses with `not-allowed`). Using an existing custom plan, logging and history are never gated, so a lapsed subscription keeps the plan but cannot edit it.
- **Exercise library.** Browsing, search, filters and exercise details (`/workout/exercises`) are Free. Only adding to a plan day is Premium.

### Current availability

**Not available to anyone in production.** No billing provider is integrated, so `NO_BILLING` never reports a subscription, every user is Free, and `canAccess('custom-workout-plan', 'free')` is false. The feature is built and tested, and the first-run screen and offer say Premium isn't available yet. Nothing grants Premium locally; tests prove the Premium path only through a test-only billing provider (`core/entitlements/testing/premium-billing.ts`) that the app never provides.

To activate: finish the "Billing: not integrated" steps below, then verify on a device with a real sandbox subscription. No change to the feature itself is needed. If the feature should later be offered to Free users in any form (for example a limited trial), that is a change to the matrix row's `tier`, decided as a product question.

## Billing: RevenueCat (set-up pending)

`core/entitlements/billing.ts` defines a provider-neutral `BillingProvider` (availability, purchase, restore and the authoritative `activeSubscription`). A RevenueCat provider (`core/entitlements/revenuecat/`) is integrated for Google Play. It is used only once a public SDK key is put in `src/environments/billing.ts`; until then the default `NO_BILLING` sells nothing and never reports a subscription, so the offer page says Pro "isn't available yet", with no price, no trial and no buy button. Real purchases additionally need the RevenueCat dashboard and Google Play Console set-up in [billing-revenuecat.md](billing-revenuecat.md) and have not been tested against real products.

Still to do for real billing (the provider choice is made: RevenueCat):

1. **Choose a provider.** Google Play Billing (and the App Store for iOS), directly or through a cross-platform service. That choice is a product and legal decision, so it isn't made in code.
2. **Create products in the store.** Prices, periods and trial terms come only from the store, already localized. The app never hard-codes them.
3. **Verify on the server.** Implement `BillingProvider` and provide it for `BILLING_PROVIDER`. `activeSubscription()` should be server-verified (purchase tokens or receipts checked on the StokeForm server and tied to the signed-in account, never to a client-supplied user id).
4. **Handle subscription changes.** Cover refunds, grace periods, cancellation and expiry through the provider's notifications. An expired subscription resolves to Free.
5. **Write the terms.** Add the subscription terms and the cancellation wording the store requires to the offer page.

## Local versus account

- **Account (server):** email, name, Google link, sessions. Nothing else.
- **Device only:** profile, assessment, plan, workouts, nutrition, weight, measurements, body composition, identity photo, plan choice.
- **Consequences:** a returning account on a new device completes the questionnaire again, because there is no server-side profile yet. Signing out keeps all device data. Cloud backup and sync are not built and are listed only as a Premium candidate.
