# Accounts (Better Auth)

Optional accounts on the existing server: email/password with **email confirmation** and **password
reset**, Google sign-in, sessions, sign-out, `GET /v1/auth/me`, and a cleanup job for accounts never
confirmed. **Accounts do not sync or upload anything yet.** The app
works fully without one (guest mode), all workout, food and body data stays in the device's
`localStorage`, and signing up, in or out never changes it.

**Production status:** not enabled. Enabling needs the steps in
[Enabling accounts in production](#enabling-accounts-in-production); none of them have been done.

## How it fits

| Piece | File |
| --- | --- |
| Settings and validation | `src/auth/auth-config.ts`, email settings `src/auth/email.ts` |
| Better Auth instance (schema `auth`, verification, linking rules, bearer tokens, one-time tokens, rate limits, log redaction) | `src/auth/auth.ts` |
| HTTP routes, CORS, the confirmation page, `authenticate()` for protected endpoints | `src/auth/auth-routes.ts` |
| Email delivery (confirmation and password-reset messages): Resend, or the local dev outbox (`tools/dev-outbox.ts`) | `src/auth/email.ts` |
| Cleanup job for unconfirmed accounts | `src/auth/cleanup.ts`, `tools/cleanup.ts` → `cleanup.mjs` |
| Email test command (one message to an address you name) | `tools/email-test.ts` → `email-test.mjs`, `npm run server:email:test` |
| Google hand-off to the Android app | `src/auth/mobile-handoff.ts` |
| Tables | `migrations/0006_auth_tables.sql`, foreign keys `migrations/0007_user_ownership.sql` |
| App side | `src/app/core/auth/` and `src/app/features/auth/` in the Angular app |

### Routes

| Route | |
| --- | --- |
| `POST /api/auth/sign-up/email` | Creates the account **unconfirmed**, emails a confirmation link, and returns **no session**. An address that already has an account gets the same answer (and no email), so sign-up never reveals who is registered. |
| `POST /api/auth/sign-in/email` | Returns the session token in the `set-auth-token` header. Unconfirmed address: **403 `EMAIL_NOT_VERIFIED`** and (only with the right password) a fresh link. |
| `GET /api/auth/verify-email?token=…` | The emailed link. Confirms the address and redirects to the page below. Makes no session. |
| `GET /v1/auth/email-verified` | The page the link lands on: "Email confirmed, go back to the app and sign in" (or "expired" / "not valid"). |
| `POST /api/auth/request-password-reset` | `{ email }`. Emails a one-hour, single-use link; the answer is identical for known and unknown addresses. See [Password reset](#password-reset). |
| `GET /v1/auth/reset-password?token=…` | The page the reset link opens: choose a new password (in the browser). |
| `POST /api/auth/reset-password` | `{ token, newPassword }`, posted by that page. Changes the password and ends all sessions. |
| `POST /api/auth/sign-out` | Ends the session (send the token as `Authorization: Bearer`). |
| `GET /v1/auth/me` | **401** without a valid session (or for an unconfirmed address), **200** `{ user: { id, email, name, emailVerified }, session: { expiresAt } }`. |
| `GET /v1/auth/providers` | `{ accounts, emailPassword, google }`: which sign-in methods this server offers. No auth needed. |
| `GET /v1/auth/google/start?redirect=…&challenge=…` | Starts Google sign-in (302 to Google). |
| `GET /api/auth/callback/google` | Google returns here (Better Auth). **This is the redirect URI to register with Google.** |
| `GET /v1/auth/google/complete` | Internal next step: issues a single-use code and redirects to the app (or passes an error code). |
| `POST /v1/auth/mobile/exchange` | The app trades `{ code, verifier }` for a session token. |

Closed on purpose (404): Better Auth's `/api/auth/one-time-token/*` (codes are bound to the app's verifier),
`/api/auth/send-verification-email` (it would email anyone's address without a password; a new link comes
from signing in with the right password instead) and `/api/auth/reset-password/<token>` (its redirecting link
route; our emails link to the page above).

### Verified identities only

- **Email/password:** an account gets no session until its address is confirmed through the link
  (`requireEmailVerification`). The link expires after 24 hours; it is a signed token, built by the server
  with the server's own landing page (a `callbackURL` sent by a client is ignored).
- **Google:** the identity is read on the server from the ID token Google's token endpoint returns to
  this server (in exchange for the authorization code and the client secret, over TLS). Nothing the app
  or browser sends (an email in a query string, a body, or app storage) is used as identity. A Google
  account whose address Google reports as unverified gets no session (`requireEmailVerification` on the
  provider).
- **Defense in depth:** `authenticate()` (and so `/v1/auth/me` and every future protected endpoint)
  treats a session whose user is unconfirmed as no session at all.

### Account linking

When a Google sign-in finds an existing account with the same address, Better Auth (1.7) joins them
**only if both** Google reports the address as verified **and** the existing account's own address is
confirmed. Otherwise the app is told `account-not-linked` and nothing is joined. Configured explicitly in
`auth.ts` (`trustedProviders: []`, `requireLocalEmailVerified: true`, `allowDifferentEmails: false`) and
covered by tests that run Better Auth's real Google callback (only Google's token endpoint is simulated).

> **Correction to the Phase 3 notes.** The earlier version of this file said a Google sign-in could be
> joined to an existing unconfirmed account. That was wrong for Better Auth 1.7.10: its default already
> required the local address to be confirmed (`requireLocalEmailVerified` defaults to `true`; the earlier
> check only looked at the explicit-link code path). The real gap was that no address was ever confirmed,
> so email/password accounts were unverified identities. Both are now settled and tested:
> `server/test/auth.spec.ts`, "Google identities and account linking".

