# Database (Neon PostgreSQL)

The server can connect to PostgreSQL, and the repository holds the schema and a migration tool.
**Only accounts use the database** (sign-up, sign-in and sessions in schema `auth`; see [AUTH.md](AUTH.md)).
There are no data endpoints and no localStorage migration yet: the `pulseform` tables stay empty. What
exists: a connection pool, `GET /ready`, versioned migrations, and the schema in
[`docs/database-schema.md`](../docs/database-schema.md). Nothing here creates cloud resources.

## How it fits

| Piece | File |
| --- | --- |
| Connection settings and TLS policy | `src/db/database-config.ts` |
| Pool, readiness check | `src/db/database.ts` |
| Migration engine (history, checksums, lock, rollback) | `src/db/migrations.ts` |
| Migration command and SQL file reader | `tools/migrate.ts`, `tools/migration-files.ts` |
| The schema | `migrations/0001…0005_*.sql` (`pulseform`), `0006_auth_tables.sql` (Better Auth's `auth` tables), `0007_user_ownership.sql` (foreign keys to `auth."user"`) |

The API server never runs migrations and never reads files: migrations are an explicit step, run once
per release by you (or by a Cloud Run job), not by every instance at startup.

## Set up Neon (you do this; it creates a cloud resource)

1. Create a Neon project (a region near your Cloud Run region, e.g. `eu-west-1`/`eu-central-1` for `europe-west1`).
   The default database (`neondb`) and role are fine to start.
2. In the Neon console, **Connect** shows two connection strings for the same database. You need both:

   | String | Host looks like | Used for |
   | --- | --- | --- |
   | **Pooled** | `ep-…-pooler.<region>.aws.neon.tech` | `DATABASE_URL`: the running API (many short connections). |
   | **Direct** | `ep-….<region>.aws.neon.tech` | `MIGRATION_DATABASE_URL`: migrations (they need a session-level lock and transactions, which a pooler doesn't provide reliably). |

   Both carry the password and `?sslmode=require` (Neon may add `channel_binding=require`; it is accepted and ignored).
3. Prefer a separate **Neon branch** (or project) for development and testing, so experiments never touch production data.
4. **Never paste a connection string into a chat, a commit, a screenshot or a shared file.** If one leaks,
   reset the role's password in Neon and update the secret.

TLS is mandatory: the server refuses a non-loopback `DATABASE_URL` with `sslmode=disable|allow|prefer`, and always
verifies a remote server's certificate (Neon's are publicly trusted).

## Configuration

Environment variables only (see [`.env.example`](.env.example)); errors name the variable, never its value.

| Variable | Default | |
| --- | --- | --- |
| `DATABASE_URL` | unset | The app's runtime connection (Neon: **pooled**). Unset: the server runs without a database and `/ready` reports unavailable. |
| `MIGRATION_DATABASE_URL` | `DATABASE_URL` | The connection the migration command uses (Neon: **direct**). The command refuses a host containing `-pooler` unless you pass `--allow-pooled`. |
| `DATABASE_POOL_MAX` | 5 | 1–20 connections per instance (Cloud Run serves few concurrent requests; deploy with `--max-instances 1` for now). |
| `DATABASE_IDLE_TIMEOUT_MS` | 10000 | Idle connections are closed (Neon's pooler and Cloud Run both drop idle ones). |
| `DATABASE_CONNECT_TIMEOUT_MS` | 10000 | |
| `DATABASE_STATEMENT_TIMEOUT_MS` | 15000 | Server-side limit for one statement. |

On **Cloud Run**, `DATABASE_URL` is a Secret Manager secret named `DATABASE_URL`, like `OPENAI_API_KEY` (it
already exists on the deployed service, `deploy-fitness-app-backend`; see [CLOUD_RUN.md](CLOUD_RUN.md)). Change
it with a new secret version, not a plain variable, and use `--update-secrets` (never `--set-secrets`, which
replaces every secret on the service). The pool connects on first
use, so a database that is asleep or slow never delays or fails the container's start; Neon wakes it on the first query.

## Run the migrations

From the repository root, once: `npm run server:install` (installs the server's own dependencies).

```powershell
# put the DIRECT string in the git-ignored server/.env, or set it for this shell only:
$env:MIGRATION_DATABASE_URL = "<direct connection string>"

npm run server:migrate:status   # lists applied and pending; changes nothing
npm run server:migrate          # applies what is pending, oldest first
```

- Each migration runs in its own transaction with its history row: it applies completely or not at all.
- It is repeatable: a second run reports "Database is up to date".
- History is `pulseform.schema_migrations` (version, name, checksum, time). A migration file that is **edited after
  it was applied**, or a database **ahead** of your files, stops the run with a clear message. Never edit an applied
  file; add the next `NNNN_name.sql`.
- Two runners at once are safe: a session advisory lock makes the second wait and then find nothing to do.
- Failures print the migration name, the SQLSTATE and the database's own message (about SQL objects). Connection
  failures print only an error code, never the host, user or password.
- Better Auth's tables (schema `auth`) **are** created by this runner (`0006`, Better Auth's own generated SQL);
  Better Auth's CLI is not used. A test fails if a Better Auth upgrade expects a different schema: add the difference
  as a new migration.

To run them from the container instead (for example as a Cloud Run job that uses the same image):
`node migrate.mjs up` with `MIGRATION_DATABASE_URL` set (the image carries `migrate.mjs` and `migrations/`).

## `GET /ready`

`/health` is unchanged and never touches the database: it answers `{"status":"ok"}` while the process is up.
`/ready` runs `SELECT 1`: **200** `{"status":"ready"}` or **503** `{"status":"unavailable"}`, and nothing else, whatever
went wrong (no host, schema, SQL or error text; details go to the logs as an error code only). The answer is cached for
10 seconds and shared by concurrent callers, so polling it can't become database load, or keep Neon awake more than needed.
Cloud Run does not use it; it is for you and for monitoring.

## Safe local development

- **Unit and database tests need no database and no credentials**: `npm run server:test`. The schema tests run the real
  migrations on PGlite (PostgreSQL compiled to WebAssembly, in the test process); pool and readiness logic is tested
  with the `pg` driver replaced. These do **not** prove that a Neon connection works.
- **A real local PostgreSQL** (needs Docker), for trying the migration command and `/ready` end to end. TLS is optional
  for `localhost` only:

  ```powershell
  docker run -d --name pulseform-pg -e POSTGRES_PASSWORD=<pick-a-throwaway> -p 127.0.0.1:5432:5432 postgres:17
  $env:DATABASE_URL = "postgresql://postgres:<throwaway>@localhost:5432/postgres"
  npm run server:migrate
  npm run server:start            # then: curl.exe -i http://localhost:8787/ready
  docker rm -f pulseform-pg       # wipes it
  ```

- This project currently has **one** Neon database, and it is the production one: `server/.env` points at it, so
  local runs read and write real data. A Neon **branch** for development, with `server/.env` pointed at it and the
  main branch left to the deployed service, would separate them; that has not been set up.

## Checking a live Neon connection

Verified against a real Neon database (15 Oct 2026): both URLs connect (the first connection takes about 3 s while
Neon's compute wakes; later ones are fast), the migration history is exactly 0001–0005, and `/ready` answers 200 on the
pooled `DATABASE_URL` alone. Later the same day, 0006 and 0007 were applied to **this same database** (the only one,
which is the production one; status checked first, a second run reported "up to date", and on 16 Oct a status check
showed 0001–0007 applied with nothing pending). A local server completed sign-up, email confirmation, `/v1/auth/me`,
a wrong password (401), sign-in and sign-out against it, from a browser and from a physical Android phone; the
throwaway test accounts were deleted afterwards.

- **Check TLS from the client, not the server.** Neon ends TLS at its proxy, so PostgreSQL's own `pg_stat_ssl` reports
  `ssl = false` even on an encrypted connection. Use the client socket instead: with `pg`,
  `client.connection.stream.encrypted` and `.authorized` are `true` (TLS 1.3 with a verified certificate chain and hostname),
  and a plaintext attempt (`ssl: false`) is refused by Neon.
- The first request after Neon scales to zero is slow (seconds). `DATABASE_CONNECT_TIMEOUT_MS` (10 s) leaves room for it.

## Verified, and not

- Verified here: configuration validation and TLS policy (unit tests); migration ordering, history, checksums, rollback,
  idempotence, lock release and every schema constraint (PGlite); the real `pg` driver path (status, apply, idempotent
  re-run, tamper refusal, two runners racing, `/ready` up, down and recovering) against a **throwaway local PostgreSQL 17**;
  the container (non-root, tools present, refusals print nothing secret).
- Verified against Neon (see "Checking a live Neon connection"): TLS, both connection types, migration history, `/ready`
  from a local server.
- The deployed Cloud Run service has the `DATABASE_URL` secret and its `/ready` answers 200 (checked 16 Oct 2026),
  so it reaches *a* Neon database. **Not verified:** that this is the same database `server/.env` reaches (and
  so has migrations 0001–0007); the check is in [AUTH.md](AUTH.md#ordered-plan), step 1.
- **Not verified:** `channel_binding` (accepted in the URL and ignored, so the connection does
  not enforce it), behaviour under real load, and any data operation: no application code writes to the
  `pulseform` tables yet.

## Next phases (not done)

Data endpoints and a sync/import path from `localStorage`; private Cloudflare R2 for images. See [`docs/database-schema.md`](../docs/database-schema.md).
