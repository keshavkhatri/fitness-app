# Database schema (PostgreSQL / Neon)

The relational foundation for Pulseform's future server-side data. **Nothing uses it yet**: the app
still keeps everything in `localStorage`, and no data is migrated. This document explains the schema
in [`server/migrations/`](../server/migrations) and how it maps to the app's domain models.
How to run and develop with it: [`server/DATABASE.md`](../server/DATABASE.md).

## Principles

- **Mirror the domain rules.** Limits and enums come from the app's own models and parsers
  (`src/app/domain/**`). A `CHECK` constraint repeats each rule so bad data can't be stored even
  if a client misbehaves. The app's validation stays the first line; the database is the last.
- **Every row belongs to a user.** Each domain table has `user_id text` as the first column of its
  primary key, so one user's rows are never reachable through another's id, and every query is
  naturally scoped (`WHERE user_id = $1`).
- **Ids are the app's ids, unique per user.** The app's ids are not UUIDs (`weight-<uuid>`,
  `wl-<ms>-day-4-push`, and a plan id that is a hash of its inputs, so two users can hold the same
  one). Primary keys are therefore `(user_id, id)`, and a later import keeps every id as it is.
- **Preserve the app's timestamps.** `created_at` / `updated_at` hold the app's own instants
  (`timestamptz`), so history keeps its order after an import. Calendar days ("which day") are
  `date` in the user's local calendar, as in the app. Server-side bookkeeping columns use `now()`.
- **Canonical units.** Stored values are metric: kg, cm (the unit system is a display preference).
  A workout records its own `weight_unit` (kg or lb) and the two are never added. Body composition
  values are stored exactly as reported, with their unit, and never converted.
- **Derived data is not stored.** Daily nutrition totals, the assessment (calories and macros),
  age, the streak, weekly reviews, charts and trends are all recomputed from rows.

## Two owners, two schemas

| Schema | Owner | Contents |
| --- | --- | --- |
| `auth` | **Better Auth** (accounts, see [`server/AUTH.md`](../server/AUTH.md)) | `user`, `session`, `account`, `verification`. Better Auth reads and writes them; their shape is Better Auth's generated SQL, applied by `server/migrations/0006_auth_tables.sql`. |
| `pulseform` | **this repository** | Every Pulseform table below, plus `schema_migrations` (the migration history). |

Rules that keep them from colliding:

1. One migration history (`pulseform.schema_migrations`) covers both schemas; Better Auth's own CLI is
   not used. `0006` is exactly what Better Auth generates, and `server/test/auth.spec.ts` fails if the
   installed Better Auth expects anything different (after an upgrade, add the difference as a new
   migration). Pulseform code never writes to `auth`; Better Auth never touches `pulseform`.
2. Better Auth is configured with `schemaName: 'auth'`, so it queries `auth.*` explicitly; no
   `search_path` setting is needed.
3. `pulseform.*.user_id` is `text`, matching Better Auth's string user id. `0007` gives every root
   table's `user_id` a `REFERENCES auth."user"(id) ON DELETE CASCADE`, so deleting an account deletes
   all its data, and no row can belong to a user that doesn't exist.
4. No custom password or session tables are defined here, on purpose. Google sign-in and
   email/password are Better Auth's job (its `account` table holds the credentials or provider link).

## Tables

All in schema `pulseform`; every table below also has `user_id` leading its key.