Remaining edge case (accepted, documented): someone registers *your* address with their password; you
receive a "confirm your email" message you never asked for. If you **don't** open it, nothing happens:
their account can't sign in, and your Google sign-in won't be joined to it (you'll see
"This email already has an account"). If you **do** open it, you confirm an account whose password they
know. The email says to ignore it if you didn't sign up. Both mitigations now exist: use
[Forgot your password?](#password-reset) (a reset replaces the squatter's password with one only you
know), and the [cleanup job](#cleaning-up-unconfirmed-accounts) deletes accounts left unconfirmed after a
week.

## Password reset

"Forgot your password?" on the sign-in screen asks for an address. Whatever the server knows about it, the
app says the same thing ("if it has an account, we've sent a link"), and the server's answer, status and
body are identical for known and unknown addresses (no email is sent for unknown ones; the answer doesn't
wait for the send, so timing doesn't tell them apart either).

1. `POST /api/auth/request-password-reset` `{ email }` (3 per minute per client). Better Auth stores a
   one-hour, single-use token; the server emails a link to **its own page**,
   `<BETTER_AUTH_URL>/v1/auth/reset-password?token=…`. A `redirectTo` sent by a client is ignored, and
   Better Auth's own link route (`/api/auth/reset-password/<token>`, which redirects) is closed (404).
2. The page opens in the person's browser (an email link opens the browser, not the app; custom-scheme
   links don't work reliably in email). It is a static page with a per-response nonce CSP: it removes the
   token from the address bar and history on load, never writes it into the HTML, asks for the new password
   twice (8–128 characters), and posts it to `POST /api/auth/reset-password` (10 per minute per client).
3. On success, **every session of the account is ended** (`revokeSessionsOnPasswordReset`, in the same
   transaction that consumes the token), so a stolen session or whoever knew the old password is signed out
   everywhere. The page says to go back to the app and sign in. Nobody is signed in by the reset itself.
4. A used, expired (after 1 hour), wrong or missing token shows "Link not valid" and changes nothing. A
   too-short or too-long password is refused **without using up** the link.

Behaviours worth knowing:

- An account whose address was never confirmed can also reset (that's how the real owner takes it back from
  a squatter), but it still cannot sign in until the address is confirmed: signing in then sends a fresh
  confirmation link.
- A Google-only account can add a password this way (the link goes to the address it already proved).
- Without email delivery configured the reset endpoints are disabled (400 `RESET_PASSWORD_DISABLED`), and the
  app shows accounts as unavailable.
- Logs record only `auth.password-reset` and the email outcome (`auth.email-sent`/`failed`, with the
  provider, the type and an HTTP status): never the link, token, address or password. Tested.
- Email: the same Resend/dev-outbox sender as confirmation emails (subject "Reset your StokeForm password").
  In development the link is in `server/.dev-outbox/` and opens at `http://localhost:8787/v1/auth/reset-password?...`.

## Cleaning up unconfirmed accounts

Accounts whose address is never confirmed are harmless (they can't sign in) but accumulate, and they hold
addresses that belong to other people. `cleanup.mjs` (source `src/auth/cleanup.ts`, `tools/cleanup.ts`)
deletes the old ones. It is a **job, not part of the API process**: Cloud Run instances scale to zero, so an
in-process timer would not run. Run it on a schedule ([CLOUD_RUN.md](CLOUD_RUN.md#scheduled-cleanup-of-unconfirmed-accounts))
or by hand:

```powershell
npm run server:cleanup                # PREVIEW (the default): lists what it would delete (masked), deletes nothing
npm run server:cleanup:apply          # deletes, at most 50 per run, oldest first
node server/dist/cleanup.mjs --apply --min-age-days 14 --limit 20     # options (age 2–3650 days, limit 1–500)
```

> **Run the preview first, every time, and read it.** `--apply` is the only thing that deletes. These npm
> scripts read `DATABASE_URL` from `server/.env`, which is the **one real database** (see "One database"), so
> `server:cleanup:apply` deletes real accounts. A deleted account comes back only from a Neon backup: take one
> first. Run it on a schedule in production only after you have read previews you were happy with.

An account is deleted only if **all** of these hold, re-checked in the same statement that deletes it:

- its address was **never confirmed** and the account is older than `--min-age-days` (default **7**, never
  below 2: longer than any confirmation link lives);
- its only sign-in method is a **password** (never a Google or any other linked provider);
- it has **no session, ever** (an account that was used is not a leftover);
- it has **no unexpired token** in `auth.verification` (a reset or confirmation in progress);
- it owns **no data**: no row in any table that references `auth."user"` outside `auth`. These tables are
  discovered from the database's own foreign keys (migration 0007 and anything added later), so new data
  tables are protected automatically. If none can be found, the job **refuses to delete anything**.

Safety and behaviour:

- **Preview by default**; `--apply` is required to delete. Output has counts, dates and **masked** addresses
  (`a***@e***.com`), never full addresses, tokens or the connection string. A summary line `auth.cleanup`
  (JSON) is logged for Cloud Logging.
- **Races:** candidates are selected `FOR UPDATE SKIP LOCKED` in one transaction, so an account being
  confirmed at that moment is skipped, and one the job has locked can't be confirmed until it finishes (the
  link then says "not valid" and the person can sign up again). The DELETE repeats every condition, so an
  account that gained data, a Google link, a session or its confirmation in between is left alone. Any
  failure rolls the whole batch back.
- **Bounded and idempotent:** at most `--limit` per run; a second run finds nothing new. Deleting an account
  cascades to its password row and tokens only (an eligible account has no data and no sessions).
- It uses `DATABASE_URL` (the runtime, pooled connection; it needs no session-level lock).
- One residual case, accepted: someone who tries to sign in to an old unconfirmed account (right password)
  just before it is deleted gets a fresh confirmation link that then says "not valid". They sign up again;
  nothing of theirs existed.
- Verified: unit tests on the real migrations (eligible, verified, Google-linked, with data in each kind of
  table, recent, with a session, with a pending token, the limit, idempotence, and the confirm-in-between and
  failure races), and once against the real database with throwaway rows (only the eligible one was deleted).

### Tokens

The app runs at `https://localhost` (Android WebView) and the API is another site, so cookies would be
third-party and are blocked. The app therefore sends `Authorization: Bearer <token>`. Tokens are signed
(`token.signature`): an unsigned or altered token is refused. On Android the token lives in secure storage
backed by the Android Keystore (`@aparajita/capacitor-secure-storage`); in a desktop browser during
development, in `sessionStorage`. **Never in `localStorage`.** Sessions last `AUTH_SESSION_DAYS`
(30 by default) and are extended once a day while used. Signing out on one device leaves others signed in.

### Google on Android (no secret in the app)

1. The app makes a random *verifier*, keeps it in secure storage, and opens the system browser (Custom
   Tab) at `/v1/auth/google/start` with only the verifier's SHA-256 *challenge*.
2. Google sign-in happens in the browser and returns to `/api/auth/callback/google`.
3. `/v1/auth/google/complete` makes a 3-minute, single-use code tied to the challenge and redirects to
   `com.fitnessapp.app://auth/callback?code=…` (or `?error=account-not-linked|email-not-verified|google-sign-in-failed`),
   which reopens the app (intent filter in `AndroidManifest.xml`).
4. The app sends `{ code, verifier }` to `/v1/auth/mobile/exchange` and receives its session token.

If Android closed the app while the browser was open, the link starts it fresh; the app reads it as the
launch URL (handled once even if it also arrives as an event). A stolen code is useless without the
verifier, and the redirect must be listed in `AUTH_APP_REDIRECT_URLS`. The Google client secret stays on
the server.

## Configuration

Accounts are **off** until `BETTER_AUTH_SECRET` is set; then `DATABASE_URL` and `BETTER_AUTH_URL` are
required. Within that, **email/password is on only with email delivery** and **Google only with its
credentials**; with neither, the app says accounts are unavailable. While off, account routes answer
503 `auth-not-configured` and everything else works. Errors name the variable, never its value.

| Variable | Default | |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | unset (accounts off) | ≥ 32 random characters. Signs tokens, cookies and confirmation links; changing it signs everyone out and voids unopened links. **Secret.** |
| `BETTER_AUTH_URL` | (required with the secret) | The server's public origin, e.g. `https://<service>.run.app`. `https` except for `localhost`. No path. |
| `EMAIL_DELIVERY` | unset (email/password off) | `resend` (real email) or `dev-outbox` (local files; refused unless `BETTER_AUTH_URL` is localhost and `NODE_ENV` isn't production). |
| `RESEND_API_KEY` | | With `resend`. **Secret.** |
| `EMAIL_FROM` | | With `resend`: e.g. `StokeForm <no-reply@your-domain>`, on a domain verified in Resend. |
| `EMAIL_DEV_OUTBOX_DIR` | `server/.dev-outbox` | With `dev-outbox` (git-ignored). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | unset (Google hidden) | Both or neither. The secret is **secret**; the id is not. |
| `AUTH_APP_REDIRECT_URLS` | `com.fitnessapp.app://auth/callback` | Where Google sign-in may return, comma-separated. Add `http://localhost:4200/auth/callback` for web development. |
| `AUTH_SESSION_DAYS` | 30 | 1–90. |
| `ALLOWED_ORIGINS` | (existing) | Also Better Auth's trusted origins. Android: `https://localhost`; iOS: `capacitor://localhost`; web dev: `http://localhost:4200`. |
| `CLIENT_IP_HEADER` | (existing) | Used for the rate limits: sign-in 5/min, sign-up 3/min, confirmation links 10/min, reset requests 3/min, new passwords 10/min. |

Generate a secret without printing it anywhere shared (PowerShell):

```powershell
$bytes = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes) | Set-Clipboard   # paste into server/.env or Secret Manager, then clear the clipboard
```

Use a different secret for development and production.

## Setting up real email (Resend)

**Status: never tested with real delivery.** Resend is not configured anywhere (no key, no sender, no test
recipient exists); every email so far went to the local dev outbox or to a simulated provider in the tests.
Everything below is verified by reading the code and by tests, except Resend's own dashboard steps, which are
written from its documentation: check them against what Resend shows you.

Resend is a plain HTTPS API (no SMTP library, no extra dependency) with a free tier (check Resend's current
limits). Another provider can be added behind the `EmailSender` interface in `src/auth/email.ts`.

### What the server needs

Exactly three variables (plus the public URL used for links):

| Variable | Value |
| --- | --- |
| `EMAIL_DELIVERY` | `resend` |
| `RESEND_API_KEY` | the API key (**secret**: Secret Manager on Cloud Run, git-ignored `.env` locally) |
| `EMAIL_FROM` | the sender: `StokeForm <no-reply@mail.your-domain.com>` or just `no-reply@mail.your-domain.com`, on a domain **verified in Resend** |
| `BETTER_AUTH_URL` | the public origin the links point at (already required for accounts) |

### What happens when something is wrong

| Situation | Result |
| --- | --- |
| `EMAIL_DELIVERY` unset | Email/password accounts are **off** (the app hides the password screens); Google still works if configured. Nothing is sent. |
| `resend` without `RESEND_API_KEY` or `EMAIL_FROM`; `EMAIL_FROM` not an address; `EMAIL_DELIVERY` anything but `resend`/`dev-outbox` | The server **refuses to start** with a message naming the variable (never a value). It never falls back to another mode. On Cloud Run the previous revision keeps serving. |
| `dev-outbox` in production, or with an `https`/non-localhost `BETTER_AUTH_URL` | The server **refuses to start**. Three independent guards: the loader needs a loopback `http` `BETTER_AUTH_URL`, refuses when `NODE_ENV=production` (the Docker image sets it), and `BETTER_AUTH_URL` must be `https` outside localhost. Tested. |
| The key is revoked or wrong, the domain isn't verified, Resend is down, the daily limit is hit | The server runs, and every send **fails**: logged as `auth.email-failed` at **ERROR** severity with the HTTP status and Resend's error type (`reason`). It never reports a failed send as sent. **The person is not told**: the API must answer identically for every address (otherwise it would reveal who has an account), so a failure can't be shown to them. They see "check your email", and can sign in (right password) to get a new confirmation link, or ask again for a reset. |
| Anything, in any of the above | Logs and API answers never contain the address, the link, the token, the key or the provider's error message. |

Because users can't see a delivery failure, **monitor it**: an alert on `auth.email-failed` (see "Diagnosing"
below) is part of enabling accounts.

### Links and origins

Every emailed link is built from `BETTER_AUTH_URL` and nothing else: a spoofed `Host` or `X-Forwarded-Host`,
a client-supplied `callbackURL` or `redirectTo` cannot move it (all tested). Verification:
`<BETTER_AUTH_URL>/api/auth/verify-email?token=…&callbackURL=<BETTER_AUTH_URL>/v1/auth/email-verified` (24 h).
Reset: `<BETTER_AUTH_URL>/v1/auth/reset-password?token=…` (1 h, once). So `BETTER_AUTH_URL` must be the **public
https origin** (`https://deploy-fitness-app-backend-893557393361.europe-west1.run.app`); a wrong value sends
people to a dead link.

### Setting it up (you do this; a domain you control is required to email other people)

1. **Create a Resend account** at resend.com.
2. **Verify a sending domain** (Resend → Domains → Add domain). Use a subdomain such as `mail.your-domain.com`
   so your main domain's mail is untouched. Resend shows DNS records (SPF and DKIM, and a bounce-handling
   record); add them at your DNS host and wait for "Verified". A DMARC record on the domain is recommended for
   inbox delivery. Without a verified domain, Resend only lets its test sender `onboarding@resend.dev` deliver
   to **your own Resend account address**: fine for a first test, useless for users.
3. **Choose the sender**: `EMAIL_FROM=StokeForm <no-reply@mail.your-domain.com>`. Replies to a `no-reply`
   address go nowhere; use a real mailbox if you want replies.
4. **Create an API key** (Resend → API Keys) with **Sending access** (not full access), restricted to the
   domain if offered. The key is shown once.
5. **Store it**: locally, only in a git-ignored file (see below); on Cloud Run, as the Secret Manager secret
   `RESEND_API_KEY` ([CLOUD_RUN.md](CLOUD_RUN.md#turning-on-accounts)). Never in a chat, a commit, the app, or a plain
   variable.

### Testing it

The test command sends **one** message to the address you name. There is no default recipient and no list:
nothing is sent without `--to`. It needs the email variables but **not** the database or `BETTER_AUTH_SECRET`,
and prints only a masked address, the provider's HTTP status and a reason code.

```powershell
# Locally. Keep real values out of server/.env (which also holds the local dev-outbox setting): put them in a
# separate file that Git ignores (.env.*), for this test only.
notepad server\.env.resend-test        # EMAIL_DELIVERY=resend, RESEND_API_KEY=..., EMAIL_FROM=..., BETTER_AUTH_URL=https://deploy-fitness-app-backend-893557393361.europe-west1.run.app
npm run server:build
node --env-file=server/.env --env-file=server/.env.resend-test server/dist/email-test.mjs --to you@your-domain.com
node --env-file=server/.env --env-file=server/.env.resend-test server/dist/email-test.mjs --to you@your-domain.com --kind verification
node --env-file=server/.env --env-file=server/.env.resend-test server/dist/email-test.mjs --to you@your-domain.com --kind password-reset
Remove-Item server\.env.resend-test
```

- `--kind test` (default): a labelled message with no link.
- `--kind verification` / `password-reset`: the **real template**, with a link shaped like a real one but a fake
  token. Open it: the server's "link not valid" page proves the link reaches `BETTER_AUTH_URL`; it can't confirm
  or change anything. (Open it only after the service has the accounts code deployed.)
- "Accepted by Resend" means Resend took it, **not** that it reached the inbox: check the inbox, the spam
  folder, and the Resend dashboard's Emails log.
- Without `EMAIL_DELIVERY=resend` the command writes to the dev outbox instead (local, nothing sent), which is
  how it was exercised here.

To test with the **production** settings and secret without enabling accounts, run it as a throwaway Cloud
Run job (it ships in the image as `email-test.mjs`), read its log, and delete it:

```powershell
$P='fitness-app-511714'; $R='europe-west1'
$IMAGE = gcloud run services describe deploy-fitness-app-backend --project $P --region $R --format "value(spec.template.spec.containers[0].image)"
gcloud run jobs create stokeform-email-test --project $P --region $R --image $IMAGE `
  --command node --args "email-test.mjs,--to,you@your-domain.com" `
  --set-secrets "RESEND_API_KEY=RESEND_API_KEY:latest" `
  --set-env-vars "^#^EMAIL_DELIVERY=resend#EMAIL_FROM=StokeForm <no-reply@mail.your-domain.com>#BETTER_AUTH_URL=https://deploy-fitness-app-backend-893557393361.europe-west1.run.app" `
  --max-retries 0
gcloud run jobs execute stokeform-email-test --project $P --region $R --wait     # then read the job's log
gcloud run jobs delete stokeform-email-test --project $P --region $R
```

(Written from the gcloud documentation; not run. It needs the `RESEND_API_KEY` secret to exist and the default
compute account to be able to read it.) Then the real flows, once accounts are on: sign up with your own
address, receive and open the confirmation; sign in; **Forgot your password?**, receive the link, set a new
password, sign in. That is the first end-to-end test of real email.

### Diagnosing delivery failures (without exposing anything)

Cloud Logging filter (the same lines appear locally in the server output):

```
resource.type="cloud_run_revision" resource.labels.service_name="deploy-fitness-app-backend" jsonPayload.event="auth.email-failed"
```

Each line has `provider`, `type` (`verification`, `password-reset` or `test`), and `status` + `reason` (a Resend
error type such as `invalid_api_key`) or `errorName` (a network error such as `TimeoutError`). Nothing else.
Successes are `auth.email-sent` with the status. Create a **log-based alert** on the filter above (Logging →
Log-based alerts, or Monitoring) so you hear about failures; users can't see them.

| `status` / `reason` | Likely cause | Fix |
| --- | --- | --- |
| 401, `invalid_api_key` / `missing_api_key` | key wrong, revoked or not set | create a key; add a new `RESEND_API_KEY` secret version; deploy a new revision |
| 401/403, `restricted_api_key` | key lacks sending access | create a key with Sending access |
| 403, `validation_error` | the `EMAIL_FROM` domain isn't verified, or the sandbox sender is mailing someone but you | finish domain verification; use a sender on the verified domain |
| 422/400, `validation_error` | `EMAIL_FROM` or the recipient isn't a valid address | check `EMAIL_FROM` |
| 429 | Resend rate or daily limit | wait; check the plan's limits; a burst of sign-ups can cause it |
| `TimeoutError` / `TypeError` | Resend or the network is unreachable (10 s timeout) | retry; check Resend's status page |
| `auth.email-sent` but nothing arrives | spam folder, SPF/DKIM/DMARC, a bounce, a typo in the recipient | the Resend dashboard's Emails log shows delivered/bounced/complained per message |

When asking someone for help, share only `status`, `reason` and the time. **Never** paste a link, a token, an
address you don't own, or the key.

## Database

The tables are in schema `auth` (`user`, `session`, `account`, `verification`) and are created by this
repository's migration runner (`0006`), not by Better Auth's CLI. `0006` is Better Auth's own generated
SQL; `server/test/auth.spec.ts` asks Better Auth whether the migrated schema matches what it expects and
fails if an upgrade needs changes. After a Better Auth upgrade, generate the difference and add it as a
new migration. `0007` gives every `stokeform` root table a `user_id` foreign key to `auth."user"(id)`
with `ON DELETE CASCADE`, so deleting an account deletes its data. Email verification needs **no schema
change** (it uses the existing `emailVerified` column; links are signed tokens, not rows).

## Google Cloud OAuth client (you do this)

1. Google Cloud Console → **APIs & Services → OAuth consent screen**: set up the app (External; while in
   *Testing*, add your Google account as a test user). Scopes: `openid`, `email`, `profile`.
2. **Credentials → Create credentials → OAuth client ID → Web application** (Web, not Android: the
   browser talks to the server, and the server holds the secret).
3. **Authorized redirect URIs**, exactly:
   - production: `https://deploy-fitness-app-backend-893557393361.europe-west1.run.app/api/auth/callback/google`
     (must match `BETTER_AUTH_URL` exactly: same host, https, no trailing slash)
   - local (also works from a phone through `adb reverse`): `http://localhost:8787/api/auth/callback/google`
   No JavaScript origins are needed.
4. Put the client id in `GOOGLE_CLIENT_ID` and the secret in `GOOGLE_CLIENT_SECRET` (`server/.env`
   locally; Secret Manager on Cloud Run). Never in the app, a commit or a chat.

Without these, the Google button is hidden and `/v1/auth/google/start` answers 503
`google-not-configured` ("Google sign-in isn't available right now.").

## One database

There is a single Neon database and it is the production one: `server/.env` points at it, and so will the
Cloud Run service. There is no separate dev database. Consequences:

- Migrations **0006 and 0007 are already applied** (15 Oct 2026; `npm run server:migrate:status` reports
  "up to date"). They don't need running again before deploying.
- Running the server locally, in the browser or from a phone, creates **real** accounts. Anything
  signed up or signed in with Google while testing is a real row. Use throwaway `example.test` addresses
  for email tests and delete them afterwards (the phone tests did exactly that).
- Email confirmation is the only protection against someone registering another person's address; the
  local dev outbox (`EMAIL_DELIVERY=dev-outbox`) writes confirmation links to local files, so a locally
  registered address is never emailed. Don't register real people's addresses that way.
- Better still, create a Neon **branch** for testing and point `server/.env` at it, keeping the main
  branch for the deployed service. Not done yet.

## Local development (no real emails)

```powershell
npm run server:install
# server/.env (git-ignored): DATABASE_URL, MIGRATION_DATABASE_URL. NOTE: this project has ONE Neon database,
# the production one, so running locally reads and writes real data (see "One database" below),
# BETTER_AUTH_SECRET, BETTER_AUTH_URL=http://localhost:8787,
# EMAIL_DELIVERY=dev-outbox,
# ALLOWED_ORIGINS=http://localhost:4200,http://localhost:8100,https://localhost,
# AUTH_APP_REDIRECT_URLS=com.fitnessapp.app://auth/callback,http://localhost:4200/auth/callback
# and optionally GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.
npm run server:migrate:status   # 0006 and 0007 are already applied: expect "up to date"
npm run server:start            # http://localhost:8787
npm start                       # the app at http://localhost:4200 uses http://localhost:8787 (environment.ts)
```

Then: **You → Account → Create account** with any address (e.g. `you+test1@example.com`; nothing is
sent). The "email" appears as a text file in `server/.dev-outbox/`: open the `http://localhost:8787/...`
link in it in a browser (on the PC, or on the phone when it is connected through `adb reverse`), then
sign in. The files contain working links: they are git-ignored; delete them when done.

To try **password reset**: sign out, **Sign in → Forgot your password?**, enter the address, then open the
newest "Reset your StokeForm password" file in `server/.dev-outbox/` and open its link in a browser (on the
phone too, through `adb reverse`). Choose a new password on that page, then sign in with it in the app. The
page needs `BETTER_AUTH_URL` to be the address the browser uses (`http://localhost:8787`). To preview the
cleanup job: `npm run server:cleanup` (read-only).

Tests need no database, network or credentials: `npm run server:test` runs Better Auth on PGlite with an
in-memory outbox and a simulated Google token endpoint.

## Testing on an Android phone

Two debug builds, both keeping the app ID `com.fitnessapp.app` and the debug signing key, so
`adb install -r` updates the installed app **and keeps its data**:

| Build | API it talks to | Command |
| --- | --- | --- |
| Local | `http://localhost:8787` on your PC, through USB (`adb reverse`) | `npm run android:debug:local` |
| Cloud | the Cloud Run URL in `environment.prod.ts` (accounts show "unavailable" until enabled there) | `npm run android:debug:cloud` |

The script (`scripts/android-debug.ps1`) builds the web app, runs `cap sync`, and runs Gradle; it finds
the JDK and SDK from `JAVA_HOME`/`ANDROID_HOME` or the scoop installs. Debug builds (only) allow plain
`http` to `localhost`/`127.0.0.1` (`android/app/src/debug/res/xml/network_security_config.xml`);
release builds don't contain it.

Local test, step by step:

1. Server running with the local `.env` above (`ALLOWED_ORIGINS` must include `https://localhost`).
2. Phone: Developer options → USB debugging on; connect; accept the prompt. `adb devices` lists it.
3. `adb reverse tcp:8787 tcp:8787` (repeat after reconnecting the cable).
4. `npm run android:debug:local`, then `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.
5. Before anything else, note a workout or weight entry already in the app (to check it survives).
6. You → Account → Create account → "Check your email". Open the newest file in `server/.dev-outbox/`,
   open its link in the phone's Chrome (`http://localhost:8787/...` works through `adb reverse`) or on the PC.
7. In the app: Sign in → Account shows your name and email.
8. Force-stop and reopen the app → still signed in. Turn on airplane mode and reopen → still signed in
   (marked as not yet re-checked). Airplane mode off.
9. Sign out → guest again; the workout/weight entry from step 5 is unchanged.
10. Google (needs the OAuth client with the local redirect URI): Continue with Google → choose the account
    in the browser → the app reopens signed in. Try with a Google account whose address already has a
    confirmed password account: it signs into that same account.

## Enabling accounts in production

**Status: not enabled.** Nothing below has been done. What is true today (read from Google Cloud on 16 Oct 2026):
the service `deploy-fitness-app-backend` (project `fitness-app-511714`, region `europe-west1`) runs an image built
from commit `c1c92a3`, **before any account code existed**; it has no account settings or secrets; it serves the
InBody endpoint, `/health` and `/ready` (200). Details: [CLOUD_RUN.md](CLOUD_RUN.md#this-deployment).

**How accounts stay off until you choose.** The server turns accounts on only when `BETTER_AUTH_SECRET` is set.
Deploying the new build *without* it is inert (account routes answer 503, `/v1/auth/providers` says everything is
off, the app shows accounts as unavailable and runs as a guest app). Adding the settings is the **last step**
(step 9), and removing `BETTER_AUTH_SECRET` switches accounts off again. Production code paths for accounts
that are not enabled can't be reached.

### Prerequisites (tick every box before step 9)

| # | Prerequisite | Status |
| --- | --- | --- |
| P1 | **Which database does the Cloud Run `DATABASE_URL` secret point at?** It must be the Neon database that has migrations 0001–0007 (the one `server/.env` reaches; there is only one). `/ready` = 200 only proves a connection, not which database. See step 1. | **unverified** |
| P2 | **Neon password rotated** after the 15 Oct leak of a connection string in `server/.env.example` (commit `8981114`, pushed; removed from the files but still in Git history), and `DATABASE_URL` (secret and `server/.env`) updated. | **unconfirmed** |
| P3 | **OpenAI key rotated** (it was exposed earlier; Phase 1 notes). | **unconfirmed** |
| P4 | Resend account, **verified sending domain**, sending-only API key, a real `server:email:test` and (after enabling) real sign-up and reset emails received. | not done |
| P5 | Google OAuth client for production with the exact redirect URI below; consent screen named "StokeForm" (it already is, which now matches the app); a decision on one client vs. two (below). | partly (a client exists and works locally; production redirect URI not added) |
| P6 | Secrets created in Secret Manager and readable by the service: `BETTER_AUTH_SECRET` (new, production-only), `RESEND_API_KEY`, `GOOGLE_CLIENT_SECRET`. | not done |
| P7 | The auth work **committed**, reviewed and deployed from a known commit (it is all uncommitted today; the running image is traceable to `c1c92a3`). | not done |
| P8 | **`--max-instances 1`** (the service allows 20 today; Google sign-in fails at random with more than one). | not done |
| P9 | A Neon backup you can restore (branch or restore point) taken before enabling, and an alert on `auth.email-failed`. | not done |

### Production configuration (actual variable names)

| Setting | Kind | Value |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | **secret** (new) | ≥ 32 random characters, generated as in "Configuration"; never the local one. Rotating it signs everyone out. |
| `BETTER_AUTH_URL` | plain (new) | `https://deploy-fitness-app-backend-893557393361.europe-west1.run.app` (the URL the app uses; no path, no trailing slash) |
| `EMAIL_DELIVERY` | plain (new) | `resend` |
| `EMAIL_FROM` | plain (new) | a sender on the verified domain |
| `RESEND_API_KEY` | **secret** (new) | sending-access key |
| `GOOGLE_CLIENT_ID` | plain (new) | the production client's id |
| `GOOGLE_CLIENT_SECRET` | **secret** (new) | the production client's secret |
| Google **authorized redirect URI** | in Google Cloud Console | exactly `https://deploy-fitness-app-backend-893557393361.europe-west1.run.app/api/auth/callback/google` |
| `DATABASE_URL` | **secret** (exists) | Neon **pooled** string; see P1/P2 |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | secret / plain (exist) | unchanged |
| `ALLOWED_ORIGINS` | plain (exists) | `https://localhost,capacitor://localhost`: already right for the Android and iOS apps; it is also the accounts' trusted-origin list. No change. |
| `CLIENT_IP_HEADER` | plain (exists) | `x-forwarded-for`: already set. Keep the service directly on `run.app` (no load balancer in front). |
| `AUTH_APP_REDIRECT_URLS`, `AUTH_SESSION_DAYS` | optional | leave unset (deep link `com.fitnessapp.app://auth/callback`, 30 days) |
| Scaling | service setting | `--max-instances 1` (min 0 is fine) |
| Runtime account | exists | `893557393361-compute@developer.gserviceaccount.com`: needs `roles/secretmanager.secretAccessor` on each **new** secret (it already has it on the two existing ones) |

One Google client or two? The client in `server/.env` is a **real** client that also holds the local redirect URI
(`http://localhost:8787/...`). Reusing it for production means one secret lives in two places (your `.env` and
Secret Manager). A separate production client (its own id and secret, only the production redirect URI) is
safer: a leaked local secret can't impersonate production. Either works; the consent screen is shared per project.

### Ordered plan

Do these in order; stop at any failed check. Steps 1–8 change nothing that users can see.

1. **Confirm the database (P1).** Compare what production reads with what you migrated, without printing it:
   ```powershell
   $env:DATABASE_URL = gcloud secrets versions access latest --secret DATABASE_URL --project fitness-app-511714
   node server/dist/migrate.mjs status --allow-pooled        # expect 0001-0007 applied, "Database is up to date"
   Remove-Item Env:DATABASE_URL
   ```
   If this is a different database and 0006/0007 are pending, **stop**: apply them to it first (migrations
   0006 then 0007, in that order, after a Neon backup; see below), then continue. Do not enable accounts against
   a database without them.
2. **Rotate and update credentials (P2, P3)** if not already done: Neon password reset, new `DATABASE_URL`
   secret version; OpenAI key revoked and replaced. ([Key rotation](CLOUD_RUN.md#key-rotation).)
3. **Take a Neon backup (P9)** (a branch or restore point of the production branch).
4. **Set up and test email (P4)** with `server:email:test` and the throwaway job ([Testing it](#testing-it)). Do not
   continue until a real message arrives from your verified sender. (Alternative: launch with Google only: leave
   `EMAIL_DELIVERY` unset and email/password stays off; the cleanup job and reset then have nothing to do.)
5. **Google (P5):** add the production redirect URI (exactly as in the table) to the OAuth client you chose,
   confirm the consent screen is named "StokeForm" (it is).
6. **Create the secrets (P6)** and grant the service account access ([commands](CLOUD_RUN.md#turning-on-accounts)).
7. **Commit and deploy the new build inert (P7):** `gcloud run deploy deploy-fitness-app-backend --source . --project fitness-app-511714 --region europe-west1`
   with **no** account variables. Check `/health` 200, `/ready` 200, `/v1/auth/providers` all `false`,
   `/v1/auth/me` 503, a synthetic InBody extraction 200, and that the app still works as a guest. Roll back by
   routing traffic to the previous revision if anything is off.
8. **Create the cleanup job in preview mode** ([commands](CLOUD_RUN.md#scheduled-cleanup-of-unconfirmed-accounts)),
   run it once and read the preview. Don't schedule or `--apply` yet.
9. **Turn accounts on** with the single update command in [CLOUD_RUN.md](CLOUD_RUN.md#turning-on-accounts)
   (adds the secrets and variables and sets `--max-instances 1`, P8). Then verify:
   - `/v1/auth/providers` shows `"accounts":true`, `"emailPassword":true`, and `"google":true`; `/v1/auth/me` is 401; `/ready` is 200;
   - on the phone, with a release-style build (`npm run android:debug:cloud`): create an account with **your
     own** address, receive the real email, confirm, sign in, sign out; **Forgot your password?** receives a
     real link and sets a new password; Google sign-in works (including with the app closed while the browser
     is open); your existing local data is unchanged;
   - Cloud Logging shows `auth.email-sent` and no `auth.email-failed`; the alert exists (P9).
10. **Only then** review the cleanup preview again and decide on `--apply` and the weekly schedule.

### Migrations 0006 and 0007 (already applied to the database `server/.env` reaches)

- **0006** creates schema `auth` with `user`, `session`, `account`, `verification` (Better Auth's own SQL).
- **0007** adds a `FOREIGN KEY (user_id) REFERENCES auth."user"(id) ON DELETE CASCADE` to the 10 root `stokeform`
  tables. **Order matters** (0007 needs 0006's table; the runner enforces it).
- **Ownership and deletion:** every data row must belong to a real account, and **deleting an account row
  deletes all of that person's data** in one cascade (and their sessions and sign-in methods). No endpoint
  deletes accounts today, but the cleanup job does delete accounts, which is why it never touches an account
  that owns data, has a session, or is linked to Google.
- **Safe to apply:** additive (tables and constraints; no existing row changes), applied cleanly because the
  `stokeform` tables are empty (nothing is synced yet). Not needed to run again here (P1 confirms it).
- If they ever must be applied to another database: Neon backup first, `npm run server:migrate:status`, then
  `npm run server:migrate` with the **direct** (non-pooled) string as `MIGRATION_DATABASE_URL`, then status again.

### Rollback

- **Switch accounts off now:** route traffic to the previous revision
  (`gcloud run services update-traffic deploy-fitness-app-backend --project fitness-app-511714 --region europe-west1 --to-revisions PREVIOUS=100`),
  or remove `BETTER_AUTH_SECRET`. Account routes answer 503, the app shows accounts as unavailable, and
  everything else keeps working; phones keep their stored token but `/me` can't confirm it, so they show the
  account as not re-checked.
- **Migrations don't need rolling back:** 0006/0007 add unused tables and constraints that the previous code
  ignores. Never delete their history rows by hand. If they must truly go, use a Neon restore point from before.
- **Stop the cleanup:** pause the Scheduler job; accounts it already deleted come back only from a Neon backup.
- **Rotating `BETTER_AUTH_SECRET`** signs everyone out and voids unopened confirmation and reset links; people
  sign in again and request new links.
- **Email trouble:** the service keeps working; fix the key/domain, deploy a new revision. Pending confirmations
  are re-sent when the person signs in.

### Risks that remain after all of the above

- Real email delivery and the production deployment are **untested**; the first real run is step 9.
- A failed send is invisible to the person (by design): rely on the alert.
- One instance means a restart or deploy can interrupt a Google sign-in in progress; counters reset on cold start.
- Unconfirmed accounts keep addresses reserved until the cleanup job runs (they can't sign in).
- The database is shared with local runs: keep local testing on throwaway `@example.test` accounts, or create a
  Neon branch for development.

## Known limits

- **The cleanup of unconfirmed accounts is a job you must schedule** ("Cleaning up unconfirmed accounts");
  until it is, leftovers stay (harmless, since they can't sign in). It has run against the database by hand
  only with throwaway rows.
- **Password-reset links already requested stay valid** until they expire (at most an hour), each usable
  once, even after another reset succeeds; they go to the same mailbox. Reset has been exercised with the
  dev outbox only, not through real email delivery.
- **No "change password" while signed in yet** (reset by email is the only way), and no account deletion.
- **Custom-scheme deep link.** Another app could register `com.fitnessapp.app://` too. The verifier
  makes an intercepted code useless, but Android App Links (a verified `https` link) would be stronger.
- **Single instance required** (in-memory hand-off codes and rate limits). The deployed service currently allows
  **20**: it must be set to 1 when accounts are enabled ([CLOUD_RUN.md](CLOUD_RUN.md#instances)).
- **Email failures are invisible to the person** (by design, so the API can't reveal which addresses exist).
  They are logged as `auth.email-failed` at ERROR severity; set up the alert before enabling accounts.
- **No load balancer in front of Cloud Run:** the rate limits read `X-Forwarded-For` and only trust a single
  address; an extra hop would put every client in one shared strict bucket (see CLOUD_RUN.md).
- **Google sign-in** was verified end to end on a physical Android phone by the project owner (system
  browser, return to the app, signed-in session), with the OAuth consent screen published to production so
  any Google account can sign in. The automated tests only simulate Google; the phone test is the real check.
- **Not yet exercised with real credentials:** real email delivery through Resend (no key, sender or test
  recipient exists). The automated tests simulate it; the dev outbox was used with the real database (see
  "One database") and the phone. See [Setting up real email](#setting-up-real-email-resend).
- The Google consent screen is named "StokeForm", matching the app. Its logo is optional: upload
  `src/assets/brand/stokeform-icon.svg` (as a PNG, 120 x 120) in the OAuth consent screen settings if you want it shown.
