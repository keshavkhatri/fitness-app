# Deploying the InBody server to Google Cloud Run

This prepares and documents the deployment; nothing here has been deployed. The steps
create cloud resources and may incur charges (Cloud Run, Cloud Build, Artifact Registry
and Secret Manager all have free tiers, but check your plan). Run them yourself.

What ships: the root [`Dockerfile`](../Dockerfile), a two-stage build. A pinned `esbuild`
(from `server/package-lock.json`) bundles the server into one file; the runtime image is
`node:24-slim` plus that file, running as the unprivileged `node` user. The server has no
npm runtime dependencies. Only `server/` and `src/app/domain/` are sent to the build
(`.dockerignore`, `.gcloudignore`); `.env` files, report photos, tests and `node_modules`
are not.

## Configuration

Environment variables only, as in [README.md](README.md). On Cloud Run:

| Variable | How | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY` | **Secret Manager** → `--set-secrets` | Never `--set-env-vars`, a file, an image layer or the app. |
| `OPENAI_MODEL` | `--set-env-vars` | A vision model that supports Structured Outputs on the Responses API. |
| `ALLOWED_ORIGINS` | `--set-env-vars` | Exact origins. Android app: `https://localhost`; iOS: `capacitor://localhost`. `*` is refused. |
| `CLIENT_IP_HEADER` | `--set-env-vars` | `x-forwarded-for`, so rate limits are per client and not per Google proxy. The server uses the **last** entry, the one Google's front end appends. Untested until deployed: confirm by sending requests from two networks. Behind your own load balancer the last entry is the balancer; adjust before relying on it. |
| `PORT`, `HOST` | leave unset | Cloud Run supplies `PORT` (the image defaults to 8080). `NODE_ENV=production`, set by the Dockerfile, makes the server bind `0.0.0.0`. |
| Limits (`RATE_LIMIT_*`, `DAILY_EXTRACTION_LIMIT`, `MAX_CONCURRENT_EXTRACTIONS`, `INBODY_MAX_UPLOAD_BYTES`) | optional | Keep the defaults unless you have a reason. |

Rate, daily and concurrency limits live in each instance's memory. Until a shared store
exists: deploy with `--max-instances 1`, and know that an instance that scales to zero
starts with its counters reset, so the daily limit is a soft ceiling. Also set a monthly
spend limit on the OpenAI project; that is the real cost cap.

## Build and test the container locally (Windows)

Docker Desktop must be running.

```powershell
docker build -t pulseform-inbody:local .

# Placeholder values: the key is fake, so extraction reaches OpenAI and is refused (a 502),
# which still proves the whole path. Omit both OPENAI_ variables to get 503 not-configured.
docker run --rm -p 8080:8080 `
  -e OPENAI_MODEL=placeholder-model -e OPENAI_API_KEY=sk-placeholder `
  -e ALLOWED_ORIGINS=https://localhost pulseform-inbody:local
```

In a second terminal:

```powershell
curl.exe -i http://localhost:8080/health                       # 200 {"status":"ok"}
curl.exe -i -X POST -H "Content-Type: text/plain" --data "x" http://localhost:8080/v1/inbody-extractions   # 415
curl.exe -i -X POST -H "Origin: https://evil.example" -H "Content-Type: image/png" --data-binary "@tiny.png" http://localhost:8080/v1/inbody-extractions   # 403
```

To test with your real key, pass `--env-file server/.env` instead of the `-e` flags. Don't
push or share an image run that way, and don't paste the file into a chat or a commit.

## Deploy

Install the Google Cloud CLI, then `gcloud auth login` and `gcloud config set project <PROJECT_ID>`.

1. **Enable the services** (first time):
   ```powershell
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
   ```
2. **Create the secret.** Easiest: Cloud Console → Secret Manager → Create secret → name
   `openai-api-key`, paste the key. From a terminal instead (no key in the command line
   or shell history):
   ```powershell
   gcloud secrets create openai-api-key --replication-policy=automatic
   notepad key.txt          # paste the key, save
   gcloud secrets versions add openai-api-key --data-file=key.txt
   Remove-Item key.txt
   ```
3. **Let the service read it.** Cloud Run runs as the project's default compute service
   account unless you choose another:
   ```powershell
   gcloud secrets add-iam-policy-binding openai-api-key `
     --member="serviceAccount:<PROJECT_NUMBER>-compute@developer.gserviceaccount.com" `
     --role="roles/secretmanager.secretAccessor"
   ```
4. **Deploy** from the repository root (builds the Dockerfile in Cloud Build):
   ```powershell
   gcloud run deploy pulseform-inbody --source . --region <REGION> `
     --allow-unauthenticated --max-instances 1 --concurrency 8 --memory 512Mi --timeout 120 `
     --set-secrets "OPENAI_API_KEY=openai-api-key:latest" `
     --set-env-vars "^@^OPENAI_MODEL=<MODEL>@ALLOWED_ORIGINS=https://localhost,capacitor://localhost@CLIENT_IP_HEADER=x-forwarded-for"
   ```
   `^@^` makes `@` the separator so the commas inside `ALLOWED_ORIGINS` survive.
   `--allow-unauthenticated` is needed until the app has accounts: the endpoint is
   protected only by CORS, the size, rate and daily limits, and your OpenAI spend cap.
   The request timeout (120 s) matches the server's own.
5. **Test the deployed service** (`<URL>` is printed by the deploy):
   ```powershell
   curl.exe -i <URL>/health
   curl.exe -i -X POST -H "Origin: https://localhost" -H "Content-Type: image/png" `
     --data-binary "@synthetic-report.png" <URL>/v1/inbody-extractions
   ```
   Use a synthetic image, not a real person's report. A 200 returns the
   `inbody-extraction.v1` JSON; 503 `not-configured` means the secret or `OPENAI_MODEL` is missing.
6. **Point the app at it**, then rebuild: set `inbodyExtractionEndpoint` in
   `src/environments/environment.prod.ts` to `<URL>/v1/inbody-extractions` (a public value,
   never a key). Until you do, production builds hide the upload option.

To update the key later, add a new secret version and redeploy (or deploy a new revision).
To stop everything: `gcloud run services delete pulseform-inbody --region <REGION>`.

## Key rotation

If an OpenAI key was ever exposed (pasted into chat, a commit, a screenshot or a shared
file) it must be **revoked in the OpenAI dashboard** and replaced with a new one; rotation
was not confirmed when this was written. Never reuse the old key here. The new key goes
only into Secret Manager (or a git-ignored `server/.env` for local runs).
