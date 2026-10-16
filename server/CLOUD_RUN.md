# The Pulseform API on Google Cloud Run

The service **already exists** and is serving the InBody extraction endpoint, `/health` and `/ready`. This
guide covers updating it, turning on accounts later, and the cleanup job. Nothing in the accounts sections has
been run: the deployed image is from before authentication existed (it answers 404 for `/v1/auth/providers`).
The steps change cloud resources and may incur charges; you run them yourself.

## This deployment

Read from Google Cloud on 16 Oct 2026 (names and settings only; no secret values were read). Re-check with
the describe command below before relying on it.

| | |
| --- | --- |
| Service | `deploy-fitness-app-backend`, region **`europe-west1`** (keep it: do not recreate the service to change region) |
| Project | ID **`fitness-app-511714`** (number `893557393361`) |
| Public URL used by the app | `https://deploy-fitness-app-backend-893557393361.europe-west1.run.app` (the older-style `https://deploy-fitness-app-backend-oqlttiq7ua-ew.a.run.app` also reaches it) |
| Runs as | the default compute service account `893557393361-compute@developer.gserviceaccount.com` |
| Scaling | **max instances 20**, min 0, concurrency 80, timeout 300 s, 512 Mi. For accounts this must become **max 1** (see "Instances") |
| Plain variables | `NODE_ENV`, `OPENAI_MODEL`, `ALLOWED_ORIGINS` (`https://localhost`, `capacitor://localhost`), `CLIENT_IP_HEADER` (`x-forwarded-for`), `DATABASE_POOL_MAX`, `DATABASE_IDLE_TIMEOUT_MS`, `DATABASE_CONNECT_TIMEOUT_MS`, `DATABASE_STATEMENT_TIMEOUT_MS` |
| Secrets (Secret Manager) | **`OPENAI_API_KEY`**, **`DATABASE_URL`** (upper-case names; readable by the default compute account) |
| Access | public (`run.googleapis.com/invoker-iam-disabled`: no sign-in needed to call it; protection is CORS, size and rate limits, and the OpenAI spend cap) |
| Image | built from commit `c1c92a3`: **no accounts code** |
| Not present | any `BETTER_AUTH_*`, `GOOGLE_*`, `RESEND_*`, `EMAIL_*` setting; any Cloud Run job; Cloud Scheduler API (not enabled) |

> **Footgun:** the gcloud default project on this machine is a different one (`wallpaper-generator-509111`).
> Every command below passes `--project fitness-app-511714`. Don't drop it, and don't "enable the API?" when
> gcloud offers to: that would be the wrong project.

```powershell
# Read-only: what is deployed right now (variable VALUES are printed for plain variables; secrets show only their names).
gcloud run services describe deploy-fitness-app-backend --region europe-west1 --project fitness-app-511714
```

## What ships

The root [`Dockerfile`](../Dockerfile), a two-stage build. A pinned `esbuild` (from `server/package-lock.json`)
bundles four files, and the runtime image is `node:24-slim` plus those files, running as the unprivileged
`node` user (no `npm install` at runtime; `pg`, `better-auth` and `kysely` are bundled in):