| Table | Domain source (local key) | Key columns and rules |
| --- | --- | --- |
| `user_profiles` | `UserFitnessProfile` (`fitness.profile`) + the reviewed marker (`fitness.assessment-reviewed`) | One row per user. Goal, `date_of_birth` (age is derived), sex, `height_cm`, `weight_kg` (the profile's single current value), `unit_system`, experience, 2–6 training days, location, `equipment text[]` (checked against the catalogue), activity level, optional `target_weight_kg`. The Calorie Check-in result is four columns, all set or all null. `assessment_reviewed_for` is the profile `updated_at` whose assessment was reviewed. |
| `user_preferences` | `UserIdentity` (`fitness.identity`), `fitness.theme-preference` | `display_name` (≤ 40), `theme_preference`, and **`avatar_object_key`**: a reference to a private object, never image bytes. |
| `workout_plans` | `WorkoutPlan` (`fitness.workout-plan`) | The generated plan is stored whole as `jsonb` (it is a deterministic, versioned snapshot validated by the app's strict parser) with its key facts as columns. At most one `is_current` plan per user. |
| `workout_logs` | `WorkoutLog` (`fitness.workout-active`, `fitness.workout-logs`) | One row per performed or in-progress workout. `status` ⇔ `completed_at`. **At most one `in-progress` per user.** `plan_id` and `session_id` record the origin without a foreign key, so history survives plan regeneration. |
| `workout_log_exercises` | `ExerciseLog` | Position, catalogue `exercise_id`, name (snapshotted), logging mode, the planned prescription. A target is reps-range or seconds, never both. |
| `workout_log_sets` | `SetLog` | `pending`, `completed` or `skipped`. Weight, reps, duration and `completed_at` exist **only** on completed sets (and a completed set needs a value and a time). Weight 0–1000, reps 1–500, duration 1–7200 s. |
| `food_entries` | `FoodEntry` (`fitness.nutrition-entries`) | Meal, name ≤ 80, quantity and unit, and the nutrition the user recorded **for that quantity** (not per 100 g). |
| `weight_entries` | `WeightEntry` (`fitness.body-weight-entries`) | Date, `weight_kg` 20–500. Same-day entries are kept. |
| `measurement_entries` + `measurement_values` | `MeasurementEntry` (`fitness.body-measurement-entries`) | A session and one row per measured site (`waist, chest, hips, arm, thigh`, 10–300 cm). The app enforces that a session has at least one value. |
| `body_composition_assessments` + `body_composition_values` | `BodyCompositionAssessment` (`fitness.body-composition-assessments`) | Source is `manual` (no provenance) or `import` (format, parser name and version, all required). One value row per metric of the 22, with its reported unit; the metric fixes the allowed unit. |
| `daily_check_ins` | `fitness.daily-check-ins` | One row per day with `steps` (0–100,000) and/or `recovery`; at least one is set. |
| `notification_reads` | `fitness.notifications-read` | Which day-stable reminder ids were read. The reminders themselves are rebuilt from data each day. |
| `schema_migrations` | the migration tool | Version, name, checksum, applied time. |

### Why plans are `jsonb` and logs are relational

History, charts and progress read **performed** sets (`workout_logs` down to `workout_log_sets`), so
those are tables that can be filtered and aggregated (a user's best bench set, weekly volume). A plan
is only ever read and written whole and is regenerated by a deterministic engine, so exploding it into
tables would add joins and migrations for no query. Its `workout_programming_version` and
`generated_at` columns let a future engine version be told apart.

### Derived values are left out

Daily totals, the weekly review, the streak and trends have no tables on purpose. A stored derived value
could disagree with the entries it came from.

## What must not be stored in the database

| Data | Where it lives instead |
| --- | --- |
| **InBody report images** and the raw AI extraction | Memory only today. If images are ever kept, in **private Cloudflare R2** with a key reference. The extraction server already streams, never writes to disk, and sends `store: false`. |
| **Profile photo** (today a data URL in `fitness.identity`) | Private R2 object; only `avatar_object_key` is stored. The schema has no `bytea` column and no image-named column (a test enforces both). |
| **Passwords, sessions, OAuth tokens** | Better Auth's `auth` schema, never `pulseform`. |
| **The OpenAI key, `DATABASE_URL` and other secrets** | Secret Manager / git-ignored `.env`, never rows, logs or the image. |
| **Derived numbers** (totals, assessment, age, streak, review) | Recomputed from rows. |
| **Onboarding draft** (`fitness.onboarding-progress`) | Stays on the device: it is transient and resumable per install. |
| **The exercise catalogue** | Code constants (`exercise_id` is a key, not a table). |

## Deliberately open

- **Row-level security** is not enabled: the server will be the only database client and scopes every query
  by `user_id`. Revisit if clients ever connect directly.
- **Sync and conflict rules** (offline edits, last-write-wins by `updated_at`, tombstones for deletes) are
  not designed here: they belong to the migration/sync phase.
- **Data export and account deletion** are not in the app today. The cascading foreign keys inside a user's
  data and the `auth` keys (`0007`) make deleting the `auth."user"` row delete everything the user owns.
- **Retention** of `notification_reads` (the app keeps the newest 200) is left to the application.

## Changing the schema

Add a new `NNNN_name.sql` file; never edit one that has been applied (the tool refuses a changed file).
Test it in `server/test/schema.spec.ts` (constraints are tested as rules, on an in-process PostgreSQL).
