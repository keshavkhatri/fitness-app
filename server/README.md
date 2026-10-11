# InBody extraction server

The app's own server for AI-assisted InBody onboarding. It holds the OpenAI
API key; the app never does. One endpoint:

`POST /v1/inbody-extractions` — the raw report image as the body
(`Content-Type: image/png | image/jpeg | image/webp`), answered with a
validated `inbody-extraction.v1` JSON document, or
`{ "error": { "code", "message" } }`. `GET /health` answers `{ "status": "ok" }`.

## Run locally

```sh
cp server/.env.example server/.env   # then fill in OPENAI_API_KEY and OPENAI_MODEL
npm run server:start                 # builds to server/dist and listens on 127.0.0.1:8787
```

`server/.env` and `server/dist` are git-ignored. Development builds of the app
call `http://localhost:8787/v1/inbody-extractions`; production builds hide the
upload option (`INBODY_EXTRACTION_ENDPOINT` is null) until hosting exists.

## Configuration

Environment variables only (`server/src/config.ts`). Invalid values stop the
server at startup with the variable's name, never its value.

| Variable | Default | |
| --- | --- | --- |
| `OPENAI_API_KEY` | — | Required for extraction. Server-side only: never in the app, its environment files or a commit. |
| `OPENAI_MODEL` | — | Required. A vision model supporting Structured Outputs on the Responses API. |
| `OPENAI_MAX_OUTPUT_TOKENS` | 8000 | 1000–64000 |
| `OPENAI_TIMEOUT_MS` | 90000 | 5000–300000 |
| `INBODY_MAX_UPLOAD_BYTES` | 8 MiB | Up to 20 MiB; the app checks 8 MiB before sending. |
| `MAX_CONCURRENT_EXTRACTIONS` | 4 | 1–100. Extractions in progress at once; more get 503 `server-busy` (with `Retry-After`) before any upload is read. Bounds memory: each holds one upload. |
| `ALLOWED_ORIGINS` | none | Exact origins, comma-separated; `*` is refused. Capacitor: `capacitor://localhost` (iOS), `https://localhost` (Android). |
| `RATE_LIMIT_PER_CLIENT` / `RATE_LIMIT_WINDOW_MS` | 5 / 15 min | Attempts per client IP. |
| `DAILY_EXTRACTION_LIMIT` | 200 | Provider calls per day across all clients: a cost ceiling. |
| `CLIENT_IP_HEADER` | none | Only behind a trusted proxy that sets it (e.g. `x-forwarded-for`). |
| `HOST` / `PORT` | 127.0.0.1 / 8787 | |

Without a key or model the server still starts, logs `server.not-configured`
and answers every extraction with 503 `not-configured` without reading the
upload.

## Security and privacy

- The key is only sent to `api.openai.com` in the `Authorization` header; it
  is never returned, logged or included in error messages.
- Uploads: declared type must be PNG/JPEG/WEBP and match the file signature;
  the body is streamed and reading stops at the size limit (413).
- At most `MAX_CONCURRENT_EXTRACTIONS` uploads are processed at once: a
  request beyond that gets 503 `server-busy` before its upload is read. The
  slot is released on every outcome (success, rejection, error, aborted upload,
  provider timeout). Like the rate limits, the count is per process.
- CORS: only the configured origins; others get 403. Requests without an
  `Origin` (non-browser clients) are served under the same rate limits.
- Provider errors are mapped to fixed codes and messages; provider text is
  never passed on (it may echo the request). Requests use `store: false`.
- The model's answer is validated against the strict `inbody-extraction.v1`
  contract before it is returned, and the app validates it again.
- Images and extractions live in memory for the request only: nothing is
  written to disk, and logs carry event codes, statuses and durations only.
- The server saves nothing: the profile is created only after the user reviews
  the values in the app.

## Before production

Not deployed yet. Hosting still needs: HTTPS, the key in the platform's secret
store (not a file), the production app origins in `ALLOWED_ORIGINS`,
`CLIENT_IP_HEADER` matching the proxy, and a shared rate-limit store if more
than one instance runs (limits are per process). Then set the production
endpoint for `INBODY_EXTRACTION_ENDPOINT`.

## Tests

`npm run server:test` (Vitest, Node environment). The OpenAI client is
replaced by a fake: no network, no real key; the fixture key is a placeholder.
