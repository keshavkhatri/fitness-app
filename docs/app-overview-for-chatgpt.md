# StokeForm — complete project reference

> **Purpose of this file.** A single, self-contained description of the whole project (product, architecture, domain logic, screens, data, design system, server, build and deployment, tests, known issues and open decisions), written so that an AI assistant (ChatGPT or similar) with **no access to the repository** can understand the app entirely and answer questions, review designs, or propose changes.
>
> **Revision 2 — 19 October 2026.** First written 15 Oct 2026; updated 19 Oct 2026 from the repository at branch `main`, last commit `d098850` (merge of PR #13, "Premium custom workout plan"), plus a small amount of uncommitted work ([§22](#22-uncommitted-work-at-time-of-writing)). **What changed since revision 1:** the app was **renamed StokeForm** (18 Oct) with a new logo; **user accounts** (Better Auth: email + Google) were added on the server and in the app; the server became a **containerised API on Google Cloud Run with a Neon PostgreSQL schema** (migrated, but not yet holding app data); first run now has an **account gate** and a one-time **Free/Premium offer** backed by an entitlement system (no billing provider yet); a **Premium custom workout plan** editor and a free **exercise library** screen were built; the production build now points at the hosted API. Where this file and the code disagree, the code wins. Statements that were *not* verified by running something are marked **(unverified)**.
>
> **Sibling docs in this repo:** `README.md` (feature list + conventions), `docs/design-system.md` (the UI contract, ~1,000 lines), `docs/access-model.md` (accounts / entitlements / Free vs Premium), `docs/database-schema.md` (PostgreSQL schema), `server/README.md`, `server/AUTH.md` (accounts, ~600 lines), `server/CLOUD_RUN.md`, `server/DATABASE.md`, `docs/initial plan.md` (the original six-module product idea). This file consolidates and cross-checks them; it does not replace the design-system document for token-level detail.

---

## Table of contents

1. [What the app is (one-minute summary)](#1-what-the-app-is-one-minute-summary)
2. [Product scope: built vs. not built](#2-product-scope-built-vs-not-built)
3. [Technology stack and versions](#3-technology-stack-and-versions)
4. [Repository layout](#4-repository-layout)
5. [Architecture](#5-architecture)
6. [Data model and persistence](#6-data-model-and-persistence)
7. [Domain engines in detail](#7-domain-engines-in-detail)
8. [Core (app-wide) services](#8-core-app-wide-services)
9. [Navigation, routes and guards](#9-navigation-routes-and-guards)
10. [Screens and features, one by one](#10-screens-and-features-one-by-one)
11. [Design system and color theme](#11-design-system-and-color-theme)
12. [The StokeForm server (API, accounts, database, InBody extraction)](#12-the-stokeform-server-api-accounts-database-inbody-extraction)
13. [Environments, configuration and external dependencies](#13-environments-configuration-and-external-dependencies)
14. [Build, run and deployment](#14-build-run-and-deployment)
15. [Android build and device testing](#15-android-build-and-device-testing)
16. [Testing and quality gates](#16-testing-and-quality-gates)
17. [Security, privacy and safety design](#17-security-privacy-and-safety-design)
18. [Accessibility](#18-accessibility)
19. [Known issues, limitations and technical debt](#19-known-issues-limitations-and-technical-debt)
20. [Open product and infrastructure decisions](#20-open-product-and-infrastructure-decisions)
21. [Project history and working conventions](#21-project-history-and-working-conventions)
22. [Uncommitted work at time of writing](#22-uncommitted-work-at-time-of-writing)
23. [Glossary](#23-glossary)
24. [How to use this file when asking an AI for help](#24-how-to-use-this-file-when-asking-an-ai-for-help)

---

## 1. What the app is (one-minute summary)

A **cross-platform (iOS/Android) personal fitness companion** built with **Ionic 9 + Angular 22 + Capacitor 8**. Brand name in the UI: **StokeForm** (`src/app/core/brand.ts`); Capacitor/Android app name is "StokeForm"; the app id is `com.stokeformfitness.app` (installation, signing, Firebase and the Google sign-in deep link depend on it); only the root npm package name `fitness-app` keeps the placeholder name.

Positioning from the brand docs: *energy, strength, personal transformation and measurable progress*; the name means "to stoke (feed a fire) + form".

It is **local-first for fitness data, with an account required at setup**: all fitness and health data (profile, plans, workouts, food, weight, measurements, InBody records, check-ins) lives **only on the device** (`localStorage` via a storage abstraction) and **nothing is synced yet**. A **StokeForm account** (email + password with email confirmation, or Google sign-in) is required to finish first-run setup in builds where accounts are switched on, but the account holds only identity (email, name, Google link, sessions). The backend (`server/`) is a Node service on Google Cloud Run that provides accounts, an InBody-photo extraction proxy (to the OpenAI API) and a PostgreSQL schema on Neon that is migrated but **not yet used for app data**.

What a user can do today:

1. **Onboard** (13 screens): sex, date of birth, height and weight on drag rulers, activity level, goal, experience, days per week, training location, equipment → review → **sign in or create an account** (the profile is created only once signed in; the name comes from the account) → finish, with a preview of the real workout week. Optionally start from a photo of an InBody report (AI-read, the user reviews every value). Then a one-time **Free/Premium plan offer**.
2. See an **assessment** ("your starting point"): estimated BMR/maintenance, a starting calorie target, protein/carbs/fat targets, and a step-by-step explanation of how each number was derived.
3. Get a **deterministic, rule-based weekly workout plan** generated from the profile (not AI-generated), from a catalog of 77 exercises; browse a free **exercise library**; a **Premium** user could build and edit their own plan (nobody can be Premium yet: no billing provider).
4. **Run a workout**: an immersive full-screen logger (sets/reps/weight/duration, rest timer, exercise demonstrations, resume after app kill), then a four-view summary.
5. **Log food** (manual entry + re-log "recent foods"; no food database), see daily calorie/macro progress against calculated targets, a weekly summary, and an evidence-based **Calorie Check-in** that can propose a target adjustment.
6. Track **body weight**, **tape measurements**, and **InBody assessments** (typed or AI-read), with charts and change-since-previous.
7. See **progress** (weight trend, consistency, volume, per-exercise performance), a **weekly fitness review** with at most three prioritised actions, an **in-app notification inbox**, and a **streak** of active days.

Philosophy visible throughout the code: *deterministic and explainable over clever*; *never invent data* (missing = missing, never zero); *estimates are labelled as estimates*; *no scores, no 1RM estimates, no calorie-burn estimates*; *destructive actions confirm first*.

---

## 2. Product scope: built vs. not built

### Built (verified in code)

| Area | Status |
|---|---|
| Onboarding + fitness profile (incl. optional AI InBody-assisted setup) | Built |
| Assessment (BMR, TDEE, goal calories, macros, safeguards, explanation) | Built |
| Workout generation engine v2 (frozen) + plan lifecycle | Built |
| Workout planning UI, workout detail, history, history detail | Built |
| Active workout logger, rest timer, resume, summary (4 views) | Built |
| Exercise demonstrations (58 of 77 exercises, remote photos on request) | Built |
| Progress (overview, exercise list, exercise performance) | Built |
| Nutrition: daily log, add/edit/delete food, recent foods, week view | Built |
| Calorie Check-in (adaptive target) | Built |
| Weekly Fitness Review | Built |
| Body weight history, profile-weight action | Built |
| Body measurements (waist, chest, hips, arm, thigh) | Built |
| Body composition (InBody) history/detail/entry/edit/delete | Built |
| Daily check-ins (steps typed in, recovery level) | Built |
| Active-day streak | Built |
| In-app notification inbox (derived reminders) | Built |
| Quick Add sheet (5 of 6 actions) | Built |
| You hub: profile editor, name+photo, appearance (System/Light/Dark), units (metric/imperial) | Built |
| InBody extraction endpoint (Node, OpenAI Responses API) | Built; **deployed to Cloud Run** (older image, see §14); production app points at it |
| Accounts: email/password + email confirmation, password reset, Google sign-in, sessions, unconfirmed-account cleanup job (Better Auth 1.7.10) | Built and tested; **not enabled in production** (the deployed image predates it) |
| Account gate in onboarding, one-time `/offer`, Free/Premium entitlement boundary (`NO_BILLING`) | Built |
| Premium custom workout plan (editor + exercise picker), free exercise library screen | Built; the editor is unreachable in practice until billing exists |
| PostgreSQL schema (Neon, schema `stokeform`) + migration tool + `/ready` | Built; migrations 0001–0007 applied to the one Neon DB; **no app data stored in it yet** |
| Rebrand to StokeForm (name, mark, launcher icons, splash, emails) | Built (18 Oct) |
| Android project (Capacitor) + debug APK | Built; tested on one phone |
| Design system (tokens, 3 screen themes, ~20 `fit-*` components) | Built |

### Not built (by design or deferred)

- **Syncing app data to the account / server-side profile, multi-device** (a new device repeats the questionnaire), **data endpoints**, private image storage (Cloudflare R2 planned).
- **Billing / subscriptions** (a provider-neutral boundary exists; no provider chosen).
- **iOS platform** (`ios/` folder does not exist; `npx cap add ios` has not been run).
- **Push/system notifications** and notification settings (inbox is in-app only).
- **Health-app integration** (steps are typed in by the user; no HealthKit/Health Connect).
- **Progress photos** (Quick Add shows "Coming soon").
- **Food database, barcode scanning, photo food logging, meals/recipes.**
- **AI coaching, adaptive workout programming from history** (progression rules exist in the plan but are not applied automatically).
- **PDF import** of InBody reports (PNG/JPEG/WEBP only).
- **Encryption of stored data** (see [§17](#17-security-privacy-and-safety-design)).
- **Calorie-burn estimates, 1RM estimates, PR badges, scores** — deliberately absent.
- **Exercise instructions / common mistakes / difficulty variations** from the original plan (the library screen shows the catalog with filters, photos where available and basic details, not coaching text).
- **Localization** (English only; copy lives in `*-content.ts` files, not i18n).
- **CI/CD** — there is no `.github/` folder or pipeline configuration in the repo.

---

## 3. Technology stack and versions

From `package.json` (exact pins unless a caret/tilde is shown):

| Concern | Choice |
|---|---|
| UI framework | **Angular 22.1.7** (standalone components, **zoneless**, signals, `resource()`, OnPush everywhere) |
| Mobile UI kit | **Ionic 9** (`@ionic/angular ^9.0.0`), `ionicons ^8.1.0` |
| Native shell | **Capacitor 8.5.3** (`@capacitor/core`, `android`, `cli`) + plugins `app 8.1.2`, `browser 8.0.5` (Google sign-in in a Custom Tab), `haptics 8.0.2`, `keyboard 8.0.6`, `status-bar 8.0.4`, and `@aparajita/capacitor-secure-storage 8.0.1` (session token in Android Keystore / iOS Keychain) |
| Language | **TypeScript ~6.0.0**, strict, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `strictTemplates` |
| Styling | **SCSS** + CSS custom properties; **Inter Variable** font (`@fontsource-variable/inter`) bundled |
| Reactive | RxJS ~7.8 (minimal use; signals preferred) |
| Build | `@angular/build:application` (esbuild-based), output `www/` |
| Unit tests | **Vitest ~4.0.18** via `@angular/build:unit-test`, **jsdom ^30.1.1**; setup in `src/test-setup.ts` |
| Lint | **ESLint ^10.10** + `angular-eslint 22.5.0` (template accessibility rules on) + `typescript-eslint ^8.61` |
| Server | Node (container uses `node:24-slim`; bundle target node22), its **own `server/package.json`**: **better-auth 1.7.10**, **kysely 0.29.6**, **pg 8.23.1** (bundled into the output by a pinned **esbuild 0.28.2**, via `server/build.mjs`); dev/test: `@electric-sql/pglite 0.5.10` (in-process Postgres for tests), Vitest (Node env) |
| Server infrastructure | **Google Cloud Run** (container built from the root `Dockerfile`), **Neon** serverless PostgreSQL, **Secret Manager**, **Resend** (transactional email, planned), **Google OAuth** (sign-in), **OpenAI Responses API** (InBody reading) |
| Required Node | **22.22.3+ or 24.15+** (Angular CLI 22 refuses older) |
| Browser targets | `.browserslistrc`: Chrome ≥119, Firefox ≥119, Edge ≥119, Safari ≥17, iOS ≥17 |
| Android | `minSdk 24`, `compileSdk/targetSdk 36`, Cordova Android 14.0.1 shim, JDK 21 to build |

Notable choices: no NgModules; no NgRx or other state library (services + signals); no Angular HTTP client (network calls are plain `fetch`: the account API client, the InBody client, plus `<img>` loads of demonstration photos); no analytics or crash-reporting SDK (Angular CLI analytics id exists in `angular.json` — a CLI setting, not an app feature).

Bundle budgets (production): initial warning 2 MB / error 5 MB; any component style warning 4 KB / error 6 KB.

---

## 4. Repository layout

```
fitness-app/
├── README.md                       Feature list, structure, conventions, "Production readiness"
├── package.json / package-lock.json
├── angular.json                    Build/serve/test/lint targets; prod fileReplacements for environments
├── Dockerfile / .dockerignore / .gcloudignore   Container image of the server (built from repo root; see §14)
├── capacitor.config.ts             appId com.stokeformfitness.app, appName "StokeForm", webDir "www"
├── ionic.config.json               type angular-standalone, capacitor integration
├── eslint.config.js                Architectural lint rules (see §5.3)
├── tsconfig*.json, .editorconfig, .browserslistrc, .gitignore
├── docs/
│   ├── design-system.md            UI contract + per-screen reference implementations + brand + visual QA records
│   ├── access-model.md             Accounts, setup gates, entitlements, Free/Premium matrix, billing boundary
│   ├── database-schema.md          PostgreSQL schema design (tables, constraints, principles)
│   ├── initial plan.md             Original 6-module product idea
│   └── app-overview-for-chatgpt.md THIS FILE
├── scripts/                        generate-brand-assets.mjs (icons/splash from the PNG artwork in scripts/brand-source/), android-debug.ps1
├── server/                         StokeForm API (separate TS project: own package.json, tsconfig, vitest)
│   ├── src/                        main, app-handler, config, env, log, node-server, extraction-handler, openai-client,
│   │                               rate-limiter, report-upload; auth/ (Better Auth: auth, auth-config, auth-routes, email,
│   │                               mobile-handoff, cleanup); db/ (database, database-config, migrations)
│   ├── migrations/0001…0007_*.sql  The database schema (schemas, profile, workouts, nutrition/body, check-ins, auth tables, ownership FKs)
│   ├── tools/                      migrate, cleanup, email-test, dev-outbox, migration-files (CLI entry points)
│   ├── test/*.spec.ts              ~270 tests (auth, cleanup, config, database, email, handler, migrations, node-server, openai, readiness, schema…) + pglite.ts
│   ├── AUTH.md, CLOUD_RUN.md, DATABASE.md, README.md, .env.example  (the real .env is git-ignored)
├── android/                        Capacitor Android project (appId com.stokeformfitness.app; launcher icons/splash generated from the brand mark)
├── www/                            Build output (git-ignored)
├── src/
│   ├── index.html, main.ts, global.scss, test-setup.ts
│   ├── environments/{environment.ts, environment.prod.ts}   incl. apiBaseUrl
│   ├── assets/brand/               stokeform-mark.svg, stokeform-icon.svg (mark on ink tile); assets/icon/favicon.svg|png
│   ├── theme/                      Design tokens (SCSS): _palette, _tokens, _ionic-bridge, _mixins, _tracking, _views, theme
│   └── app/
│       ├── app.component.ts, app.config.ts, app.routes.ts
│       ├── domain/                 Framework-free business logic (see §7)
│       ├── core/                   App-wide singleton services/repositories (no UI) (see §8)
│       ├── shared/ui/              Design-system components, selector prefix `fit-`
│       ├── shell/                  Tab bar + Quick Add sheet
│       └── features/               One folder per product area (screens + view models)
├── 20261001095249.png              ⚠ Root-level sample InBody report image (user's own data) — see §17
└── IMG-20261012-WA0006.jpg         ⚠ Same: sample report photo — never open/commit/share
```

**Size:** at the first revision (15 Oct 2026, raw `wc -l`): ≈ 37,300 lines of non-test app TypeScript, ≈ 22,700 lines of specs, ≈ 12,400 lines of SCSS. Since then 204 files changed (+16,000 / −400 lines, mostly accounts, server, docs, custom plan, onboarding gate, offer, brand assets). **(Exact current totals not re-measured.)**

**Git:** remote `origin` = `https://github.com/keshavkhatri/fitness-app.git`. 79 commits on `main` from 8 to 18 Oct 2026. Work is done on branches (`claude/sharp-brown-jjp18e`, then `claude/brave-ptolemy-1q7vxu`) merged by pull requests #1–#13.

---

## 5. Architecture

### 5.1 Layering

```
features/ (screens, view models, feature components)
   │ uses
   ▼
shared/ui (fit-* presentational components)      shell/ (tabs, quick add)
   │
   ▼
core/ (injectable services + repositories: orchestrate, persist, read the clock)
   │ uses
   ▼
domain/ (pure TypeScript: rules, engines, models, parsers; NO Angular/Ionic/Capacitor/RxJS)
```

Dependency direction is one-way: **domain ← core ← features/shell/shared**. The domain layer is deliberately runnable anywhere (the server imports the InBody extraction contract/request builder directly from `src/app/domain/inbody-extraction`, and the Docker build copies `src/app/domain` into the image for that reason). Server code (`server/`) is a separate project and never imports app layers other than `domain/`.

### 5.2 Patterns used consistently

- **Result objects, not exceptions, in the domain:** `{ ok: true, value } | { ok: false, error|errors }`. Errors carry machine-readable codes (not UI copy).
- **Pure, clock-free domain functions.** Time is injected: the app layer passes `asOfDate`/`today`/`now`. A `CLOCK` injection token (`core/time/clock.ts`) provides `() => Date`, replaced in tests. `localIsoDate()` produces the user's local calendar date `YYYY-MM-DD`; the app layer owns time zones, the domain never does.
- **Strict parsers for stored data** (`parseFitnessProfile`, `parseWorkoutPlan`, `parseWorkoutLog`, `parseFoodEntry`, `parseWeightEntry`, …): anything missing, unknown or out of range is dropped/rejected, never coerced. Corrupt storage reads as "empty", never crashes.
- **Repository pattern with abstract classes:** e.g. `FitnessProfileRepository` (abstract) with `LocalFitnessProfileRepository` as default implementation. A future API-backed implementation can be provided in its place; callers don't change.
- **`KeyValueStorage` abstraction** (`core/storage/key-value-storage.ts`): async `get/set/remove`, default `LocalKeyValueStorage` over `localStorage` (reads that throw resolve `null`; writes reject on failure). Designed so Capacitor Preferences or an encrypted store can replace it. In-memory test double in `core/storage/testing/`.
- **View-model functions:** each screen has a pure `*-view-model.ts` (data → display model) with its own specs; pages stay thin (template + wiring). Copy text lives in `*-content.ts` files.
- **Signals + `resource()`** for page data loading; OnPush; `inject()`; `host: { class: 'fit-theme-…' }` for screen themes.
- **Serialized async queues** in services that write (`queue = queue.then(...)`) so concurrent saves don't interleave (workout plan, workout log, units).
- **Versioned storage envelopes** `{ version: N, … }` with explicit migration policy (e.g. profile v1→v2 could not be migrated, so v1 reads as "no profile").
- **Deterministic ids where possible:** plan ids are an FNV-1a 32-bit hash of canonical JSON of version+input+config+catalog; workout log ids are `wl-<timestamp>-<sessionId>`.
- **Immutability:** all domain types are `readonly`; transitions return new objects.

### 5.3 Lint-enforced architecture rules (`eslint.config.js`)

- **Domain layer purity:** files in `src/app/domain/**` cannot import `@angular/*`, `@ionic/*`, `@capacitor/*`, `rxjs`, `ionicons`, nor `core/`, `features/`, `shared/`, `shell/`.
- **Demo data isolation:** `*.demo` modules may be imported only by `demo-*.source.ts` files or specs. (No demo data exists today.)
- **Selector prefixes:** components `app-` (feature/shell) or `fit-` (shared UI); attribute selectors allowed so primitives enhance native elements (`button[fit-button]`); directives camelCase `app`/`fit`.
- **Class suffix:** `Page` or `Component`.
- **Template accessibility rules** (angular-eslint `templateAccessibility`), plus the design-system rule that icon-only buttons must have `aria-label`.

### 5.4 Application bootstrap

`src/main.ts` → `bootstrapApplication(AppComponent, appConfig)`. `app.config.ts` provides:

- `IonicRouteStrategy` and `provideIonicAngular({ animated: !prefersReducedMotion })` — Ionic **mode is intentionally not forced**: iOS gets `ios`, Android gets `md` so native transitions/swipe-back behave natively. The *look* is mode-independent by rule.
- `provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding())` — all lazy routes preload; route params bind to component inputs.
- An **app initializer** that (1) registers the ionicons that are bundled (`registerAppIcons`: unregistered icon names don't render), (2) starts `trackTextScale()` (publishes `--text-scale`, so rings grow with the user's font size), (3) awaits `ThemeService.restore()` so the stored theme applies before first paint.
- A custom `TitleStrategy` (`BrandTitleStrategy`) that formats the document title as "<screen> · StokeForm".

Zoneless: no `zone.js` polyfill (`"polyfills": []`).

---

## 6. Data model and persistence

All fitness data is **device-local JSON in `localStorage`** under the keys below (every repository wraps data in a versioned envelope; all are parsed strictly). The **account session** is deliberately *not* in `localStorage`: see the last rows. Server-side storage exists as a schema only (§12.5).

| Key | Contents | Owner |
|---|---|---|
| `fitness.profile` | `{ version: 2, profile: UserFitnessProfile }` | `LocalFitnessProfileRepository` |
| `fitness.assessment-reviewed` | `{ version: 1, profileUpdatedAt }` — marker that the assessment for that profile version was seen | `OnboardingStatusService` |
| `fitness.onboarding-progress` | resumable onboarding draft | `OnboardingProgressStore` |
| `fitness.workout-plan` | the current `WorkoutPlan` snapshot; a Premium custom plan is the same snapshot with a `custom: { editedAt }` mark | `LocalWorkoutPlanRepository` |
| `fitness.workout-active` | `{ version: 1, log }` — the single in-progress workout (for resume) | `LocalWorkoutLogRepository` |
| `fitness.workout-logs` | `{ version: 1, logs: WorkoutLog[] }` — finished workouts, kept indefinitely | same |
| `fitness.nutrition-entries` | `{ version: 1, entries: FoodEntry[] }` | `NutritionRepository` |
| `fitness.body-weight-entries` | `{ version: 1, entries: WeightEntry[] }` | weight repository |
| `fitness.body-measurement-entries` | tape measurement entries | measurement repository |
| `fitness.body-composition-assessments` | InBody assessments | body-composition repository |
| `fitness.daily-check-ins` | `{ version: 1, steps: {date: n}, recovery: {date: level} }` | `DailyCheckInService` |
| `fitness.identity` | `{ version: 1, name, photo }` (photo = small square data URL ≤ 300,000 chars) | `UserIdentityService` |
| `fitness.theme-preference` | `'system' \| 'light' \| 'dark'` (plain string) | `ThemeService` |
| `fitness.notifications-read` | which day-stable notification ids were read | `NotificationInboxService` |
| `stokeform.first-run-offer` | one-time marker: the Free/Premium offer is still to be shown after first-run setup (cleared by "Continue with Free"/leaving the offer) | `FirstRunOfferService` |
| *secure store* `stokeform.auth.session`, `stokeform.auth.google-verifier` | the account **session token** and the PKCE verifier of a started Google sign-in. Android Keystore-backed secure storage on device; `sessionStorage` (tab-lifetime) in a desktop browser; **never `localStorage`** | `core/auth/session-store.ts` |

Notes:

- **Stored values are canonical metric** (cm, kg). `unitSystem` (metric/imperial) is a **display-only preference** stored inside the profile; switching units never converts stored data. A workout records its own weight unit (`kg`|`lb`) when it starts, and kg/lb are never added together.
- **Ids are not UUIDs** (no randomness in the domain; the app layer passes ids and timestamps in).
- **Dates:** `IsoCalendarDate` = local `YYYY-MM-DD` string for "which day"; ISO-8601 instants for `createdAt`/`updatedAt`/`startedAt`/`completedAt`. Weeks are **Monday–Sunday** throughout.
- **Deleting/clearing data:** there is no "delete all my data" or export feature in the UI. Clearing site/app data on the device wipes everything.
- **Reports are never persisted:** an uploaded InBody image and its extraction exist only in memory; only values the user saves become an assessment.

### 6.1 Main domain types (abridged)

**`UserFitnessProfile`**: `primaryGoal` (`lose-fat | build-muscle | recomposition | get-stronger | improve-fitness`), `dateOfBirth` (ISO date; **age is never stored**, derived with `currentAge()`; app is **18+ only**, max 120), `sex` (`male | female | prefer-not-to-say`), `height {centimeters}` (50–275), `weight {kilograms}` (20–500, a single current value, not a history), `unitSystem`, `trainingExperience` (`beginner | intermediate | advanced`), `trainingDaysPerWeek` (2–6; deliberately no 7), `trainingLocation` (`gym | home | both`), `equipment[]` (`full-gym, dumbbells, barbells, cable-machine, machines, resistance-bands, pull-up-bar, bench, bodyweight-only, other`), `activityLevel` (`sedentary | lightly-active | moderately-active | very-active`), `goalTarget { targetWeight | null }` (only for lose-fat [must be below current] and build-muscle [above current]), optional `energyCalibration { maintenanceKcal (1000–6000), observedFrom, observedTo, acceptedAt }` (set only by confirming a Calorie Check-in), `updatedAt`.

**`WorkoutPlan`**: deterministic `id`, `workoutProgrammingVersion: 'v2'`, `generatedAt`, goal/experience/daysPerWeek, `programStyle` (`hypertrophy | strength | general`), `split {strategy, sessionTypes}`, `sessions[]` (either a `resistance` `WorkoutSession` with `exercises[]`, each with sets, rep/time target, rest, progression rule, selection explanation and volume adjustment; or an `activity` session with duration range and suggested activities), `progressionStrategy`, structured `explanation`, `assumptions[]`, `warnings[]`.

**`WorkoutLog`** (a performed workout; snapshot, independent of the plan afterwards): `id`, `source {planId, version, sessionId}`, `sessionType`, `variant`, `weightUnit`, `startedAt`, `completedAt|null`, `status (in-progress|completed)`, `currentExerciseIndex`, `exercises[] { exerciseId, name, order, planned{sets,target,restSeconds,perSide}, logging (weight-reps|reps|duration), sets[] { setNumber, status (pending|completed|skipped), weight, reps, durationSeconds, completedAt } }`. Limits: weight 0–1000 (≤2 decimals), reps 1–500 integers, duration 1–7200 s integers.

**`FoodEntry`**: `id, date, meal (breakfast|lunch|dinner|snacks), name (≤80), quantity (>0, ≤10,000, 2 dp), unit (g|ml|serving|piece), nutrition {calories ≤10,000, protein/carbs/fat ≤1,000 g each, 1 dp}, createdAt, updatedAt`. Nutrition is what the user recorded **for that quantity**, not per 100 g.

**`WeightEntry`** (`id, date, weight{kilograms}, createdAt, updatedAt`; no future dates; 20–500 kg), **`MeasurementEntry`** (any non-empty subset of `waist, chest, hips, arm, thigh` in cm, 10–300), **`BodyCompositionAssessment`** (`id, date, source (manual | import provenance), reported: Partial<Record<metric,{value,unit}>>`, 22 metrics).

---

## 7. Domain engines in detail

### 7.1 Fitness calculation engine (`domain/fitness-calculations`)

`calculateFitnessAssessment(profile, { asOfDate, config }) → { ok, value: FitnessAssessment }`. Version `v1`; every coefficient lives in `calculation-config.ts`; a result-changing edit requires a new `calculationVersion`. `validateCalculationConfig` refuses to run on a bad config.

**Pipeline**
1. **Age** from `dateOfBirth` and `asOfDate` (must be 18–120).
2. **BMR** — Mifflin-St Jeor: `10·kg + 6.25·cm − 5·age + (male +5 | female −161)`. For `prefer-not-to-say` it uses the **midpoint** of male and female equations and marks confidence **low** (`sex-neutral-bmr`).
3. **TDEE (estimated maintenance)** = BMR × activity multiplier: sedentary 1.2, lightly-active 1.375, moderately-active 1.55, very-active 1.725. **Training days per week are deliberately not a factor.** If the profile has an accepted `energyCalibration` (from Calorie Check-in), its `maintenanceKcal` replaces the formula TDEE as the base for goal adjustment (the explanation records `maintenance.source: 'check-in'`; `estimates.tdeeKcal` stays the formula value).
4. **Goal adjustment** on maintenance: lose-fat −15% (approved range −20…−10%), build-muscle +7.5% (+5…+10%), recomposition/get-stronger/improve-fitness 0%.
5. **Product safety threshold** (explicitly *not medical guidance*): final calories never below 1500 (male), 1200 (female), 1500 (sex-neutral). Status: `normal`; `floor-applied` (deficit limited, maintenance ≥ threshold); `review-required` (even maintenance is below threshold → calorie *and* macro targets are withheld and the UI must flag it).
6. **Protein** g/kg by goal (default / range): lose-fat 1.8 (1.6–2.0), recomposition 1.8 (1.6–2.0), build-muscle 1.9 (1.6–2.2), get-stronger 1.9 (1.6–2.2), improve-fitness 1.6 (1.4–1.8). **Adjusted-weight method for high body weight:** threshold weight = 30 × height²(m); above it only 25% of the excess counts: `ref = threshold + 0.25·(weight − threshold)` (continuous at the threshold). Below it, plain body weight. A future lean-mass (InBody) strategy slot is documented in the code but not built.
7. **Fat** = 30% of calories preferred (min 20%, max 35%); **carbs** = remaining calories ÷ 4. Energy densities 4/4/9 kcal/g.
8. **Macro planning** (`planMacros`, whole grams): `feasible` (everything fits), `constrained` (fat reduced toward but never below its 20% minimum, rounded so it fits), `infeasible` (protein + minimum fat exceed calories → **no gram targets returned**, analysis explains the conflict; nothing silently cut).
9. Output: `estimates {bmrKcal, tdeeKcal, confidence{level: low|moderate|high, reasons}}` (formula-only is never "high"), `targets {calories{calculatedKcal, finalKcal, status, productSafetyThresholdKcal}, macros}`, `safeguardsApplied[]`, and a structured `explanation` (BMR inputs/method, activity multiplier, maintenance basis, goal adjustment, protein method detail, fat shares) which the "Why these numbers?" screen renders.

UI copy rule: "estimated maintenance", "starting calorie target", "initial protein target" — never imply measurement.

### 7.2 Workout programming engine v2 (`domain/workout-programming`, frozen)

`generateWorkoutPlan(input, { generatedAt, config, assumptions })` is **deterministic**: the same input + config + catalog always yields the same plan (ties broken by exercise id). Input is only goal, experience, days/week, locations, equipment (body metrics/sex/age are intentionally ignored; "future extension points" for exclusions/limitations/history are documented, unbuilt). All numbers in `workout-config.ts` (`DEFAULT_WORKOUT_CONFIG`), with `validateWorkoutConfig` outer sanity limits; a change that alters plans requires a new version.

**Program style by goal:** build-muscle, recomposition, **lose-fat** → `hypertrophy` (fat loss keeps a muscle-building stimulus; "no fat-burning workouts"); get-stronger → `strength`; improve-fitness → `general`.

**Splits by days/week** (`byFrequency`): 2 and 3 → full-body ×N; 4 → upper/lower ×2; 5 → upper, lower, push, pull, legs; 6 → push/pull/legs ×2. Overrides: *improve-fitness* at 4 days → four full-body sessions. *Beginners* at 5/6 days → `full-body-with-recovery`: 3 full-body sessions with `light-activity` days between (6-day adds an `optional-conditioning` day) — i.e. 5/6 "available days" are not 5/6 hard sessions. If the chosen split can't be built from the user's equipment, it falls back to full-body at the same frequency (recorded in the explanation as `equipment-fallback`).

**Session templates** (`session-templates.ts`): sessions are built from **objectives** (e.g. `knee-dominant` primary, `hip-dominant` secondary, `horizontal-pull` secondary with allowed `scapular` substitute class, `core` accessory…). Templates: `full-body-a/b/c`, `upper`, `lower-a/lower-b`, push, pull, `legs-a/b`. Repeated session types rotate through templates (A/B/C variants). Required objectives (`always`, or conditional on style/min-experience such as "hypertrophy & ≥ intermediate") are always filled first and can't be displaced by higher-scoring optional ones; optional ones fill remaining budget by priority (adjusted for weekly volume deficits).

**Exercise selection** is hard-filters (movement pattern/class, equipment owned, location, difficulty) then weighted scoring: preferred-vs-fallback pattern penalty (12 per position), substitute-class penalty (20), isolation-in-compound-objective penalty (15), loadability bonus by style, free-weight bonus for strength, experience-match bonus (4), beginner "supported movement" bonus (6), advanced free-weight bonus (3), general-fitness unilateral bonus (2), tier bonus (staple +3 / standard 0 / fallback −12), curated-for-style +3, regression penalty (8), primary-muscle-overlap penalty (3 per overlap), excess-fatigue penalty (30), weekly-repeat penalty (8). Every selection stores a structured `SelectionExplanation` (reasons codes, score, candidate count).

**Catalog** (`exercise-library.ts`): **77 exercises** across horizontal/vertical push & pull, squat, hinge, lunge, knee flexion/extension, calves, arms, delts, core, carries, conditioning (bike/rowing intervals, mountain climbers, burpees). Each has pattern, movement class (`full|scapular|postural`), primary/secondary muscles, required equipment (`dumbbells, barbell, rack, bench, cable, machine, resistance-band, pull-up-bar, ab-wheel`; bodyweight = none), locations (`gym|home|outdoor`), difficulty, mechanics, laterality, measurement (`reps|time`), loadability, stability, tier, fatigue cost. **Progression chains** (variation-based): push-up (incline → push-up → decline → archer), bodyweight knee-dominant (squat → split squat → Bulgarian), glute bridge → single-leg, pull-up (band-assisted → pull-up), anti-extension (dead bug → plank → ab wheel).

**Prescriptions** (sets by experience / rep range / rest) per style and profile — e.g. hypertrophy primary compound: sets 3/3/4, 6–10 reps, 120 s; strength primary compound: 3/4/5 sets, 4–6 reps, 180 s; general primary compound: 3/3/3, 8–12, 90 s. Timed exercises use a work interval. Strength compounds must have ≥120 s rest (validated).

**Exercises per session:** 5 (beginner), 7 (intermediate/advanced); strength goal −1; minimum 3. **Optional conditioning finisher** for lose-fat and improve-fitness goals. **Sequencing** order: primary-compound → secondary-compound → other-compound → isolation → arms → core → conditioning.

**Weekly volume balancing** (direct sets per muscle group — chest, back, quads, hamstrings, glutes, side/rear delts, biceps, triceps, calves): per-style/experience min–max ranges (e.g. hypertrophy intermediate: chest 8–16, back 10–18, quads 8–16…); minimums scale down when fewer than the reference 4 resistance sessions; at most 16 set adjustments per plan; per-exercise 2–4 sets (advanced up to 5); a small direct rear-delt minimum only applies with ≥3 sessions and not on upper/lower. Result and any out-of-target group are reported as `warnings`.

**Duration estimate** = 3 s/rep + 60 s setup/exercise + rest + 5 min warm-up, rounded **up** to 5 min; target session length 35–50 min (sessions are trimmed/extended by adjusting sets on existing exercises, never by adding exercises). **Progression rules** attached to each exercise: `double-progression` (loaded: add reps to the top of range on all sets, then +5% load — strength +2.5%, beginners capped at 2.5%), `rep-progression` (bodyweight/band, then next chain step), `time-progression` (+5 s up to 60 s). These are *rules only*; nothing applies them to history automatically yet (`historyBased: false`). **No starting loads** are prescribed.

**Plan assumptions/warnings** are enumerated codes (e.g. `no-starting-loads`, `day-order-not-weekday-schedule`, `combined-gym-and-home-equipment`, `unrecognized-equipment-ignored`, `full-gym-includes-all-equipment`; warnings `objective-unfilled`, `objective-substituted`, `weekly-volume-outside-target`). Profile→engine mapping (`profile-adapter`): `home`+`gym` locations combine; `full-gym` implies all equipment; unrecognised equipment ignored.

### 7.3 Training-plan lifecycle (`domain/training-plan`, `core/workout/workout-plan.service`)

- `generateWorkoutPlanForProfile(profile, {generatedAt})`.
- `planFreshness(plan, profile)` → `current | profile-changed`. A plan is stale only if goal, experience, days/week, locations, equipment or the mapping assumptions changed. Weight, activity level, units etc. never stale it; neither does a newer engine version (stored plans are snapshots).
- `WorkoutPlanService.load()` returns `ready{plan, origin: stored|created|regenerated, saved}`, `no-profile`, or `unavailable{error}`. **Regeneration is automatic** (product decision made because there was no history; the code comment says it should become an explicit user choice once users follow plans — an open decision, §20).
- **Weekday layout (product default, in the UI layer, `workout-view-model.ts`):** the engine orders training days but does **not** assign weekdays; the UI places them: 2 days → Mon, Thu; 3 → Mon, Wed, Fri; 4 → Mon, Tue, Thu, Fri; 5 → Mon–Fri; 6 → Mon–Sat. Others are rest days.

### 7.3b Custom workout plan (Premium) (`domain/training-plan/custom-plan.ts`)

A Premium user keeps the generated plan's training days, session ids/names and activity days, and replaces each **resistance day's exercises** with their own picks from the 77-exercise catalog. The result is an **ordinary `WorkoutPlan`** with a `custom: { editedAt }` mark, so workout detail, active workouts, logging and history work unchanged. `validateCustomPlan` returns issue codes (`empty-day`, `too-many-exercises`, `unknown-exercise`, `duplicate-exercise`, `invalid-sets`, `invalid-rest`, `target-mismatch` [reps vs time must match the exercise], `invalid-seconds`, `invalid-reps`, missing day…); a plan is built only if valid. **Limits** (`CUSTOM_PLAN_LIMITS`): 1–12 exercises per day, 1–10 sets, 1–100 reps (min ≤ max), 5–600 seconds for timed work, 0–600 s rest. Added exercises get the engine's usual prescription for the plan's style and experience as a starting point. A weekly-sets-per-muscle-group comparison against the plan's own targets is shown while editing. **No target weights** are stored (the plan model has none). A custom plan is **never regenerated automatically**; if the profile's programming inputs change later the plan is kept and the Workout tab says so; only a confirmed "Use generated plan" replaces it. Completed/in-progress workouts snapshot their exercises when started, so editing never rewrites history.

### 7.4 Workout session (logging) domain (`domain/workout-session`)

Pure state transitions on a `WorkoutLog`: `startWorkoutLog` (snapshots the session; refuses activity days), `startDecision` (`start | resume | conflict` — **one workout in progress at a time**), `completeSet` (also corrects completed sets), `skipSet`, `resetSet`, `skipExercise`, `goToExercise`, `finishWorkout` (allowed with pending/skipped sets, so partial workouts stay distinguishable), `summarizeWorkoutLog`. **Logging modes:** `weight-reps` (exercise requires dumbbells/barbell/cable/machine), `reps` (bodyweight/band/ab-wheel/bar), `duration` (timed target). Set status is explicit, never inferred from missing values.

History/progress facts (`workout-history.ts`, `workout-progress.ts`) are computed only from finished logs: `completedWorkouts` (most recent first), `isTrainingWorkout` (≥1 completed set), `completionStatus (complete|partial)`, `groupByCompletionDay`, `trainingOverview`, `weeklyActivity`, `exercisePerformance`, `performedExercises`, `isBetterSet` (weight+reps: heavier then more reps; reps-only: more reps; duration: longer), `topSet`, `recentBest` (comparable sessions only — same logging mode and unit), `weeklyWorkoutCounts` (12 weeks; weeks before the first workout are *unknown*, not inactive), `workoutVolume`/`totalVolumeByUnit` (weight×reps of completed weighted sets; kg and lb never added). **Deliberately no calories, PRs, 1RM or scores.**

### 7.5 Nutrition domain (`domain/nutrition`)

- Entry validation/creation/edit/strict parse (`food-entry.ts`), field-level problem codes (`required | too-long | not-positive | negative | not-a-number | too-large | invalid-option`).
- **Daily aggregation** (`nutrition-day.ts`): totals always derived (never stored) and summed in exact tenths (0.1+0.2=0.3); `groupByMeal` (always 4 meals incl. empty), `balance(target, consumed)` → remaining *or* over, never both/negative; `recentFoods` (distinct by normalised name+quantity+unit, newest first).
- **Targets** (`nutrition-targets.ts`) come only from the assessment, never recomputed: `review-required` → no calorie and no macro targets; macros `infeasible` → no gram targets; `constrained`/`floor-applied` → shown but flagged.
- **Portions** (`food-portion.ts`): editing a food scales the *recorded* values proportionally: `total = recorded × (servingSize × servings ÷ recordedQuantity)`; servings 0.5–20 in 0.5 steps; unit never changes; a missing/unreadable size yields an error, never zero.
- **Week** (`nutrition-week.ts`): Monday–Sunday, 7 days; a day with no entries has `totals: null` (never zero), days after today are `upcoming`; the **average divides by logged days only**.

### 7.6 Calorie Check-in (`domain/calorie-check-in`)

An **evidence review** (not a rating): estimates real maintenance calories from the user's own logged intake and weight trend and proposes a modest target change **only when the evidence supports it**; applied only after explicit confirmation (which writes `energyCalibration` to the profile).

Method: window = **28 days ending yesterday**. Weight trend = least-squares slope of all weigh-ins (kg/day); daily balance = slope × **7,700 kcal/kg**; maintenance = average logged intake − balance; uncertainty = ± max(150, 2 × slope standard error × 7700) rounded to 10.

Gates (all from `DEFAULT_CHECK_IN_CONFIG`): ≥14 logged days, ≥5 logged days in each half, ≥4 distinct weigh-in days, weigh-in span ≥14 days, range ≤500 kcal per side or the result is `insufficient (weight-noise)`; maintenance must be between 1× and 2.5× estimated BMR and within 1000–6000 kcal, otherwise `implausible` (below BMR usually means incomplete food logs). Recommendation: `none` (insufficient/implausible/no-target), `keep` (reasons: consistent / too-uncertain [>300 kcal one-sided] / recently-adjusted [<14 days since last] / small-change [<100 kcal] / safety-threshold), or `adjust` (step capped at ±250 kcal per check-in; recalculated through the engine incl. safety floor and macros). Trend direction: |slope| < 0.1 kg/week = stable. `onTrack` compares trend to the goal direction.

### 7.7 Daily check-ins and streak (`domain/daily-check-in`)

Steps (integer 0–100,000; default goal 10,000 — not user-configurable yet) and recovery (`poor|fair|good|great` → fractions 0.25–1), one value per local day, a new entry replaces that day's value; self-reported. **Streak** = consecutive local days ending today (or yesterday if today isn't active yet) on which the user recorded anything: a finished training workout, food, a weigh-in, steps > 0, or a recovery check-in; lookback capped at 400 days. Days are counted, never scored.

### 7.8 Body measurements (`domain/body-measurements`)

Weight entries (history ordered by date, then creation time, then id; change vs. previous computed from *displayed* values so numbers add up; same-day entries are kept, never averaged); ranges 30/90/180/365 days and All as rolling windows ending today (nothing interpolated or smoothed); **explicit "Use as profile weight"** action (`profile-weight.ts`) is the only way a weigh-in changes the profile; tape measurements with per-site latest/changes (`siteChange`).

### 7.9 Body composition / InBody (`domain/body-composition`, `domain/inbody-extraction`)

- **22 metrics**: weight, body-fat-mass, lean-body-mass, body-fat-percentage, skeletal-muscle-mass, fat-free-mass, soft-lean-mass, bmi, visceral-fat-level, basal-metabolic-rate, total/intracellular/extracellular water, ecw-ratio, protein, minerals, bone-mineral-content, body-cell-mass, smi, phase-angle, waist-hip-ratio, obesity-degree. Each has one quantity kind that fixes its allowed unit (mass kg/lb, % , L, kg/m², kcal, °, none). **Key metrics** (shown first): weight, body-fat %, body-fat mass, skeletal muscle mass, fat-free mass.
- Values are stored **exactly as reported with their unit** (no conversion/rounding); calculated values (e.g. share of weight) are computed at display and labelled as calculated. **Fat-free mass and lean body mass are separate metrics and are never mapped to each other** (explicit user decision; lean body mass is manual-only).
- `source`: `manual` or `import` provenance (`INBODY_AI_PROVENANCE`: device inbody, method import, format, parser name/version). An edited imported assessment **keeps import provenance only if values are unchanged** (date-only change); any value edit makes it manual.
- **Extraction contract** (`inbody-extraction.v1`, based on an InBody380 English sheet, template "BR-English-R6-A-230522"): the model returns JSON in three groups — metadata (`report-model`, `test-date-time`), profile (`height`, `age`, `gender`), measurements (23 fields) — each field `{status: read|uncertain|unreadable|not-on-report, text (as printed, no unit), unit (as printed), sourceLabel}`, plus `outcome` (`extracted | unsupported-report | insufficient-readable-information`) and `reportIssues` (`low-image-quality | partially-cropped | multiple-reports`). Values are **transcribed, never interpreted**. Reference ranges, history, segmental analysis, impedance, scores, advice and the device member ID are *not* extracted. Validation errors never carry offending values or model-written keys (unknown keys appear as `<unknown>`).
- **Mapping** (`inbody-extraction-mapping`): prefill suggestions only — sex, height, weight on the onboarding rulers (unrounded, e.g. 172.4 cm); `age` is **never** converted into a date of birth; assessment values map to metrics. Nothing is saved until the user reviews and saves.

### 7.10 Weekly Fitness Review (`domain/fitness-review`)

A deterministic review of one Monday–Sunday week, built from training logs, nutrition week, weights, measurements and InBody assessments; each section is `ready` or `unavailable` independently (a source that can't be read doesn't break others). Rules: weight trend window 28 days ending Sunday; body changes shown only if the latest reading ≤56 days old; nutrition actions need ≥3 logged days; protein gap = average < 90% of a valid target; logging coverage < 60% of elapsed days; ≥2 weigh-ins in last 2 weeks else suggest weighing in; measurements stale after 28 days. **At most 3 actions**, in priority order: complete-workouts → protein → log-food → review-exercise (a stalled exercise) → weigh-in → measure. Every action is traceable to shown data. `exercise-trends` classifies exercises (including "stalled").

---

## 8. Core (app-wide) services

(`src/app/core`, all `providedIn: 'root'` unless noted)

| Service / token | Responsibility |
|---|---|
| `KeyValueStorage` | Storage seam (see §5.2) |
| `CLOCK`, `localIsoDate`, `localCalendarDateOf` | Injectable time |
| `FitnessProfileService` / `Repository` | Load/save profile; `hasCompletedOnboarding()` |
| `OnboardingStatusService` | `needs-onboarding | needs-assessment | complete` derived from profile + reviewed marker (marker stores only the profile's `updatedAt`, no health data) |
| `onboarding.guards.ts` | `requireAppReady` (tab shell: setup complete, then the one-time offer), `requireOnboardingComplete`, `redirectIfOnboarded`, `requireProfile` |
| `core/auth/` — `AuthService`, `AuthApi`, `SECRET_STORE`, `pkce.ts`, `auth.guards.ts` | Accounts client (§12.2): state `restoring | guest | signed-in{user, verified}`; `signIn`, `signUp`, `signOut`, `updateName`, `startGoogle`/`completeGoogle`, `restore`, `token`. `AuthApi` is plain `fetch` with `Authorization: Bearer` (20 s timeout; maps every failure to a fixed `AuthError` code, never showing server text). Token kept in secure storage, never `localStorage`. Guards `redirectIfSignedIn` (+ unused `requireSignedIn`). `environment.apiBaseUrl = null` hides accounts entirely |
| `core/entitlements/` — `EntitlementService`, `access-policy.ts` (`FEATURE_MATRIX`, `canAccess`), `billing.ts` (`BillingProvider`, default `NO_BILLING`), `FirstRunOfferService` | Free/Premium boundary (§10.13). Anything but a **verified, unexpired** subscription (loading, error, expired, no provider) is Free. Signing in/out never changes entitlement or setup state |
| `UnitPreferenceService` | Changes `unitSystem` only; keeps plan; marks a reviewed assessment as reviewed for the new `updatedAt` |
| `FITNESS_CALCULATION_CONFIG`, `WORKOUT_PROGRAMMING_CONFIG` tokens | Inject engine configs (tests can override) |
| `FitnessAssessmentService` | profile → assessment via the engine |
| `WorkoutPlanService` | Create/keep/regenerate plan; serialized; `saved` flag if persistence failed; `saveCustomPlan` (refuses with `not-allowed` unless `canAccess('custom-workout-plan', plan)`), `useGeneratedPlan`; never regenerates a custom plan |
| `WorkoutLogService` | Start/resume/conflict, set transitions, finish; one active workout; serialized; if saving fails the workout continues in memory and `saveFailed` is set |
| `WorkoutHistoryService` | Reads finished workouts (`list`, `weekOverview`) |
| `NutritionService` / `Repository` | Selected-day log + calculated targets (`TargetState`); range loads |
| `CalorieCheckInService` | Builds the check-in from foods/weights/profile; applies accepted calibration |
| `WeightHistoryService`, `MeasurementHistoryService`, `BodyCompositionHistoryService`, `ProfileWeightService` | Repositories + services for the body-tracking areas |
| `DailyCheckInService` | Steps/recovery check-ins |
| `ActivityStreakService` | Streak (see §7.7) |
| `FitnessReviewService` | Gathers sources and calls `weeklyReview` |
| `UserIdentityService` | Name (≤40) and photo |
| `ThemeService` | Appearance preference; toggles `theme-light/dark` on `<html>`; native status bar sync; `holdAlwaysDark()` for always-dark screens |
| `InBodyExtractionClient` + `INBODY_EXTRACTION_ENDPOINT` / `INBODY_EXTRACTION_FETCH` tokens | Client of the extraction server (see §12.3) |
| `EXERCISE_MEDIA_BASE_URL`, `injectExerciseDemonstration()` | Demonstration photo URLs |
| `registerAppIcons()` | Only listed ionicons are bundled |
| `trackTextScale()` | Publishes `--text-scale` CSS variable from the user's OS/browser font size (so progress rings grow with large text) |
| `APP_BRAND` (`core/brand.ts`), `BrandTitleStrategy` | The wordmark name "StokeForm"; document title "<screen> · StokeForm" |

---

## 9. Navigation, routes and guards

**First-run flow:** `onboarding` (questionnaire → **account**) → `assessment` → `/offer` (once) → `home`. Four states are kept separate and none implies another (`docs/access-model.md`): **authentication** (Better Auth session: `restoring | guest | signed-in`), **profile completion** (`needs-onboarding` until a profile exists), **assessment review** (`needs-assessment` / `complete`; the local marker stores only the profile's `updatedAt`), **entitlement** (`loading | free | premium`). Guards derive where the user must go: no profile → `/onboarding`; profile whose assessment is not reviewed → `/assessment`; setup complete but the one-time offer marker (`stokeform.first-run-offer`) exists → `/offer?next=<where they were going>`; otherwise the app. Editing the profile changes `updatedAt`, so its assessment is shown again (except for unit-only changes). **Existing users** (a profile from before accounts) are never forced to sign in or see the offer as a gate.

**Top-level routes** (`app.routes.ts`): `/onboarding` (lazy, `redirectIfOnboarded`), `/assessment` (lazy, `requireProfile`), `/auth/*` (sign-in, sign-up, forgot-password, Google callback; **not** guarded by onboarding), `/offer` (`requireOnboardingComplete`), full-screen routes **outside the tab shell** (no tab bar): `/workout/session/:sessionId/active` and `/workout/summary/:workoutId` (`requireOnboardingComplete`, so an active workout is never interrupted by the offer), and the Premium editor routes `/workout/plan/edit` and `/workout/plan/edit/:sessionId/add` (`requireProfile` + `requireCustomPlanAccess`, which re-reads the entitlement and sends anyone not allowed to the offer). Then the tab shell `''` (`requireAppReady`) with children `home`, `workout`, `nutrition`, `progress`, `you`, and `**` → `home`. All routes preload.

**Tab bar (5 tabs):** Home, **Train** (`/workout`), **Fuel** (`/nutrition`), **Progress** (`/progress`), You. Active tab uses a filled icon variant (state never by colour alone). Quick Add is not a tab: it opens from the You tab as a bottom sheet.

**Complete route/screen inventory** (route → page → screen theme):

| Route | Page | Theme |
|---|---|---|
| `/home` | Home dashboard | dashboard |
| `/home/notifications`, `/:id` | Notification inbox / detail | inbox: immersive for All/Unread, dashboard for category filters + empty; detail: dashboard |
| `/workout` | Workout tab (Plan) | dashboard |
| `/workout/history`, `/workout/history/:id` | History / History detail | immersive |
| `/workout/session/:id` | Workout detail | immersive |
| `/workout/exercises` | Exercise library (browse/search/filter/details; Free) | dashboard |
| `/workout/plan/edit`, `/workout/plan/edit/:sessionId/add` | Custom plan editor / exercise picker (Premium) | dashboard |
| `/offer?next=` | Plan offer (Free vs Premium) | dark card UI on warm page |
| `/auth/sign-in`, `/auth/sign-up`, `/auth/forgot-password`, `/auth/callback` | Account screens (email, reset, Google return) | dashboard |
| `/workout/session/:id/active` | Active workout | immersive (always dark) |
| `/workout/summary/:id` (`?view=exercises|insights|next`) | Workout summary | immersive for Overview/Insights, dashboard for Exercises/Next |
| `/nutrition`, `/nutrition/week`, `/nutrition/check-in` | Daily log, Week, Calorie check-in | dashboard |
| `/nutrition/food/new?date&meal` | Add food | immersive |
| `/nutrition/food/:id` | Edit food | dashboard |
| `/progress`, `/progress/exercises` | Progress overview, exercise list | dashboard |
| `/progress/exercise/:id` | Exercise performance | immersive |
| `/progress/workout/:id` (also `/you/progress/…`) | Workout history detail inside Progress stack | immersive |
| `/you` | You hub | dashboard |
| `/you/review` | Weekly fitness review | immersive |
| `/you/weight-history`, `/new`, `/:id` | Weight history / entry | dashboard / immersive |
| `/you/measurements`, `/new`, `/:id` | Measurements history / entry | dashboard / immersive |
| `/you/body-composition`, `/:id`, `/new`, `/:id/edit` | InBody history / detail / entry | dashboard / immersive |
| `/you/progress` | Progress (same module, reachable from You) | dashboard |
| `/onboarding`, `/onboarding/review` | Onboarding / Profile editor | dashboard; immersive for the welcome screen and the Profile editor |
| `/assessment` | Assessment | one immersive screen: calories, macros, goal, facts, folded "Why these numbers?" |

Several screens keep their sub-views on **query parameters on the same route** (assessment, workout summary, notifications filter) so browser Back, in-page Back and Android hardware Back all move between views without re-creating the page.

---

## 10. Screens and features, one by one

### 10.1 Onboarding (`/onboarding`)

Steps (`onboarding-steps.ts`): `welcome` → `report` (only when the user chose upload) → `basics` (sex as 3 cards, date of birth via platform date picker; 18+; **no name field any more**: the name comes from the account) → `height` (vertical ruler, 26 px per cm/in, cm ↔ ft-in switch, "Enter manually") → `weight` (horizontal ruler 0.1 kg/lb steps) → `activity` → `goal` → `goal-target` (only for lose-fat/build-muscle; optional target weight with direction check) → `experience` → `frequency` (2–6, `circles` layout) → `location` → `equipment` (3-column icon tiles, multiple) → `summary` (review; each row opens its screen) → **`account`** (the gate; no progress bar; see below) → `finish` (the plan is created here, the screen says it is ready only once it was, shows the **real training week** as a row per planned day and, for first-run users, a choice between "Use generated plan" (Free, default) and "Build my own (Premium)", which says Premium isn't available yet while there is no billing; continues to the assessment). Thirteen screens in the common path.

**Account step.** The **profile (and so the assessment and plan) is created only once the person is signed in**, so nothing personal exists before sign-in. Signed out: a note that data stays on the device, *Continue with Google* (system browser Custom Tab + app link), *Create account with email*, *Sign in* (the `/auth/*` screens, which return with `next=/onboarding`); the footer button is hidden. Signed in: the account's name (or a single field asking for it once if the account has none, saved on the device and on the account via `POST /api/auth/update-user`; a name already set on this device wins) and *Create my profile*. **Accounts off** (build or server without accounts): an info notice and *Continue without an account*, so nobody is stranded; a network error shows retry. The questionnaire draft survives redirects, pending email confirmation, a failed Google sign-in and app restarts. After the assessment the **one-time `/offer`** appears (see §10.13). Progress shown as slim bar + `n/total` on question/review screens. Progress is **resumable** (`fitness.onboarding-progress`); progress from older versions still resumes. Answers are canonical metric; switching units changes only display and every ruler tick round-trips (tested for every tick) so toggling never drifts. A value from a report or typed may sit between ticks and is shown exactly until the ruler is moved. The name goes to the identity store, not the profile. There's no nutrition-preference question (the profile has no field for it). The welcome offers "Get started" and, when the build can read reports, "Set up from an InBody report instead".

**AI-assisted path:** the report step explains that the image goes to an external AI service, validates the file (PNG/JPEG/WEBP, ≤8 MB) and POSTs it; each answer then arrives with a status (printed value / uncertain / unreadable / absent / unusable) and a value counts as confirmed once its screen is continued. Failure messages are distinct for unsupported report, unreadable, file, network, provider, invalid response, busy; each offers retry and "switch to manual", keeping answers already given.

### 10.2 Assessment (`/assessment`)

Four views of one result: **Results** (dark: confidence chip, calorie target with maintenance underneath, three macro tiles, goal focus, weight/height/activity), **Macro breakdown** (light: SVG donut with spoken labels, grams/% of calories/kcal rows, how the split serves the goal), **Why these numbers?** (dark: the engine's own steps; collapsible "Factors we consider"), **Next steps** (light: links to workout plan, nutrition, progress — each marks the assessment reviewed — and "Adjust anytime" → Profile editor; "Go to home"). The view model's only arithmetic is the goal adjustment in kcal and each macro's calories; everything else is engine output.

### 10.3 Home (`/home`)

Header: wordmark, notification bell (dot while unread), avatar (opens You), greeting ("Welcome" for no profile, else time-of-day + name) and the **streak** chip. **"Your day, in motion"** card: a ring = mean of today's goals (steps vs 10,000, planned workout done, recovery check-in level; days without a planned workout leave Train out so units are never mixed) with Move / Train / Recover tiles opening the steps and recovery check-in sheets. **Featured workout** ink hero card (start / resume / done → record / activity / rest / setup; CTA starts directly) over a generated SVG placeholder image (`app-workout-art`; set `FEATURED_WORKOUT_PHOTO` in `home-media.ts` to use a bundled photo). Compact **Nutrition** card (protein ring, calories vs target) and **This week** card (finished vs planned workouts; bars as tall as time trained; opens Progress). Weekly-review entry. Each part loads independently (one failing card doesn't break others); **pull-to-refresh**; haptic on crossing calorie target (Capacitor Haptics). Two-column tablet layout.

### 10.4 Train tab (`/workout`)

Custom header with a Plan / History switch (two links in an ink pill, `aria-current="page"`); Monday–Sunday date strip (today filled lime; dot for planned training; olive dot when done; rest days aren't buttons); today's workout as the ink hero (start / resume / done / activity / rest); the week's sessions as compact rows; plan facts. **Workout detail** (`/workout/session/:id`, immersive): image hero fading into the page, expandable exercise rows (prescription, muscles, equipment, demonstration, substitution info), Start (with one-workout-at-a-time conflict confirmation: continue the other / discard and start). **History** grouped by local month with a session-type filter only when more than one type exists; **History detail** shows recorded totals only (exercises with a done set, sets done, volume) in Exercises / Summary tabs.

### 10.5 Active workout (`/workout/session/:id/active`) — the most elaborate screen

Immersive, **always dark** (holds the native status bar dark via `holdAlwaysDark()`). Header: tonal icon buttons (exit, options), "Exercise 2 of 7", thin progress bar; the workout name is the page `h1`. **Demonstration stage** always present (so layout doesn't jump): placeholder with "How to do it"; photos load only on request, played in turn like a GIF with Pause/Play (paused by default under reduced motion) and retry on failure. **Sets panel**: completed rows read as results ("50 kg × 10" with a filled check that undoes/edits), the current row highlighted (`aria-current="step"`, "Current set" for screen readers), later rows quiet but editable; sets are **prefilled from last time** and show the planned prescription. **Rest ring** (drains; pause/resume; restart; skip; programmed rest shown before start; measured against an end instant so a throttled tab doesn't drift; never blocks). **Next-up card** (same action as footer, with confirmation). **Persistent footer**: workout time (measured from the log's start so it's right after resume), "Complete set", "Next exercise"/"Finish workout". Sheets: exit ("Leave this workout?"), move-to-next confirmation, finish confirmation, options (discard workout — destructive red), "Discard and start" for conflicts. Resumable after app close/force-stop; log persists after every change. Muscle figure component highlights trained muscles (ember `train` tokens — the only place that token is used). **Hardware back (uncommitted):** Android Back now opens the same "Leave this workout?" dialog instead of leaving.

### 10.6 Workout summary (`/workout/summary/:id`)

Four views: **Overview** (check+confetti "Complete" only if every set was completed, otherwise "Workout finished"; duration, exercises, sets, volume only with weighted sets, % sets completed, a highlight that states only what the log shows), **Exercise breakdown** (recorded order, sets/reps/load range/volume, done/partly/skipped mark; rows with completed sets open that exercise's Progress page), **Performance insights** (vs the latest earlier workout of the same kind [session type + variant; volume only in the same unit], up to five-workout volume trend, "New best volume" only if strictly higher than every earlier one; "Not enough history yet" otherwise), **What's next** (next planned day, nutrition, progress, recovery text — not a link). No calories shown.

### 10.7 Progress tab (`/progress`, also `/you/progress`)

Overview / Workout / Body switch (UI state). **Body cards:** latest weight, body-fat %, skeletal muscle mass each with the difference vs previous recording (arrow + sign, never judged good/bad). **Weight trend** chart with ranges 1M/3M/6M/1Y/All. **Consistency:** workouts per Monday–Sunday week over the last 12 weeks (ring = share of counted weeks with a workout; this week outlined; plan's weekly sessions as a dashed reference line). **Key metrics:** total workouts, total volume per unit, average duration. **Exercise list** with search (accent/case-insensitive), body-area chips, sort (recent, name), mini trend of last six comparable sessions. **Exercise performance** (immersive): ranges 1M–All, best set, change first→last, chart of one value per session (top weight/volume/reps/time), sessions open their workout.

### 10.8 Nutrition / Fuel (`/nutrition` …)

Daily log: selected date with prev/next and a Monday–Sunday strip (future days disabled); calorie ring ("1,450 of 2,000 kcal", remaining or over); macro bars where targets exist (without targets: intake only + notices with actions); **Log food** button (suggested meal by time of day); four meal rows that expand to entries; link card to Calorie Check-in; calendar button to Week. **Add food** (immersive): day & meal shown; search over **Recent foods only** (last 30 days, de-duplicated, all words must match) with loading/none/no-match/error states; "+" logs it again as-is (disabled while saving and 1.5 s after, so a double tap never logs twice; result announced); tap row to change first; "Enter food manually" opens the shared food form (name, quantity+unit, meal, calories, macros). **Edit food:** serving size, number-of-servings stepper (0.5 steps), live totals from the domain, meal pills; Save updates the same entry; Delete asks first (red destructive confirm). **Week:** Day/Week switch, calories-by-day chart (food bar vs dashed target outline; "– Not logged"), averages over logged days only, macro chips (Protein/Carbs/Fat), day list. **Calorie check-in:** see §7.6; confirm sheets before saving.

### 10.9 You hub (`/you`)

Photo/initials, name, age and height (only when known), goal card (opens Profile editor), six tiles: Profile, Weight, Body measurements, Body composition, Fitness review, Quick add; link to Progress; an **account card** (signed in: email/name, sign out; guest: sign in / create account; "accounts unavailable" when off); Settings: **Appearance** (System/Light/Dark), **Units** (metric/imperial), **Your plan** (Free or Premium; opens `/offer`), and a coming-soon list (push notifications, connected health apps). **Name and photo sheet** (photo resized on device before storing). **Profile editor** (`/onboarding/review`, immersive): grouped field-like rows (Personal details, Goal, Training), each opens the existing step with its validation; "Save profile" re-runs the assessment.

### 10.10 Body tracking

- **Weight history:** ranges, latest value large with change from first in range and range min/max; area chart; entries list with change vs previous; add/edit/delete (delete confirmation); **Weight entry** (immersive): large field + ±10 fine-adjust slider; "Use as profile weight" (confirmed; then the updated assessment is shown); no notes field (model has none).
- **Measurements:** Chart/List switch; one line per site with its own colour **and marker shape**; legend toggle buttons (`aria-pressed`); readings also as text; entry screen with date + five sites (any subset).
- **Body composition (InBody):** history of report cards (placeholder sheet art — images aren't stored), latest value per metric and change vs previous report in the same unit; **detail** (Overview/All values tabs; key tiles; composition bars; shares-of-weight labelled as calculated only for masses in the weight's unit); **entry**: Take photo (`capture="environment"`) or Choose file → extraction fills the form (review step with warnings; nothing saved until Save), manual entry always available; edit/delete from detail (delete confirms; other data untouched). No segmental view (the extraction doesn't read it).
- **Weekly Fitness Review** (`/you/review`, immersive): week navigation; Summary / Trends / Insights; "View detailed progress".

### 10.11 Notifications (in-app only)

Reminders are **derived each time from the user's data** (no scheduling or delivery): workout in progress or planned today (and not yet trained), recovery check-in not done, no food logged today, weigh-in due (none ever, or ≥7 days). Ids are day-stable (`planned:<session>:<date>`), so read state (`fitness.notifications-read`) resets daily. Inbox filters All / Unread / Workouts / Nutrition (query param `filter`), Mark all read, detail with facts and one action; a reminder no longer current says so and has no action. Empty states: "No notifications yet", "All caught up!", "No workout/nutrition notifications".

### 10.12 Quick Add

Registry `shell/quick-add/quick-add.actions.ts`: Start workout (resumes in-progress, else opens today's session in Workout Detail — never starts silently; rest days → Workout tab), Add food (today), Log weight, Add measurement, Add InBody (all `available: true`); **Progress photo** (`available: false` → "Coming soon"). If navigation fails, the sheet reopens so the tap isn't lost.

### 10.13 Plan offer, Free/Premium and the custom plan

**Offer page** (`/offer`, full screen, "Choose your plan"): a **Free** card ("Everything in StokeForm today is included") listing every built Free feature with checkmarks, and a **Premium** card. With no billing provider (`NO_BILLING`, the only one) the Premium card says "Planned, not available yet" and lists the Premium features with clock icons: **no price, no trial, no checkout button** (these appear only if a real `BillingProvider` returns store-localized products; prices/terms are never hard-coded). "Continue with Free" always works and clears the one-time marker; reachable again from You → Your plan (copy: "You can change your mind any time from You"). The choice is recorded locally (`stokeform.plan-choice`).

**Feature matrix** (`core/entitlements/access-policy.ts`, `FEATURE_MATRIX`; screens call `canAccess(feature, plan)` and never compare plans themselves; a feature that is not built is accessible to no one):

| Tier | Features |
|---|---|
| **Free, built** | personal workout plan; exercise library (browse, search, details, photos); guided workout logging with rest timer; workout history and summaries; exercise progress and personal bests; food log with calorie/macro targets; calorie check-ins; weight tracking; body measurements; body composition records; reading an InBody report from a photo; weekly fitness review; in-app reminders; StokeForm account |
| **Premium, built** | custom workout plan (build and edit your own) — **unavailable to everyone until billing exists** |
| **Premium candidates, not built** | back up and sync across devices; progress photos; connect health apps |

Principle: everything that existed before Premium stays Free, so the offer takes nothing away; when a Premium feature becomes server-backed the server must enforce it too (a client check is not authorization). A lapsed subscription keeps an existing custom plan and logging/history but cannot edit.

**Custom plan UX.** Workout tab → plan section: "Build my own" (generated plan) or "Edit my plan" (custom), a "Plan: Generated plan / Custom plan" fact, and a confirmed "Use generated plan". The **editor** (`/workout/plan/edit`) lists each training day with its exercises, per-exercise sets / reps (or seconds) / rest fields with inline validation messages (e.g. "Enter 1–10 sets"), reorder up/down, remove, and weekly-sets-per-muscle feedback; the **picker** (`/workout/plan/edit/:sessionId/add`, same page as the Free library) searches by name, filters by muscle and equipment (incl. "Bodyweight"), shows details in a sheet (muscles, equipment, demonstration photos) and adds/removes exercises (max 12 per day; a full day stops accepting). The draft is held in `CustomPlanDraftService` so picks persist when returning from the picker; text fields stay as typed until converted by `toSpec`.

**Billing is not integrated.** `BillingProvider` is provider-neutral (`availability`, `purchase`, `restore`, authoritative `activeSubscription`). To go live: choose a provider (Google Play Billing / App Store, directly or via a service — a product/legal decision), create store products, verify purchases **server-side** and tie them to the account (never a client-supplied user id), handle refunds/grace/cancellation/expiry (expired → Free), and add the store-required terms to the offer page. Tests prove the Premium path only via a test-only provider (`core/entitlements/testing/premium-billing.ts`) that the app never provides.

### 10.14 Account screens (`/auth/*`, `features/auth`)

`account-form.page` serves both **sign-in** and **create account** (email + password, with a name on sign-up), **forgot-password** (asks for an address and says the same thing whether or not it has an account), and **auth-callback** (Google return: reads `code`/`error` from the deep link or web callback and completes sign-in). Sign-up never reveals whether an address is registered and produces **no session until the emailed link is opened**; signing in with an unconfirmed address (right password) sends a fresh link and shows a "confirm your email" state. Google failures map to fixed messages (`account-not-linked`, `email-not-verified`, `google-failed`, expired code). All error strings come from `auth-content.ts`; nothing from the server is shown verbatim. Sign-in/sign-up are skipped when already signed in. Existing local data is never read, uploaded or erased by signing in or out.

---

## 11. Design system and color theme

Full token-level detail is in `docs/design-system.md`; this section reproduces the **complete color theme** and the rules around it.

### 11.1 Rules (source-of-truth order)

- `src/theme/*.scss` (values) → design doc (rules) → `shared/ui` components. Components only use `var(--color-*)`, `--space-*`, `--radius-*`, font/motion/shadow tokens and the mixins (`fx.text(step, weight)`, `fx.eyebrow`, `fx.focus-ring`, `fx.safe-area-padding`, `fx.pressable`, `fx.tabular-numbers`, `fx.button-reset`). **Never hex values, raw `rgba()`, Sass palette maps or `--ion-*` directly.** `_ionic-bridge.scss` maps each palette onto Ionic's `--ion-*` variables so stock Ionic components match.
- **Four palettes with the identical key set** (enforced by `variant($base, $overrides)`, which fails the build on an unknown key): `$light`/`$dark` (**classic**: cobalt-blue primary, still the *root* palettes and the fallback for any surface that forgets a screen theme) and `$warm`/`$charcoal` (the **StokeForm redesign**: ink + lime on a warm paper background / charcoal).
- **Two independent axes.** (1) *Appearance* (user setting in You: System/Light/Dark; `ThemeService` toggles `theme-light`/`theme-dark` on `<html>`; no class = follow the OS). (2) *Screen theme*, opt-in per screen by a class on the routed page host (never on `ion-app`/`body`/the shell): none = classic; `fit-theme-dashboard` = `$warm` in light Appearance and `$charcoal` in dark; `fit-theme-immersive` = `$charcoal` always (active workout, workout detail/history, add food, weight/measurement/InBody entry and detail, Fitness Review, Exercise Performance, Profile editor, parts of Assessment/Summary/Notifications). A page can pick per view by binding both classes to one signal (never both true). Sheets render outside the page, so **every `fit-bottom-sheet` must pass `screenTheme`** (a sheet without it falls back to classic blue — found and fixed in QA). The native status bar follows Appearance; always-dark screens call `ThemeService.holdAlwaysDark()`.

### 11.2 The brand palette in words

- **Warm paper** `#F5F4EE` (page background), **white** cards `#FFFFFF`, **ink** `#151714` (text and the one dark hero card per screen), **lime** `#C5F36B` (the brand colour: primary actions, selection, progress on ink), **charcoal** `#0F100E` (dark/immersive background, surfaces `#1A1C19` / `#222520` / `#2A2D28`).
- **The mark** (logo) is an "S" drawn as a thick round-capped **lime** stroke plus a four-point **spark/star**, on an **ink** `#151714` rounded tile (sources `src/assets/brand/stokeform-mark.svg`, `stokeform-icon.svg`; `npm run brand:assets` regenerates the favicon, Android launcher icons [legacy, round, adaptive foreground inside the 66 dp safe zone], adaptive-icon background colour and splash images from them using headless Chrome). No new colours were introduced for the brand. The in-app wordmark is plain text "StokeForm" in the header style.
- **Domain hues** (each only on its own data, always with an icon and a label): **ember** `#E5482A` (dark `#FF7A52`) = training; **teal** `#0D8A79` (dark `#2DD4BF`) = body data; cobalt (classic) = actions/nutrition. *As built*, only the active workout's muscle figure uses ember and no screen uses teal yet; body data uses lime/olive like everything else.
- **Lime rules.** Lime is 1.16:1 on the warm background and 1.28:1 on white, so on light surfaces it can **only be a fill** (with ink content, 14.1:1) — never text, icon, border, focus ring, chart line or progress stroke. Hence role-split tokens: brand **text/links** `--color-primary-text` `#3F5E0A` (6.8:1 on bg), brand **graphics** (progress fills, selection rings) `--color-primary-strong` `#5F8F14` (3.5:1 on bg, 3.9:1 on white), **focus ring** = ink `#151714`. On charcoal, `primary-text`, `primary-strong` and `focus` are lime itself (13.4:1 on surface).
- **Charts and gradients:** brand rings/bars use a lime→`primary-strong` gradient (`fit-progress [gradient]`); weight line on white cards is olive (`primary-strong`); measurement lines use distinct colours **and marker shapes**; macros: protein `primary-strong`, carbohydrates `primary`, fat `warning`, always named next to the colour.

### 11.3 Complete color tokens (all four palettes; CSS custom properties `--color-<token>`)

| Token | Classic light | Classic dark | Warm (dashboard, light) | Charcoal (dashboard dark + immersive) |
| --- | --- | --- | --- | --- |
| `bg` | `#f7f8fa` | `#0b0d10` | `#f5f4ee` | `#0f100e` |
| `surface` | `#ffffff` | `#15181d` | `#ffffff` | `#1a1c19` |
| `surface-elevated` | `#ffffff` | `#1c2027` | `#ffffff` | `#222520` |
| `surface-muted` | `#f0f2f5` | `#22272f` | `#eceae2` | `#2a2d28` |
| `text` | `#111318` | `#f5f7fa` | `#151714` | `#f5f4ee` |
| `text-secondary` | `#5b6170` | `#9ca3af` | `#5c5f57` | `#a3a79c` |
| `text-tertiary` (placeholders/disabled only) | `#9ca3af` | `#6b7280` | `#8e8c84` | `#6b7067` |
| `text-on-muted` | `#5b6170` | `#9ca3af` | `#5c5f57` | `#a3a79c` |
| `border` | `#e5e7eb` | `#292e36` | `#e4e2da` | `#2c2f2a` |
| `border-strong` | `#d1d5db` | `#3a404a` | `#cfcdc4` | `#3d413a` |
| `track` | `#eceef2` | `#262b34` | `#eceae2` | `#2c2f2a` |
| `primary` | `#1f6bff` | `#4d8dff` | **`#c5f36b`** | **`#c5f36b`** |
| `primary-pressed` | `#1a5ce0` | `#3d7cf0` | `#b5e54f` | `#b5e54f` |
| `primary-soft` | `#eaf1ff` | `#16233b` | `#eaf6cf` | `#26301a` |
| `primary-text` | `#1a5fe6` | `#6ea2ff` | `#3f5e0a` | `#c5f36b` |
| `on-primary` | `#ffffff` | `#0b0d10` | `#151714` | `#151714` |
| `primary-strong` | `#1f6bff` | `#4d8dff` | `#5f8f14` | `#c5f36b` |
| `focus` | `#1f6bff` | `#4d8dff` | `#151714` | `#c5f36b` |
| `ink` | `#14161c` | `#20242e` | `#151714` | `#23261f` |
| `on-ink` | `#ffffff` | `#ffffff` | `#f5f4ee` | `#f5f4ee` |
| `on-ink-secondary` | `#a3a9b6` | `#a3a9b6` | `#a3a79c` | `#a3a79c` |
| `ink-accent` | `#ff7a52` | `#ff7a52` | `#c5f36b` | `#c5f36b` |
| `ink-track` | `rgba(255,255,255,.14)` | `rgba(255,255,255,.12)` | `rgba(245,244,238,.14)` | `rgba(245,244,238,.12)` |
| `ink-outline` | transparent | `#6b7280` | transparent | `#5e6359` |
| `train` (ember) | `#e5482a` | `#ff7a52` | `#e5482a` | `#ff7a52` |
| `train-text` / `train-soft` / `on-train` | `#c2381a` / `#fdece7` / `#ffffff` | `#ff8f6b` / `#2e1a14` / `#14161c` | same as classic light | same as classic dark |
| `body` (teal) | `#0d8a79` | `#2dd4bf` | `#0d8a79` | `#2dd4bf` |
| `body-text` / `body-soft` | `#0b7a6b` / `#e3f5f2` | `#5eead4` / `#0f2a27` | same as classic light | same as classic dark |
| `success` | `#16a34a` | `#22c55e` | `#15963f` | `#22c55e` |
| `success-soft` / `-text` / `on-success` | `#e8f6ee` / `#15803d` / `#111318` | `#10291b` / `#4ade80` / `#0b0d10` | `#e8f6ee` / `#15803d` / `#111318` | `#10291b` / `#4ade80` / `#0b0d10` |
| `warning` | `#f59e0b` | `#fbbf24` | `#f59e0b` | `#fbbf24` |
| `warning-soft` / `-text` / `on-warning` | `#fef4e2` / `#b45309` / `#111318` | `#2e2410` / `#fcd34d` / `#0b0d10` | same as classic light | same as classic dark |
| `danger` | `#dc2626` | `#f87171` | `#dc2626` | `#f87171` |
| `danger-soft` / `-text` / `on-danger` | `#fdecec` / `#b91c1c` / `#ffffff` | `#2f1517` / `#fca5a5` / `#0b0d10` | same as classic light | same as classic dark |
| `scrim` | `#111318` | `#000000` | `#151714` | `#000000` |

Role summary: **Page** `bg`; **surfaces** `surface` (cards), `surface-elevated` (sheets/popovers), `surface-muted` (wells, tracks, skeletons, tonal controls); **text** `text` / `text-secondary` / `text-on-muted` / `text-tertiary`; **lines** `border` (separators), `border-strong` (input outlines), `track` (progress tracks); **brand fill** `primary` + `on-primary` (primary button, Quick Add, selected indicator, solid chip); **brand tint** `primary-soft` + `primary-text` (secondary button, soft chips, links); **hero** `ink`, `on-ink*`, `ink-accent`, `ink-track`, `ink-outline` (the one dark card per screen); **status** `success/warning/danger` — base = graphic/fill, `-text` = text, `-soft` = tinted background, `on-*` = content on the base fill; **overlay** `scrim`. Also emitted: `--color-scrim-rgb`, `--color-ink-accent-rgb` (for shadows only). Verified ratios: warm `text-secondary` 5.9:1 on bg / 6.5:1 on white; `on-ink-secondary` 7.4:1 on ink; charcoal `text-secondary` 7.0:1 on surface; `ink-accent` 12.0:1 on ink; every solid chip pair ≥ 4.5:1 in all four palettes. Documented gaps: `border-strong` input outlines are ~1.45–1.65:1 (below 3:1) and `text-tertiary` is ~3.06–3.4:1 (placeholders/disabled only).

### 11.4 Other design-system essentials
- **Typography:** Inter Variable. Steps: display-xl 48/52, display 32/40, h1 28/34, h2 22/28, h3 18/24, body 16/24, body-sm 14/20, caption 12/16 (smallest allowed). Weights 400/500/600/700. Tabular numbers for changing numerals.
- **Spacing** 4/8/12/16/20/24/32/40/48; gutter 20 (16 at ≤360px); page max 640px (70em for two-column); tap targets 44px (52px for primary/mid-workout); radii 8/12/16/20/24/pill; elevation tokens (card, hero, raised, sheet); motion tokens (120/200/700 ms; reduced-motion collapses to 0 and sequences that autoplay start paused).
- **Components** (`shared/ui`, `fit-` prefix, presentational, OnPush, signal inputs): `fit-button` (variants primary, secondary, outline, ghost, **danger**, **ghost-danger**, on-ink, ghost-ink; sizes md 44 / lg 52), `fit-icon-button` (aria-label enforced by lint), `fit-card` (default/muted/ink), `fit-section-header`, `fit-metric`, `fit-progress` (bar/ring, gradient), `fit-chip`, `fit-notice`, `fit-avatar`, `fit-empty-state`, `fit-skeleton`, `fit-text-field`, `fit-segmented-control` (default, ink, compact, inverse, pills, underline), `fit-choice-group` (list/grid/chips/circles), `fit-ruler` (ARIA slider; drag/flick/snap/tap/keys/wheel), `fit-bottom-sheet`, `fit-page` (large title that collapses; custom header; refreshable; wide).
- **Copy conventions:** sentence-case buttons ("Finish workout", "Build muscle"; proper nouns like "Upper Body A", "InBody" keep capitals); destructive actions red (`danger` for the confirm, `ghost-danger` for the opener, neutral `outline` for cancel); lime stays for primary/positive actions.
- **Imagery:** no photography ships: workout art is a generated seeded SVG (`app-workout-art`), food thumbs and report thumbs are placeholders, onboarding welcome/body figures are placeholders (`onboarding-media.ts`).
- **Ionic mode independence:** UI must look identical in `ios` and `md` modes; never rely on mode-only features (e.g. `collapse="condense"`); test with `?ionic:mode=ios|md`.

---

## 12. The StokeForm server (API, accounts, database, InBody extraction)

### 12.1 Role and shape

`server/` is a standalone Node service (no web framework; `node:http` + a Web-standard `Request → Response` handler) that is the app's **only backend**. One entry (`app-handler.ts`) routes `/api/auth/*` and `/v1/auth/*` to the account routes and everything else (`/health`, `/ready`, InBody extraction, 404s) to the extraction handler. It has three jobs:

1. **Accounts** (Better Auth): identity only — email, name, Google link, sessions.
2. **InBody extraction proxy**: keeps the **OpenAI API key off the device**.
3. **Database foundation** (Neon PostgreSQL schema + migration tool): ready, **holding no app data yet**.

It is built by `server/build.mjs` (pinned esbuild) into four bundles — `main.mjs` (API), `migrate.mjs`, `cleanup.mjs`, `email-test.mjs` — and shipped as a container (§14).

### 12.2 HTTP surface

| Route | Purpose |
|---|---|
| `GET /health` | `{ "status": "ok" }` while the process is up; never touches the database |
| `GET /ready` | `SELECT 1`: **200** `{status:"ready"}` or **503** `{status:"unavailable"}` and nothing else; cached 10 s (polling can't become DB load) |
| `POST /v1/inbody-extractions` | Raw report image → validated `inbody-extraction.v1` JSON (details in §12.4) |
| `POST /api/auth/sign-up/email` | Creates an **unconfirmed** account, emails a confirmation link, returns **no session**; an existing address gets the same answer and no email (no enumeration) |
| `POST /api/auth/sign-in/email` | Session token in the `set-auth-token` header; unconfirmed address → 403 `EMAIL_NOT_VERIFIED` and (only with the right password) a fresh link |
| `GET /api/auth/verify-email?token=` → `GET /v1/auth/email-verified` | The emailed link confirms the address (no session) and lands on a static "Email confirmed, go back to the app" page |
| `POST /api/auth/request-password-reset`, `GET /v1/auth/reset-password?token=`, `POST /api/auth/reset-password` | Password reset (below) |
| `POST /api/auth/sign-out`, `POST /api/auth/update-user` | End session; update the display name (bearer token) |
| `GET /v1/auth/me` | 401 without a valid, **confirmed** session; else `{ user:{id,email,name,emailVerified}, session:{expiresAt} }` |
| `GET /v1/auth/providers` | `{ accounts, emailPassword, google }`: which sign-in methods this server offers (the app hides what's off) |
| `GET /v1/auth/google/start?redirect=&challenge=` → Google → `GET /api/auth/callback/google` → `GET /v1/auth/google/complete` → `POST /v1/auth/mobile/exchange` | Google sign-in hand-off (below) |

Deliberately closed (404): Better Auth's `/api/auth/one-time-token/*`, `/api/auth/send-verification-email` (would email anyone), and its redirecting `/api/auth/reset-password/<token>`.

### 12.3 Accounts: how they work

- **Library:** Better Auth 1.7.10 with Kysely/pg on the `auth` schema. Accounts are **off until `BETTER_AUTH_SECRET` is set** (then `DATABASE_URL` and `BETTER_AUTH_URL` are required); email/password is on only with email delivery configured; Google only with its credentials. While off, account routes answer 503 `auth-not-configured` and everything else works (the app shows accounts as unavailable and runs as a guest app).
- **Verified identities only.** Email/password: no session until the address is confirmed via the emailed link (24 h, signed, built by the server with its own landing page — a client-sent `callbackURL` is ignored). Google: identity is read **on the server** from the ID token returned to the server by Google's token endpoint (code + client secret over TLS); nothing the app or browser sends is trusted as identity; an address Google reports unverified gets no session. `authenticate()` treats an unconfirmed user's session as no session at all.
- **Account linking** (explicit in `auth.ts`: `trustedProviders: []`, `requireLocalEmailVerified: true`, `allowDifferentEmails: false`): a Google sign-in joins an existing account with the same address **only if** Google says the address is verified **and** the existing account's address is confirmed; otherwise the app is told `account-not-linked`.
- **Tokens.** The app (WebView origin `https://localhost`) and API are different sites, so cookies would be third-party; the app sends `Authorization: Bearer <signed token>` (unsigned/altered tokens refused). Stored in Android Keystore-backed secure storage (never `localStorage`); sessions last `AUTH_SESSION_DAYS` (default 30, 1–90) and are extended once a day while used; sign-out on one device leaves others signed in.
- **Google on Android without a secret in the app (PKCE-style):** the app makes a random 32-byte **verifier**, stores it securely, opens a Custom Tab at `/v1/auth/google/start` sending only its **SHA-256 challenge**; after Google, the server makes a **3-minute single-use code** bound to the challenge and redirects to `com.stokeformfitness.app://auth/callback?code=…` (or `?error=account-not-linked|email-not-verified|google-sign-in-failed`), which reopens the app (intent filter); the app posts `{code, verifier}` to `/v1/auth/mobile/exchange` for its token. A stolen code is useless without the verifier; the redirect must be in `AUTH_APP_REDIRECT_URLS`. If Android killed the app while the browser was open, the link is read as the launch URL (handled once). Known weakness: a custom-scheme link could be registered by another app (Android App Links would be stronger).
- **Password reset.** "Forgot your password?" always answers identically (no enumeration; no timing difference). `POST …/request-password-reset` (3/min/client) stores a **1-hour single-use token** and emails a link to the server's own static page, which strips the token from the address bar/history, asks for the new password twice (8–128 chars), and posts it (10/min/client). Success **revokes every session** of the account; a bad/used/expired token changes nothing; a too-short password does not consume the link. A never-confirmed account can reset (how the real owner reclaims an address from a squatter) but still can't sign in until confirmed. Without email delivery, reset is disabled.
- **Cleanup job** `cleanup.mjs` (`npm run server:cleanup` = **preview by default**, `:apply` deletes): removes only old (default ≥ 14 days) **unconfirmed, password-only accounts with no sessions, data or pending tokens**, FK-discovered data tables, `FOR UPDATE SKIP LOCKED`, `--limit` (default 50), idempotent, re-checked in the deleting statement. Meant to run as a Cloud Run **job + Cloud Scheduler** (documented in `CLOUD_RUN.md`, **not created**). Run the preview first: the npm scripts read `DATABASE_URL` from `server/.env`, which is the one real database.
- **Rate limits** (per client): sign-in 5/min, sign-up 3/min, confirmation links 10/min, reset requests 3/min, new passwords 10/min. Tests prove forged `Host`/`X-Forwarded-For` can't move emailed links or evade limits.
- **Email.** `EMAIL_DELIVERY=resend` (real, needs `RESEND_API_KEY`, `EMAIL_FROM` on a verified domain) or `dev-outbox` (writes files under git-ignored `server/.dev-outbox`; refused unless `BETTER_AUTH_URL` is localhost and not production). `npm run server:email:test -- --to <addr>` sends one test message to an explicit address (masked output). Failures are logged at ERROR severity as `auth.email-failed` with the provider and an HTTP status (never links, tokens, addresses or passwords). **Resend has never been exercised with real credentials.**
- **Logging:** codes, statuses and durations only; no tokens, links, emails, passwords, IPs or provider text.

### 12.4 InBody extraction endpoint

`POST /v1/inbody-extractions` — raw image bytes (`Content-Type: image/png|jpeg|webp`) → `200` validated `inbody-extraction.v1` JSON, or `{ "error": { "code", "message" } }` with fixed messages.

- Calls the **OpenAI Responses API** (`POST https://api.openai.com/v1/responses`) with the request built by the shared domain function `inBodyExtractionRequest`, **Structured Outputs `strict: true`**, `store: false`. The model name comes from `OPENAI_MODEL` (not hard-coded; must be a vision model supporting Structured Outputs). The answer is validated server-side with the strict contract and **again in the app**.
- Upload checks: declared type must be PNG/JPEG/WEBP **and match the file signature**; the streamed read stops at the size limit (413).
- **Limits:** per-client fixed-window rate limit (default 5 per 15 min), a global **daily extraction cap** (default 200 — a cost ceiling), **max concurrent extractions** (default 4; extra requests get `503 server-busy` + `Retry-After` *before the upload is read*; the slot is released on every outcome), request/header timeouts, and a CORS allow-list of exact origins (`*` refused; Capacitor origins `capacitor://localhost` iOS, `https://localhost` Android; requests without `Origin` are served under the same limits).
- **Privacy:** image and extraction live in memory for the request only; nothing written to disk; logs carry event names/status/durations only (never the image, values, client IPs or provider text); provider errors map to fixed codes/messages; the key goes only to `api.openai.com` in the `Authorization` header and is never logged/returned/in errors. Without key/model the server still starts, logs `server.not-configured`, and answers extraction with `503 not-configured` without reading the upload.
- **Error codes → HTTP:** `empty-upload`/`invalid-image` 400; `origin-not-allowed` 403; `not-found` 404; `method-not-allowed` 405; `upload-too-large` 413; `unsupported-media-type` 415; `extraction-refused` 422; `rate-limited`/`service-limit-reached` 429; `internal-error` 500; `extraction-incomplete`/`invalid-extraction`/`provider-error` 502; `not-configured`/`server-busy`/`provider-unavailable` 503; `provider-timeout` 504.
- Rate-limit and hand-off state is **per process memory**, so production needs `--max-instances 1` (§14).

### 12.5 Database (Neon PostgreSQL), migrations and schema

- **State:** one Neon database (it is *the production database*; there is no separate dev database — local runs with `server/.env` touch real data, so tests use throwaway `@example.test` accounts and a Neon branch/snapshot is advised before schema changes). Migrations **0001–0007 are applied**; `migrate status` reported "up to date". **No application code writes to the `stokeform` data tables yet** (the app still uses `localStorage`); only Better Auth writes to `auth`.
- **Tooling:** `npm run server:migrate[:status]` (explicit, never run by the server), uses the **direct** (non-pooled) URL (`MIGRATION_DATABASE_URL`, refusing `-pooler` hosts unless `--allow-pooled`), per-migration transaction + history row in `stokeform.schema_migrations` (version, name, checksum, time), session advisory lock (two runners are safe), checksum verification (an applied file edited afterwards, or a DB ahead of the files, stops the run). The one exception ever made: on 18 Oct 2026 migrations 0001–0007 were rewritten in place to rename the schema to `stokeform`; **from real user data on, applied migrations are never edited**.
- **Config:** `DATABASE_URL` (runtime, Neon **pooled**), `DATABASE_POOL_MAX` (5; 1–20), `DATABASE_IDLE_TIMEOUT_MS` (10 s), `DATABASE_CONNECT_TIMEOUT_MS` (10 s), `DATABASE_STATEMENT_TIMEOUT_MS` (15 s). TLS is required except on localhost; the pool connects on first use so a sleeping Neon (≈3 s wake) never blocks container start.
- **Migrations:** `0001_schemas` · `0002_profile_and_preferences` · `0003_workouts` · `0004_nutrition_and_body` · `0005_checkins_and_notifications` · `0006_auth_tables` (exactly Better Auth's generated SQL; a test fails if an upgrade expects a different shape) · `0007_user_ownership` (adds `REFERENCES auth."user"(id) ON DELETE CASCADE` to the 10 root tables, so deleting an account deletes all its data).
- **Two schemas:** `auth` (Better Auth: `user`, `session`, `account`, `verification`) and `stokeform` (this project's tables + `schema_migrations`). Better Auth never touches `stokeform`; project code never writes `auth`.
- **Schema principles** (`docs/database-schema.md`): mirror domain rules with `CHECK` constraints (the app's validation stays first, DB is last); **every row belongs to a user** with `user_id text` leading each primary key `(user_id, id)` (the app's ids aren't UUIDs and plan ids are content hashes, so they're unique per user, not globally); preserve the app's own `created_at`/`updated_at` instants and local calendar `date`s; canonical metric units (a workout log keeps its own kg/lb); **derived data is never stored** (daily totals, assessment, age, streak, reviews).
- **Tables:** `user_profiles` (one row per user: goal, DOB, sex, height_cm, weight_kg, unit_system, experience, 2–6 days, location, `equipment text[]`, activity, optional target weight, Calorie-Check-in calibration as 4 all-or-none columns, `assessment_reviewed_for`) · `user_preferences` (display name ≤40, theme, **`avatar_object_key`** — a reference to a private object, never image bytes) · `workout_plans` (whole plan as `jsonb` + key facts; at most one `is_current`) · `workout_logs` → `workout_log_exercises` → `workout_log_sets` (relational so best sets/volume can be aggregated; at most one `in-progress` log per user; `plan_id`/`session_id` without FK so history survives plan regeneration; value columns exist only on completed sets) · `food_entries` · `weight_entries` · `measurement_entries` + `measurement_values` · `body_composition_assessments` + `body_composition_values` (22 metrics, unit fixed by metric; manual vs import provenance) · `daily_check_ins` · `notification_reads` · `schema_migrations`. Plans are `jsonb` because they're only read/written whole and regenerated deterministically; logs are relational because history/charts query sets.
- **Next (not done):** data endpoints, an import/sync path from `localStorage`, private Cloudflare R2 for images (profile photo, report images).

### 12.6 Configuration reference (environment variables only; errors name the variable, never its value)

| Variable | Default | Notes |
|---|---|---|
| `OPENAI_API_KEY` | — | **Secret.** Required for extraction |
| `OPENAI_MODEL` | — | Required for extraction |
| `OPENAI_MAX_OUTPUT_TOKENS` / `OPENAI_TIMEOUT_MS` | 8000 / 90000 | 1000–64000 / 5000–300000 |
| `INBODY_MAX_UPLOAD_BYTES` | 8 MiB | ≤ 20 MiB; the app pre-checks 8 MiB |
| `MAX_CONCURRENT_EXTRACTIONS` | 4 | 1–100 |
| `ALLOWED_ORIGINS` | none | Exact origins; also Better Auth's trusted origins. Android `https://localhost`, iOS `capacitor://localhost`, web dev `http://localhost:4200` |
| `RATE_LIMIT_PER_CLIENT` / `RATE_LIMIT_WINDOW_MS` | 5 / 15 min | InBody limiter |
| `DAILY_EXTRACTION_LIMIT` | 200 | Provider calls/day, all clients |
| `CLIENT_IP_HEADER` | none | Only behind a trusted proxy (`x-forwarded-for` on Cloud Run; the **last** entry is used) |
| `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `DATABASE_*` | none | See §12.5 |
| `BETTER_AUTH_SECRET` | unset = accounts off | ≥ 32 random chars; signs tokens/cookies/links; rotating signs everyone out. **Secret** |
| `BETTER_AUTH_URL` | required with the secret | Public origin, https except localhost, no path |
| `EMAIL_DELIVERY`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_DEV_OUTBOX_DIR` | unset | See email above |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | unset | Both or neither |
| `AUTH_APP_REDIRECT_URLS` | `com.stokeformfitness.app://auth/callback` | Add `http://localhost:4200/auth/callback` for web dev |
| `AUTH_SESSION_DAYS` | 30 | 1–90 |
| `HOST` / `PORT` | 127.0.0.1 / 8787 | `HOST` defaults to `0.0.0.0` when `NODE_ENV=production`; Cloud Run supplies `PORT` |

### 12.7 Tests

`npm run server:test` — **274 tests passing** (Vitest, Node env, fake OpenAI client, **PGlite** in-process Postgres for migrations/schema/auth/cleanup; no network, no real key or database). Specs: auth, auth-config, cleanup, config, database, database-config, email, extraction-handler, log, migrations, node-server, openai-client, readiness, schema. The real `pg` driver path was verified against a throwaway local PostgreSQL 17 and against Neon (TLS, pooled + direct, idempotent migration, `/ready`). A **synthetic** InBody380 fixture (fictional female, 172 cm, 68.4 kg, test date 2026.09.14) is used; **never put real report values in fixtures**. Gotchas: run Vitest from `D:\` (uppercase drive); server `src/` must never import `fs` (file I/O lives in `tools/`); test new server code on another port with `BETTER_AUTH_URL` overridden, since a user-started server on 8787 runs whatever build was last started.

### 12.8 Client side of the extraction (`core/inbody/inbody-extraction.client.ts`)

Checks file type/size/empty first, POSTs with a 120 s timeout, maps server codes to client failures (`unsupported-type | too-large | empty | unavailable | rejected-file | busy | refused | network | service | invalid-response`), re-validates with `parseInBodyExtraction`. The endpoint comes from the `INBODY_EXTRACTION_ENDPOINT` token → `environment.inbodyExtractionEndpoint`; **`null` hides all upload UI**.

---

## 13. Environments, configuration and external dependencies

**`src/environments/environment.ts` (dev)** and **`environment.prod.ts`** (swapped by `fileReplacements` in the production build). Public values only — never secrets:

| Field | Dev | Prod |
|---|---|---|
| `production` | false | true |
| `apiBaseUrl` (accounts; `null` hides accounts) | `http://localhost:8787` | `https://deploy-fitness-app-backend-893557393361.europe-west1.run.app` (Cloud Run) |
| `inbodyExtractionEndpoint` (`null` hides upload) | `http://localhost:8787/v1/inbody-extractions` | the same Cloud Run host + `/v1/inbody-extractions` |
| `exerciseMediaBaseUrl` | jsDelivr URL of `yuhonas/free-exercise-db` pinned to commit `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5` `/exercises/` | same (set `null` to hide demonstrations) |

**External network dependencies at runtime:**

1. **jsDelivr CDN** — exercise demonstration photos from free-exercise-db (public domain / The Unlicense), loaded **only when the user asks** ("Show demonstration"/"How to do it"). Offline = demonstrations show a retry state. Credit string: "Photos: free-exercise-db (public domain)". 58 of 77 exercises have a *faithful* mapping (same movement, same equipment type); the rest deliberately show none rather than a different movement (e.g. Archer Push-Up, Burpees, several band variants).
2. **The StokeForm API on Google Cloud Run** (`apiBaseUrl`) — accounts and InBody extraction; in dev, `http://localhost:8787`. Production builds therefore **call the cloud service**, but the deployed image predates the accounts code (§14.3), so account routes there currently answer 404 and the app treats accounts as unavailable.
3. **Server-side only:** OpenAI (extraction), Neon (database), Google OAuth (sign-in), Resend (email, untested), Secret Manager.
4. Inter font is bundled (no Google Fonts request).

No analytics, ads, crash reporting, or remote config.

---

## 14. Build, run and deployment

### 14.1 Scripts (`package.json`)

| Command | Purpose |
|---|---|
| `npm start` | `ng serve` dev server (default config `development`, port 4200) |
| `npm run build` | Production build → `www/` (hashed bundles, `3rdpartylicenses.txt`, assets) |
| `npm run watch` | Development-config rebuild on change |
| `npm run lint` | ESLint over `src/**/*.ts` and `src/**/*.html` |
| `npm test` | `ng test` (Vitest + jsdom; use `-- --watch=false` for a single run; `ci` configuration is `watch: false`) |
| `npm run server:install` | `npm --prefix server ci` (the server has its own dependencies; run once and after lockfile changes) |
| `npm run server:build` | `node server/build.mjs` → `server/dist/{main,migrate,cleanup,email-test}.mjs` |
| `npm run server:start` | build + `node --env-file-if-exists=server/.env server/dist/main.mjs` (listens `127.0.0.1:8787`) |
| `npm run server:test` / `server:typecheck` | Server tests / `tsc -p server/tsconfig.json` |
| `npm run server:migrate` / `server:migrate:status` | Apply / list database migrations (**touches the one real database** with `server/.env`) |
| `npm run server:cleanup` / `server:cleanup:apply` | Preview / delete old unconfirmed accounts |
| `npm run server:email:test -- --to <addr>` | Send one test email to the named address |
| `npm run brand:assets` | Regenerate favicon, launcher icons and splash images from the artwork in `scripts/brand-source/` (no dependencies) |
| `npm run android:debug:local` / `android:debug:cloud` | Build the Android debug APK against the local API (via `adb reverse tcp:8787`) or the Cloud Run API (PowerShell script `scripts/android-debug.ps1`; installs nothing, never signs a release) |

### 14.2 Local development recipe

```
npm install
npm start                              # app on http://localhost:4200
# optional, for photo import and accounts:
npm run server:install                 # once: the server's own dependencies
cp server/.env.example server/.env     # fill OPENAI_*, DATABASE_URL, BETTER_AUTH_*, EMAIL_DELIVERY=dev-outbox ... (never commit)
npm run server:start                   # http://127.0.0.1:8787 (dev-outbox writes confirmation/reset emails to server/.dev-outbox)
```

`ALLOWED_ORIGINS` in `.env.example` defaults to `http://localhost:8100,http://localhost:4200`. **Warning:** `server/.env`'s `DATABASE_URL` is the one real Neon database; use throwaway `@example.test` accounts when testing locally. Append `?ionic:mode=ios` or `?ionic:mode=md` to the dev URL to check both Ionic modes.

### 14.3 Deployment status — honest summary

| Target | Status |
|---|---|
| **Web** | The production build runs as a static SPA (needs SPA fallback to `index.html` for deep links; `<base href="/">`). **Not hosted anywhere** — no hosting config, no deploy script. |
| **Android** | Capacitor project exists (`appName` and launcher label "StokeForm"; deep-link intent filter `com.stokeformfitness.app://auth/callback` for Google sign-in; permission `INTERNET` only; `allowBackup="true"`). A **debug APK** was built and installed on one physical phone (§15). **No release signing config, no Play Store setup, versionCode 1 / versionName "1.0"**, `minifyEnabled false` in release. Launcher icons/splash are generated from the StokeForm mark (verified from the built APK and offline mask previews only, **not yet seen on a phone**). |
| **iOS** | **Not added.** Would need `npx cap add ios` and a Mac/Xcode. |
| **API server on Cloud Run** | **Deployed, but an old build.** Service `deploy-fitness-app-backend`, project **`fitness-app-511714`** (number 893557393361), region **`europe-west1`**, public URL `https://deploy-fitness-app-backend-893557393361.europe-west1.run.app`. Image from commit `c1c92a3` (**no accounts code**; `/v1/auth/providers` answers 404 there). Settings read from Google Cloud on 16 Oct: **max-instances 20** (accounts need **1**), concurrency 80, timeout 300 s, 512 Mi, unauthenticated invocation allowed (protection = CORS, size/rate limits, OpenAI spend cap), runs as the default compute service account; plain env `NODE_ENV`, `OPENAI_MODEL`, `ALLOWED_ORIGINS` (`https://localhost,capacitor://localhost`), `CLIENT_IP_HEADER=x-forwarded-for`, `DATABASE_*` tuning; Secret Manager secrets **`OPENAI_API_KEY`** and **`DATABASE_URL`** (upper-case names). `/health` and `/ready` return 200. No `BETTER_AUTH_*`, `GOOGLE_*`, `RESEND_*`/`EMAIL_*` settings, no Cloud Run job, Cloud Scheduler API not enabled. **Trap:** this machine's default gcloud project is a different one (`wallpaper-generator-509111`) — every command must pass `--project fitness-app-511714`; never accept "enable API?" prompts for the default project. **Unverified:** that the deployed `DATABASE_URL` secret points at the same Neon database as `server/.env`. |
| **Accounts in production** | **Not enabled.** A 10-step ordered plan with prerequisites P1–P9 is in `server/AUTH.md` ("Enabling accounts in production"): confirm which DB the secret points at; rotate the Neon password and OpenAI key; take a Neon backup; set up and test **Resend** with a verified sending domain; add the production redirect URI to the Google OAuth client; create secrets (`BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `GOOGLE_CLIENT_SECRET`); deploy the new build **inert** (without `BETTER_AUTH_SECRET` the account routes answer 503 and the app runs as guest) and check `/health`, `/ready`, providers all false, a synthetic extraction; create the cleanup job in preview mode; then turn accounts on with one `gcloud run services update` (adds secrets/vars **and** `--max-instances 1`) and verify with a real account on a phone. Rollback = route traffic to the previous revision or remove `BETTER_AUTH_SECRET`; migrations need no rollback. Note the production app's `apiBaseUrl` already points at this service, so the account screens appear as "unavailable" until step 9. |
| **Container image** | Root `Dockerfile` (two-stage; `node:24-slim`; pinned esbuild bundles four `.mjs` files; runs as the unprivileged `node` user; no `node_modules` at runtime; includes `migrations/`; exec-form `CMD ["node","main.mjs"]` so SIGTERM is handled; `PORT=8080`). `.dockerignore`/`.gcloudignore` allow-list only `server/` and `src/app/domain/`, so `.env` files and report photos never enter the build. Smoke-tested locally (non-root, `/health`, validation, CORS, 413, SIGTERM). Deploy: `gcloud run deploy deploy-fitness-app-backend --source . --project fitness-app-511714 --region europe-west1` (run by the owner; nothing here deploys automatically). |
| **Scaling constraint** | Rate limits, the daily extraction cap and the Google hand-off codes live in **instance memory**: accounts require `--max-instances 1` (consequences: counters reset when scaled to zero, a deploy can interrupt a Google sign-in; `--min-instances 1` avoids cold starts). Keep a monthly spend limit on the OpenAI project — the real cost cap. |
| **Database** | Neon, migrations 0001–0007 applied (§12.5). Key rotation of the leaked Neon password is **unconfirmed** (§17). |
| **CI/CD** | None in the repo. |
| **Release readiness** | Blocked on §19 items: unencrypted local storage, client-only age gate, accounts not live, no billing, no release signing, no store assets. |

Capacitor config is minimal (`appId com.stokeformfitness.app`, `appName StokeForm`, `webDir www`). The Android manifest handles configuration changes (`orientation|…|uiMode|density`), so rotation does not restart the activity; portrait is **not** locked.

---

## 15. Android build and device testing

**Setup done 15 Oct 2026 (Windows 11, no admin):** user-level **scoop** installs of `temurin21-jdk` and `android-clt` (SDK root `C:\Users\keshu\scoop\apps\android-clt\current`, platform 36, build-tools 36.0.0, licences accepted with user approval). `JAVA_HOME`/`ANDROID_HOME` are **not** persisted — export per shell (`JAVA_HOME=C:\Users\keshu\scoop\apps\temurin21-jdk\current`). adb is standalone at `C:\Users\keshu\platformtools\platform-tools`.

**Build:** `npm run build && npx cap sync android && cd android && ./gradlew.bat assembleDebug` (first run ≈ 5 min). Output: `android/app/build/outputs/apk/debug/app-debug.apk`.

**Device test (Samsung SM-A336E, Android 16, 384×853 CSS px, DPR 2.81)**, driven by adb + Chrome DevTools attached to the WebView (`adb forward tcp:9444 localabstract:webview_devtools_remote_<pid>`; works in the debug build). **Passed:** 27 routes (no overflow), keyboard, weight save/delete, a full workout including timers across background and force-stop, system dark mode, cold start ≈ 0.75 s. Phone data was backed up and restored. The harness scripts lived in a session scratchpad only (not in the repo).

**Findings from that pass and their status:**

| Finding | Status |
|---|---|
| Large font scale (1.5): Home ring text overflows | Fixed and committed: `--text-scale` CSS variable scales ring sizes |
| "Progress" tab label truncated at 150% | Fixed and committed: tab label no longer ellipsised |
| Muscle chips clip at 150% | **Open** |
| Hardware Back leaves an active workout without prompt | Fixed and committed: `Platform.backButton` handler opens the exit dialog |
| Landscape cramped (portrait not locked) | **Open** (decision: lock portrait or design landscape) |
| Reinstall of the fixed build on the phone | Done during the 18 Oct pass below (against the local API) |

**Second phone pass (18 Oct 2026, same phone, local API over `adb reverse tcp:8787`):** existing-user path, the offer from You, Android Back, restart-resume and a cancelled Google flow passed; two device-only defects were fixed (light status-bar text on the dark welcome step; hardware Back on the sign-in/sign-up screens stepping the hidden onboarding page instead of leaving them). **Not done:** a completed real Google or email sign-in on the phone in the final first-run flow (the phone's chooser lists another person's account), so the real name update, profile-created-once and offer-once on device are **unverified**. Google sign-in itself was verified on the phone earlier (16 Oct). Phone data was snapshotted and restored byte-identical (scripts only in a session scratchpad). Clearing localStorage over CDP needs ~10 s before a force-stop or old data returns.

The production web build now points at the Cloud Run API (`apiBaseUrl`, `inbodyExtractionEndpoint`), so the InBody photo option is **shown** in the APK built with the production config, but the deployed server image predates accounts; demonstrations need internet.

---

## 16. Testing and quality gates

- **App: 146 spec files, 2171 tests, all passing** (`npm test -- --watch=false`, ≈25 s, run 19 Oct 2026 on the working tree). **Server: 274 tests passing** (`npm run server:test`, run 19 Oct 2026). Project notes also recorded lint, `tsc` and the production build green on 18 Oct; **lint, `tsc` and the build were not re-run for this revision**.
- Coverage emphasis: the **domain layer is heavily unit-tested** (calculation engine incl. boundaries, workout engine with **golden plans** in `domain/workout-programming/testing/golden-plans.ts`, workout logging, nutrition math in exact tenths, calorie check-in gates, weekly review rules, strict parsers, extraction contract/mapping/request); **view-model functions** have their own specs; **page specs** render components in jsdom (with `MemoryKeyValueStorage` and a fake `CLOCK`); **onboarding tests** include "every ruler tick round-trips to itself"; **server tests** (see §12.7) cover config, handler paths, node server streaming limits, the OpenAI client with a fake, the real migrations on PGlite, schema constraints, Better Auth flows (including Google linking through Better Auth's real callback with only Google's token endpoint simulated), email, and the cleanup job's races.
- `src/test-setup.ts` polyfills `matchMedia`, registers icons, and installs a MutationObserver that removes leftover `ion-modal` elements (spec files share one document because the builder runs Vitest with `isolate: false`).
- **No end-to-end/UI automation suite is committed.** QA of the running app was done with ad-hoc scripted headless Chrome over CDP (`chrome.exe --headless=new --remote-debugging-port=…`, Node's global WebSocket, seeded `localStorage`) and the adb/DevTools harness above; those scripts are *not* in the repo. A saved reproducible screenshot set is a stated next step.
- **Caution:** `npm test` must run with nothing else loading the machine — concurrent browser automation caused 5 s timeouts and a runaway `NG0406` log (300+ MB).
- **First-run journey QA (18 Oct 2026):** headless Chrome over CDP against the dev server with the account endpoints mocked in the page (no request reached the real backend), at 320/360/390/430 px light (320 and 390 dark; 320 with a keyboard-height viewport): welcome → every question → review → account (signed out / signed in / signed in without a name) → email sign-in, sign-up, pending-confirmation, forgot-password → finish with plan preview → assessment → offer → You → Home. Result: no horizontal overflow, no clipped labels, footer button inside the viewport, tap targets ≥ 40 px except Home's two section-title links (32 px, not part of first run); the Free card lists all free features so Premium sits below the first screen at 320 px (a design call). Not covered: real device first-run, Ionic ios/md modes, tablets.
- **Visual QA (15 Oct 2026):** 29 page components checked at 320/390/430 px in light & dark, scripted for overflow/clipped text/tiny controls/console errors; 8 defects fixed (sheets without `screenTheme`, dark-mode sheet host opacity, Next-up card word-break, empty-state gutters, Exercise Performance wrapping, Measurements axis duplicate month labels, History filter pill alignment, 3-digit protein vs ring). The approved mockup HTML files are **not on disk**, so the pass checked consistency with the design doc, not pixel parity.

---

## 17. Security, privacy and safety design

**Handled**

- **Accounts:** no session without a confirmed address; Google identity read server-side; explicit account-linking rules; sign-up/reset answers identical for known/unknown addresses; bearer tokens signed, kept in Keystore-backed secure storage (never `localStorage`); password reset single-use 1 h tokens that revoke all sessions; per-client rate limits; forged `Host`/`X-Forwarded-For` tested; logs never contain tokens, links, emails or passwords; Better Auth tables foreign-keyed so deleting an account cascades to its data.
- OpenAI key lives only in `server/.env` (git-ignored; `.env`, `.env.*` ignored except `.env.example`); the client bundle and `environment*.ts` hold no secrets (verified key-free in `src`, `www` and environments on 11 Oct 2026). Server never logs/echoes the key; validation errors never echo model-written keys or values.
- Uploaded reports and extractions are in-memory only on both sides; the app tells the user the image goes to an external AI service before sending.
- Strict parsing of all stored data; unknown versions read as empty; photos validated as `data:image/(jpeg|png|webp);base64,…` ≤ 300,000 chars.
- Product safety guard on calories (1200/1500 floors) and `review-required` withholding; macros never silently cut; Calorie Check-in changes capped at 250 kcal and require confirmation; no "diet-culture" scoring.
- Destructive actions confirm first (delete weight/food/InBody, discard workout).

**Known security/privacy gaps (documented `TODO(security, before production)` in the repositories)**

1. **All personal and body data is stored unencrypted** as plain JSON in `localStorage` (profile incl. date of birth/sex/height/weight/goals, plan, workout logs, food log, weight, measurements, InBody assessments, check-ins, name and photo). Needs review (platform secure storage / encrypted local store; server as source of truth once an API exists) before release.
2. **Minimum age 18 is enforced client-side only**; a backend must also enforce it once profiles are server-side.
3. **OpenAI key exposure incident (11 Oct 2026):** a live key had been placed in `environment.ts` (never committed; removed) and printed in a past tool output. The user was told to **revoke/rotate it**; **rotation has not been confirmed**. `server/.env` holds a key of the same kind — never print it. Git history was checked: the current key is in no tracked file or history.
4. **Real InBody data exists in the working directory/history:** root files `20261001095249.png` and `IMG-20261012-WA0006.jpg` are the owner's own report images — **do not open, commit, or share them**. An earlier commit (`c6d1cb4` and later) contained real report values in test fixtures; the current fixtures are synthetic, but **history was not rewritten**.
5. **The InBody extraction endpoint requires no sign-in** (origin allow-list + per-IP rate limit + daily cap + OpenAI spend cap only), even though accounts now exist; gating it on a session is possible once accounts are live.
6. **A Neon database password leaked** into `server/.env.example`, was committed and pushed (commit `8981114`; a later "remove credentials" commit removed it from the files but it remains in Git history). The owner was told to reset it; **reset not confirmed**. Same for the OpenAI key (#3). Treat both as compromised until rotated.
7. **Local runs hit the production database** (only one Neon DB exists), so development mistakes can affect real accounts.
8. No dependency/licence audit documented; no CSP configured for the web build (the server's static reset/confirmation pages do use a nonce CSP); Android's own backup is switched off (`allowBackup="false"` plus `data_extraction_rules.xml`).
9. Custom-scheme deep link (`com.stokeformfitness.app://`) could be claimed by another app; mitigated by the PKCE-style verifier, Android App Links would be stronger.
10. Email delivery (Resend) and production account flows are untested with real credentials.

---

## 18. Accessibility

Target **WCAG 2.1 AA**. Mechanisms: contrast ratios documented per token pair (text ≥4.5:1; icons/progress/focus ≥3:1); never colour alone (filled-vs-outline tab icons, text trends, status chips with words, marker shapes in charts); 44 px touch targets (52 px for primary/mid-workout); visible focus ring on every interactive element via `fx.focus-ring`; icon-only controls require `aria-label` (lint-enforced); progress bars/rings carry `label` and `valueText`; charts are `aria-hidden` with an equivalent spoken list/table; `aria-current` for current set/page; `aria-pressed` on toggle legends; live-region announcements (rest done, food logged); text wraps instead of clipping (`flex-wrap`, `minmax(0,1fr)`, `overflow-wrap:anywhere`); `prefers-reduced-motion` honoured through motion tokens and Ionic `animated` config; `fit-ruler` is an ARIA slider with keyboard support and always has a typed alternative.

**Documented accessibility gaps:** `border-strong` input outlines are only ~1.45–1.65:1 (below 3:1); `text-tertiary` is 3.06–3.4:1 on light/charcoal (used only for placeholders/disabled); inputs rely on visible labels + focus state. **Not yet verified:** screen-reader output, reduced motion in practice, keyboard-only navigation end-to-end, large-text behaviour (partially addressed by the uncommitted `--text-scale` work). The user's stated next step includes an accessibility pass.

---

## 19. Known issues, limitations and technical debt

**Product / UX**

- No food database/barcode → food logging is manual or re-log of recent foods. No default step goal setting (10,000 fixed). Steps are self-reported.
- Automatic plan regeneration when programming inputs change can replace a plan the user is following (should become an explicit choice).
- The plan's weekday layout is a product default in the UI; the user can't move training days.
- Progression rules exist in the plan but are **not applied** to history (no automatic load suggestions); only "prefill from last time" exists.
- Landscape is cramped on phones; portrait is not locked.
- Muscle chips clip at 150% font scale (open). Notifications filter row scrolls sideways at 320 px by design.
- Dev-mode `NG0956` warnings (tracking expression re-creation for single-item lists on Assessment footer, Active Workout muscle chips, Workout Summary views) — harmless; absent in production builds.
- `fit-bottom-sheet`'s close button is not yet a `fit-icon-button` (consolidation candidate).
- Teal `body*` colour tokens are unused; ember `train*` is used only for the muscle figure.
- Classic palettes (`$light/$dark`) are still the *root* palettes; making `$warm/$charcoal` the root and retiring classic is a pending reviewed change (any new surface that forgets its screen theme falls back to blue).
- Placeholder imagery everywhere (no photography ships).

**Engineering**

- Storage is `localStorage` (size-limited ~5 MB, synchronous underneath, wiped with site data). Workout logs are kept indefinitely with no archiving; the identity photo is a data URL. A `KeyValueStorage` swap to Capacitor Preferences/SQLite is anticipated but not done.
- No schema migration for profile v1 (treated as no profile → onboarding again).
- No CI, no release pipeline, no crash reporting, no logging strategy on the client.
- Android release build is not configured (no signing, no minification, no store listing assets). Launcher icons/splash are generated from the StokeForm mark (`npm run brand:assets`) but not yet seen on a physical phone.
- Server rate-limit state is per process; not horizontally scalable as is.
- Docs drift: `docs/design-system.md` Visual-QA tables date from 15 Oct and predate the accounts/offer/custom-plan screens (its "First-run journey QA" section covers those); `README.md` was updated for accounts but should be re-read for stale lines.
- Backend: no data endpoints; the Postgres schema is unused by the app; no account deletion or "change password while signed in" yet (reset by email only); the cleanup job is not scheduled; Resend is untested; the deployed image is old; the InBody endpoint needs no sign-in.
- Premium: the custom-plan feature is built but unreachable to everyone (no billing provider), so its behaviour with a real subscription is unverified; a billing/product decision is pending.
- A new device (or reinstall) repeats the questionnaire because no profile is stored server-side, even for a returning account.
- The account name-update call (`POST /api/auth/update-user` with bearer) has not been tried against the real server.- Mockups that defined the redesign are not stored in the repo.

**Unverified in this document**

- Real-device behaviour of safe-area insets, on-screen keyboard, haptics, pull-to-refresh and native date picker on iOS (no iOS build exists); Ionic `ios` vs `md` modes (only default run in QA); tablet two-column layouts; screen reader output; populated Body Composition screens with a real report (needs the extraction server + key); exercise-demo photos loading on device.

---

## 20. Open product and infrastructure decisions

(The code deliberately stops at these; ask the owner rather than assuming.)

1. **Enabling accounts on the deployed Cloud Run service** (the 10-step plan in `server/AUTH.md`): Resend sender domain, production Google redirect URI/client, secrets, `--max-instances 1`, deploy a current image. Hosting itself is chosen (Cloud Run + Neon + planned Cloudflare R2); the per-upload size limit beyond 8 MB is still open.
2. **PDF support** for InBody reports (today PNG/JPEG/WEBP only).
3. **Confirm rotation of the OpenAI key and the leaked Neon password** (§17).
4. **Sync strategy:** data endpoints and an import path from `localStorage` to the existing Postgres schema; a server-side profile (so a new device does not repeat the questionnaire); encrypted local storage; server-side age enforcement; whether to gate the InBody endpoint on a session.
4b. **Billing:** choose a provider (Google Play Billing / App Store, directly or via a service), define the final Premium matrix (the custom plan is the only built Premium feature; backup/sync, progress photos and health sync are candidates), write the terms, verify purchases server-side. Nothing here is decided and no prices or trials should be invented.
5. **iOS**: add platform, signing, App Store path.
6. **Release/versioning** strategy for Android (signing keys, Play Store listing, app icon/splash).
7. **Design calls still open:** use of teal `body*` tokens; retiring classic palettes; larger card radii globally; real photography/illustration for onboarding, workouts and food; portrait lock vs landscape support.
8. **Whether regeneration of the plan should be explicit** once users follow it; whether training weekdays should be user-assignable.
9. **Accessibility pass** and fixing the two documented contrast gaps (input outline, tertiary text).
10. **Saved reproducible screenshot set / E2E tests** (owner's stated next step), plus testing populated Body Composition screens with a real report.

---

## 21. Project history and working conventions

**Timeline (79 commits to 18 Oct; the early part from git log):** 8 Oct 2026 app shell + Quick Add → 9 Oct workout page, weight and measurement tracking, domain profile/assessment/engines → 10–11 Oct body composition, AI InBody onboarding + server, security fixes, exercise demonstrations, recent foods, weekly nutrition summary, weekly review, Calorie Check-in → 9–14 Oct (in parallel branch `claude/sharp-brown-jjp18e`, PRs #1–#12) the **screen-by-screen redesign**: foundation + Home → Active Workout → Workout tab/detail/history → Progress → Nutrition → You/body tracking → Onboarding (12 screens) → Assessment → Workout Summary → Notifications → 15 Oct visual QA, Android platform + Gradle wrapper (`51dbcb4`), Cloud Run deployment docs and Dockerfile (`bd835a6`), PGlite migration tests and tools (`8981114`), credentials removed from `.env.example` (`c1c92a3`) → 16 Oct Better Auth accounts incl. the Google sign-in callback (`47ee976`) → 18 Oct rebrand to **StokeForm**, account gate in onboarding, one-time offer page (`53253bb`), **Premium custom workout plan** (`964ff5c`; PR #13 merged as `d098850`).

**Design decisions approved by the owner (9 Oct 2026):** palette applies app-wide (blue = actions/nutrition in classic, ember = training, teal = body data; secondary text darkened to `#5b6170` in classic); Today's workout CTA **starts** the workout directly; Home shows a weight card with trend but body measurements stay off Home; extras in scope: pull-to-refresh, haptic on crossing calorie target, collapsing "Today" title, two-column tablet layout; target WCAG 2.1 AA. Later decisions: sentence-case copy; red destructive actions; FFM ≠ lean body mass; reports never persisted; age never converted to DOB.

**Working conventions** (from `README.md`/design doc):

- Never hard-code colours or sizes; use tokens and mixins.
- Components standalone, OnPush, signal inputs/outputs; `fit-*` presentational only; feature-specific components in `features/<area>/components`.
- Add routes in the feature's own `<area>.routes.ts`; full-screen flows that hide the tab bar go beside the shell route in `app.routes.ts` *above* the wildcard.
- Domain code: explicit `asOfDate`, `{ok,value|error}` results, new `calculationVersion` / programming `version` for result-changing edits; UI copy must say "estimated"/"starting".
- Quick Add: ship an action by flipping `available` and handling `(actionSelected)` in `TabsPage`.
- Don't change routes, domain logic, persistence or copy semantics as part of a visual change.
- Don't add a shared component until two screens need it (or one needs it and it encodes an accessibility rule).
- Git: feature branches + PRs; the owner commits themself (assistant edits are left uncommitted unless asked).
- Accounts: no session without a confirmed email; nothing from the client is trusted as identity; sign-in/out never reads, uploads or erases local fitness data; Premium access is decided only by `canAccess()` and a verified entitlement; docs and commands must name the real Cloud Run project (`--project fitness-app-511714`) and the upper-case secret names `OPENAI_API_KEY` / `DATABASE_URL`; `gcloud --set-secrets` / `--set-env-vars` replace whole lists (use `--update-*`).
- Naming: **StokeForm** is final (do not propose alternatives); the app id is `com.stokeformfitness.app`; the npm package `fitness-app` keeps the old name. Commit messages follow conventional style (`feat(scope):`, `fix(scope):`, `docs:`).

---

## 22. Uncommitted work at time of writing

`git status` on 19 Oct 2026 (branch `main`, HEAD `d098850`): 11 modified files, all small polish of the **first-run finish step and the Premium custom-plan screens**, none committed:

| Area | Change |
|---|---|
| `onboarding/steps/finish-step.component.{ts,scss}` | Wording of the "Use generated plan" choice ("Free. You will start with the plan above."), style simplification |
| `workout/custom-plan/custom-plan-editor.page.{ts,html,scss}`, spec | Android hardware Back acts as **Cancel** (unsaved changes confirmed first; passes through when the exercise picker is on top); layout tweaks; leaving the editor goes to the Workout tab, which sends first-run users on to the assessment |
| `workout/custom-plan/exercise-picker.page.{ts,html,scss}`, `custom-plan-content.ts` | Exercise rows show muscles and an "Equipment: …" line, a `fit-icon-button` replaces an `ion-icon` control, style simplification |
| `workout/workout.page.ts` | The Workout tab reloads when the stored plan changes while it waits under a full-screen route (saving a custom plan, switching back to the generated one) |

Everything described elsewhere in this file (accounts, offer, rebrand, custom plan, text-scale, Back handling in the active workout) is **committed**.

---

## 23. Glossary

- **BMR** – basal metabolic rate (Mifflin-St Jeor here). **TDEE / maintenance** – BMR × activity multiplier. **Safety threshold** – product floor on calories, not medical advice.
- **Assessment** – the engine's output for a profile (estimates + targets + explanation). **Reviewed** – the user has seen the assessment for the current profile version.
- **Plan** – a generated, versioned weekly program. **Session** – one planned day (resistance or activity). **Objective** – what a session must train; exercises fill objectives. **Variant** – A/B/C when a session type repeats.
- **Workout log** – a performed workout (snapshot). **Training workout** – a finished log with ≥1 completed set.
- **InBody** – a bioimpedance body-composition scanner; its printed result sheet is the report the app can read. **FFM** – fat-free mass (≠ lean body mass here). **SMM** – skeletal muscle mass. **PBF** – percent body fat. **SMI**, **ECW ratio**, **phase angle**, **BCM**, **BMC** – other report metrics.
- **Screen theme** – dashboard (warm light / charcoal dark) vs immersive (always dark) vs classic (default).
- **Ink hero** – the single dark featured card per dashboard screen. **Lime** – the redesign's primary fill colour `#C5F36B`.
- **Canonical units** – cm/kg storage regardless of display units.
- **Zoneless** – Angular without zone.js; change detection driven by signals/events.
- **StokeForm** – the product name (to *stoke* a fire + form). **Pulseform** – the retired placeholder name (may still appear in old commits and notes).
- **Better Auth** – the TypeScript auth library behind accounts. **Neon** – serverless PostgreSQL host. **Cloud Run** – Google serverless container host. **Secret Manager** – Google secret store. **Resend** – transactional email provider (planned). **PGlite** – in-process Postgres used in server tests. **R2** – Cloudflare object storage (planned for images).
- **Entitlement** – whether the person currently has a verified subscription (Free vs Premium). **Feature matrix** – the single table of which feature is Free/Premium. **`NO_BILLING`** – the default billing provider that sells nothing.
- **Account gate** – the onboarding step that requires sign-in before the profile is created. **Inert deploy** – deploying the new server without `BETTER_AUTH_SECRET`, so account routes answer 503 until switched on.
- **Verifier / challenge** – the PKCE-style secret and its SHA-256 that bind Google sign-in's one-time code to the app.
- **Custom plan** – a Premium plan whose exercises are the user's own picks; **generated plan** – the engine's plan.

---

## 24. How to use this file when asking an AI for help

Suggested framing for a prompt: *"Below is a full description of my Ionic/Angular/Capacitor fitness app. Use it as ground truth. Then help me with: …"*. Good tasks given this document:

- Design review: security/privacy plan for moving to encrypted storage or a backend; turning on accounts safely on Cloud Run; choosing and integrating a billing provider; designing the local-to-server data sync on top of the existing Postgres schema; Android release/signing checklist; iOS bring-up plan.
- Product/engineering planning: sequencing the "not built" list; designing history-based progressive-overload suggestions on top of the existing progression rules; designing a food database/barcode integration that preserves the "snapshot nutrition per entry" model; push notifications that reuse the derived-reminder rules.
- Review of domain choices: the calorie/protein formulas and safety floors, Calorie Check-in thresholds, volume-balancing numbers (all are "product defaults, not clinical prescriptions").
- Accessibility and QA planning: closing the documented contrast gaps, large-text support, an E2E/screenshot suite.

**Constraints to remember when proposing changes:** the name is StokeForm; accounts hold identity only and must not trigger data upload or deletion without an explicit design; Premium decisions go through the feature matrix and a verified entitlement (never invent prices or trials); the one Neon database is production; domain stays framework-free and clock-free; result-changing calculation/programming edits need a new version; never invent or zero-fill missing data; never convert FFM to lean body mass or age to DOB; never persist or log report images/values; no secrets in the client; copy is sentence case with destructive actions red; every sheet passes `screenTheme`; use tokens, not literals; keep Ionic `ios`/`md` visuals identical.

*End of document.*