| File | What it is |
| --- | --- |
| `main.mjs` | the API server (the container's command) |
| `migrate.mjs` | the migration tool ([DATABASE.md](DATABASE.md)); never run by the server |
| `cleanup.mjs` | the unconfirmed-account cleanup job ([AUTH.md](AUTH.md#cleaning-up-unconfirmed-accounts)); previews unless `--apply` |
| `email-test.mjs` | sends one test email to an address you name ([AUTH.md](AUTH.md#setting-up-real-email-resend)) |

Only `server/` and `src/app/domain/` are sent to the build (`.dockerignore`, `.gcloudignore`); `.env` files,
report photos, tests and `node_modules` are not.

## Configuration

Environment variables only, as in [README.md](README.md). On Cloud Run:

| Variable | How | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY` | **Secret Manager** (exists) | Never a plain variable, a file, an image layer or the app. |
| `OPENAI_MODEL` | plain (exists) | A vision model that supports Structured Outputs on the Responses API. |
| `ALLOWED_ORIGINS` | plain (exists) | Exact origins. Already `https://localhost,capacitor://localhost`: right for the Android and iOS apps and needs no change. Also the accounts' trusted-origin list. `*` is refused. |
| `CLIENT_IP_HEADER` | plain (exists) | `x-forwarded-for`. The InBody limits use the **last** entry, the one Google's front end appends. Better Auth's limits read the same header and only trust it when it holds a single address; a forged extra entry lands in one shared strict bucket (tested), so spoofing can't evade them. **If you ever put a load balancer in front of the service, the header gains an entry: all clients then share that strict bucket and sign-ins start failing with 429. Change the setup before doing that.** |
| `DATABASE_URL` | **Secret Manager** (exists) | Neon's **pooled** string. See "Before enabling accounts" for the check that it is the database you expect. |
| `BETTER_AUTH_SECRET` | **Secret Manager** (new) | Turns accounts on. Unset: account routes answer 503 and the app works without accounts. |
| `BETTER_AUTH_URL` | plain (new) | The service's public origin, no path: `https://deploy-fitness-app-backend-893557393361.europe-west1.run.app`. Google's redirect URI and every emailed link are built from it. |
| `EMAIL_DELIVERY`, `EMAIL_FROM` | plain (new) | `resend` and a sender on a domain verified in Resend. Unset: email/password stays off (Google only). `dev-outbox` is refused here. |
| `RESEND_API_KEY` | **Secret Manager** (new) | With `EMAIL_DELIVERY=resend`. A key with sending permission only. |
| `GOOGLE_CLIENT_ID` | plain (new) | With `GOOGLE_CLIENT_SECRET`. |
| `GOOGLE_CLIENT_SECRET` | **Secret Manager** (new) | Never in the app or a plain variable. |
| `AUTH_APP_REDIRECT_URLS`, `AUTH_SESSION_DAYS` | optional | Defaults (the Android deep link, 30 days) are right for production. |
| `PORT`, `HOST` | leave unset | Cloud Run supplies `PORT`. `NODE_ENV=production` makes the server bind `0.0.0.0`. |
| Limits (`RATE_LIMIT_*`, `DAILY_EXTRACTION_LIMIT`, `MAX_CONCURRENT_EXTRACTIONS`, `INBODY_MAX_UPLOAD_BYTES`) | optional | Keep the defaults unless you have a reason. |

### Instances

Rate limits, the daily extraction limit and **the Google sign-in hand-off codes live in each instance's
memory**. The app finishes Google sign-in by redeeming a one-time code on the instance that issued it; with two
instances that exchange fails at random. So accounts need **`--max-instances 1`** (the service currently allows
20: **change it when enabling accounts**). Consequences to accept: counters reset when the instance scales to
zero (the daily extraction limit is a soft ceiling), a deploy briefly runs a second revision, and a person who
starts Google sign-in during a deploy may have to try again. `--min-instances 1` avoids cold starts (Neon wakes
in about 3 s on the first query) at a small standing cost. Also keep a monthly spend limit on the OpenAI project:
that is the real cost cap.

## Build and test the container locally (Windows)

Docker Desktop must be running.

```powershell
docker build -t pulseform-api:local .

# Placeholder values: the key is fake, so extraction reaches OpenAI and is refused (a 502),
# which still proves the whole path. Omit both OPENAI_ variables to get 503 not-configured.
docker run --rm -p 8080:8080 `
  -e OPENAI_MODEL=placeholder-model -e OPENAI_API_KEY=sk-placeholder `
  -e ALLOWED_ORIGINS=https://localhost pulseform-api:local
```

In a second terminal:

```powershell
curl.exe -i http://localhost:8080/health                       # 200 {"status":"ok"}
curl.exe -i -X POST -H "Content-Type: text/plain" --data "x" http://localhost:8080/v1/inbody-extractions   # 415
curl.exe -i -X POST -H "Origin: https://evil.example" -H "Content-Type: image/png" --data-binary "@tiny.png" http://localhost:8080/v1/inbody-extractions   # 403
```

To test with your real key, pass `--env-file server/.env` instead of the `-e` flags. Don't push or share an
image run that way, and don't paste the file into a chat or a commit.

## Updating the existing service

Use **`--update-*`** flags (they change only what you name). `--set-env-vars` / `--set-secrets` **replace the
whole list**: one slip and `OPENAI_API_KEY` or `DATABASE_URL` is dropped from the live service. Run from the
repository root (Cloud Build uses the Dockerfile):

```powershell
$P = 'fitness-app-511714'; $R = 'europe-west1'; $S = 'deploy-fitness-app-backend'

# A new build with NO account settings: the new code is inert (account routes answer 503, providers all false),
# everything that works today keeps working. Safe first step; it can be rolled back by routing traffic back.
gcloud run deploy $S --source . --project $P --region $R
```

Then check (nothing here needs accounts):

```powershell
$U = 'https://deploy-fitness-app-backend-893557393361.europe-west1.run.app'
curl.exe -i "$U/health"                       # 200 {"status":"ok"}
curl.exe -i "$U/ready"                        # 200 {"status":"ready"} (a Neon wake-up can take ~3 s)
curl.exe -s "$U/v1/auth/providers"            # {"accounts":false,"emailPassword":false,"google":false}
curl.exe -i "$U/v1/auth/me"                   # 503 auth-not-configured
curl.exe -i -X POST -H "Origin: https://localhost" -H "Content-Type: image/png" `
  --data-binary "@synthetic-report.png" "$U/v1/inbody-extractions"      # 200 inbody-extraction.v1 (synthetic image only)
```

To stop everything: `gcloud run services delete deploy-fitness-app-backend --region europe-west1 --project fitness-app-511714`
(not recommended: the URL is in the app).

### Turning on accounts

Not done. The prerequisites, the order and the rollback are in
[AUTH.md, "Enabling accounts in production"](AUTH.md#enabling-accounts-in-production); do not start before
every box there is ticked. The commands, once you are:

```powershell
$P = 'fitness-app-511714'; $R = 'europe-west1'; $S = 'deploy-fitness-app-backend'
$SA = '893557393361-compute@developer.gserviceaccount.com'

# 1. Secrets. Console is easiest (Secret Manager > Create secret). From a terminal, with no value in the
#    command line or history (paste into the file, save, then delete it):
gcloud secrets create BETTER_AUTH_SECRET --project $P --replication-policy=automatic
notepad secret.txt                                   # paste the generated value (AUTH.md shows how), save
gcloud secrets versions add BETTER_AUTH_SECRET --project $P --data-file=secret.txt
Remove-Item secret.txt
# ...the same for RESEND_API_KEY and GOOGLE_CLIENT_SECRET. Then let the service read each:
foreach ($n in 'BETTER_AUTH_SECRET','RESEND_API_KEY','GOOGLE_CLIENT_SECRET') {
  gcloud secrets add-iam-policy-binding $n --project $P --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
}

# 2. One update: add the account settings and cap instances at 1. The delimiter ^#^ is used because
#    EMAIL_FROM contains '@' and spaces. Secrets keep their upper-case names, like the existing two.
gcloud run services update $S --project $P --region $R --max-instances 1 `
  --update-secrets "BETTER_AUTH_SECRET=BETTER_AUTH_SECRET:latest,RESEND_API_KEY=RESEND_API_KEY:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest" `
  --update-env-vars "^#^BETTER_AUTH_URL=https://deploy-fitness-app-backend-893557393361.europe-west1.run.app#EMAIL_DELIVERY=resend#EMAIL_FROM=Pulseform <no-reply@YOUR-DOMAIN>#GOOGLE_CLIENT_ID=YOUR-CLIENT-ID"
```

`gcloud run services update` creates a new revision and shifts traffic to it, so this is the moment accounts
turn on. To enable one sign-in method at a time, add only its variables first (Google: `GOOGLE_*`; email:
`EMAIL_*` and `RESEND_API_KEY`), but `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` are needed for either. The
server refuses to start (and Cloud Run keeps serving the previous revision) if a value is malformed: the
error names the variable, never its value.

Verify as in AUTH.md, then **back out** if needed by routing traffic to the previous revision:

```powershell
gcloud run revisions list --service $S --project $P --region $R          # find the previous revision
gcloud run services update-traffic $S --project $P --region $R --to-revisions PREVIOUS-REVISION=100
```

(or `--remove-env-vars BETTER_AUTH_URL,... --remove-secrets BETTER_AUTH_SECRET,...` to switch accounts off on
the current revision: with no `BETTER_AUTH_SECRET`, account routes answer 503 and nothing else changes.)

### Scheduled cleanup of unconfirmed accounts

Not set up, and nothing here has been run. `cleanup.mjs` deletes old, never-confirmed password accounts (rules,
safety and options: [AUTH.md](AUTH.md#cleaning-up-unconfirmed-accounts)). Run it as a **Cloud Run job**
triggered by **Cloud Scheduler**, not inside the API: instances scale to zero, so an in-process timer would not
fire. It is idempotent, bounded (50 per run, accounts at least 7 days old by default), and **previews unless
`--apply` is passed**. It needs only the database secret.

> **Never switch it to `--apply` before you have read a preview of what it would delete.** The database is the
> real one (there is no separate dev database), and so is the one `npm run server:cleanup:apply` reaches from
> this repository. Deleted accounts cannot be restored except from a Neon backup.

The Scheduler API is **not enabled** in the project, and the job and its schedule need a small service account:

```powershell
$P = 'fitness-app-511714'; $R = 'europe-west1'
$IMAGE = gcloud run services describe deploy-fitness-app-backend --project $P --region $R --format "value(spec.template.spec.containers[0].image)"

# 0. Once: enable Scheduler (the project already has Cloud Run and Secret Manager).
gcloud services enable cloudscheduler.googleapis.com --project $P

# 1. The job, from the SAME image as the service, in PREVIEW mode (no --apply): it only logs what it would delete.
gcloud run jobs create pulseform-cleanup --project $P --region $R --image $IMAGE `
  --command node --args cleanup.mjs `
  --set-secrets "DATABASE_URL=DATABASE_URL:latest" `
  --max-retries 0 --task-timeout 120s

# 2. Run it once and read the log: "would delete ..." lines (masked) and an auth.cleanup summary line.
gcloud run jobs execute pulseform-cleanup --project $P --region $R --wait
# Logs: Cloud Console > Cloud Run > Jobs > pulseform-cleanup > Logs. Read them before going further.

# 3. Only when the preview lists nothing you would miss, and you have a Neon backup/branch, switch to delete:
gcloud run jobs update pulseform-cleanup --project $P --region $R --args cleanup.mjs,--apply

# 4. A service account that may only start this job, and a weekly schedule (Mondays 04:00).
gcloud iam service-accounts create pulseform-scheduler --project $P --display-name "Runs the cleanup job"
gcloud run jobs add-iam-policy-binding pulseform-cleanup --project $P --region $R `
  --member "serviceAccount:pulseform-scheduler@$P.iam.gserviceaccount.com" --role roles/run.invoker
gcloud scheduler jobs create http pulseform-cleanup-weekly --project $P --location $R --schedule "0 4 * * 1" `
  --uri "https://run.googleapis.com/v2/projects/$P/locations/$R/jobs/pulseform-cleanup:run" --http-method POST `
  --oauth-service-account-email "pulseform-scheduler@$P.iam.gserviceaccount.com"
```

Notes: the job uses the default compute account, which can already read `DATABASE_URL`. **After every service
deploy, update the job to the new image** (`gcloud run jobs update pulseform-cleanup --project $P --region $R
--image $IMAGE`) or it keeps running the old cleanup rules. These commands are written from the gcloud
documentation and have **not been run**: check the flags with `gcloud run jobs create --help` and
`gcloud scheduler jobs create http --help` for your CLI. To stop it: `gcloud scheduler jobs pause
pulseform-cleanup-weekly --location europe-west1 --project fitness-app-511714`. Nothing else triggers deletion.

## Key rotation

Rotate and replace, never reuse, any secret that was ever exposed (pasted into chat, a commit, a screenshot or
a shared file): the **OpenAI key** (revoke it in the OpenAI dashboard), the **Neon password** (reset the role's
password in Neon, then add a new version of the `DATABASE_URL` secret and update `server/.env`), a **Resend
key**, a **Google client secret**, and `BETTER_AUTH_SECRET` (rotating it signs everyone out and voids unopened
links). Add a new secret version and deploy a new revision (or `gcloud run services update` any value) to pick
it up. Rotation of the OpenAI key and of the Neon password after the 15 Oct 2026 `.env.example` leak (commit
`8981114`, since removed from the files but still in Git history) **was not confirmed** when this was written.
