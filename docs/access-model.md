# Access model: accounts, setup and Free / Premium

How StokeForm decides what a person sees and may use. Four states are kept separate, and none implies another.

| State | Source of truth | Values | Code |
| --- | --- | --- | --- |
| Authentication | Better Auth session (token in the platform secret store) | `restoring` / `guest` / `signed-in` (`verified` = confirmed by the server this launch) | `core/auth/auth.service.ts` |
| Profile completion | Local profile (`fitness.profile`) | `needs-onboarding` until a profile exists | `core/profile/onboarding-status.service.ts` |
| Assessment review | Local marker (`fitness.assessment-reviewed`, the profile's `updatedAt` only) | `needs-assessment` / `complete` | same |
| Entitlement | The billing provider's own entitlement check | `loading` / `free` (`default`, `expired`, `unverified`) / `premium` | `core/entitlements/entitlement.service.ts` |

Rules:

- Only a verified subscription is Premium. `loading`, an error, an expired subscription and "no provider" are all Free.
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
| Back up and sync data across devices | Premium (candidate) | No |
| Progress photos | Premium (candidate) | No |
| Connect health apps | Premium (candidate) | No |

Every feature that exists today stays Free, so the offer takes nothing away. The Premium rows are proposals awaiting a product decision. When a Premium feature is server-backed, the server must enforce it too, because a client check alone is not authorization.

## Billing: not integrated

`core/entitlements/billing.ts` defines a provider-neutral `BillingProvider` (availability, purchase, restore and the authoritative `activeSubscription`). The default `NO_BILLING` sells nothing and never reports a subscription, so the offer page shows Premium as "not available yet", with no price, no trial and no buy button.

Before real billing:

1. **Choose a provider.** Google Play Billing (and the App Store for iOS), directly or through a cross-platform service. That choice is a product and legal decision, so it isn't made in code.
2. **Create products in the store.** Prices, periods and trial terms come only from the store, already localized. The app never hard-codes them.
3. **Verify on the server.** Implement `BillingProvider` and provide it for `BILLING_PROVIDER`. `activeSubscription()` should be server-verified (purchase tokens or receipts checked on the StokeForm server and tied to the signed-in account, never to a client-supplied user id).
4. **Handle subscription changes.** Cover refunds, grace periods, cancellation and expiry through the provider's notifications. An expired subscription resolves to Free.
5. **Write the terms.** Add the subscription terms and the cancellation wording the store requires to the offer page.

## Local versus account

- **Account (server):** email, name, Google link, sessions. Nothing else.
- **Device only:** profile, assessment, plan, workouts, nutrition, weight, measurements, body composition, identity photo, plan choice.
- **Consequences:** a returning account on a new device completes the questionnaire again, because there is no server-side profile yet. Signing out keeps all device data. Cloud backup and sync are not built and are listed only as a Premium candidate.
