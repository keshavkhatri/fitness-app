# StokeForm — complete project reference

> **Purpose of this file.** A single, self-contained description of the whole project (product, architecture, domain logic, screens, data, design system, server, build and deployment, tests, known issues and open decisions), written so that an AI assistant (ChatGPT or similar) with **no access to the repository** can understand the app entirely and answer questions, review designs, or propose changes.
>
> **Written:** 15 October 2026, from a read of the repository at branch `main`, last commit `51dbcb4` ("Add Gradle wrapper and configuration files for Android project"), plus uncommitted work described in [§22](#22-uncommitted-work-at-time-of-writing). Where this file and the code disagree, the code wins. Statements that were *not* verified by running something are marked **(unverified)**.
>
> **Sibling docs in this repo:** `README.md` (feature list + conventions), `docs/design-system.md` (the UI contract, ~940 lines), `server/README.md` (extraction server), `docs/initial plan.md` (the original six-module product idea). This file consolidates and cross-checks them; it does not replace the design-system document for token-level detail.

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
11. [Design system](#11-design-system)
12. [The InBody extraction server](#12-the-inbody-extraction-server)
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

A **cross-platform (iOS/Android) personal fitness companion** built with **Ionic 9 + Angular 22 + Capacitor 8**. Brand name in the UI: **StokeForm** (`src/app/core/brand.ts`); Capacitor/Android app name is "StokeForm"; the app id `com.fitnessapp.app` and the root npm package name `fitness-app` are deliberately not named after the brand (installation, signing and the Google sign-in deep link depend on the id).

It is **local-first and single-user**: there is **no account, no login, no backend for user data, and no sync**. Everything the user records lives in the device's storage (`localStorage` via a storage abstraction). The only server in the project is a small optional Node service that proxies a photo of an **InBody body-composition report** to the OpenAI API and returns validated JSON; it stores nothing.

What a user can do today:

1. **Onboard** (12 screens): name, sex, date of birth, height and weight on drag rulers, activity level, goal, experience, days per week, training location, equipment. Optionally start from a photo of an InBody report (AI-read, user reviews every value).
2. See an **assessment** ("your starting point"): estimated BMR/maintenance, a starting calorie target, protein/carbs/fat targets, and a step-by-step explanation of how each number was derived.
3. Get a **deterministic, rule-based weekly workout plan** generated from the profile (not AI-generated), from a catalog of 77 exercises.
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
| InBody extraction server (Node, OpenAI Responses API) | Built, **not deployed** |
| Android project (Capacitor) + debug APK | Built; tested on one phone |
| Design system (tokens, 3 screen themes, ~20 `fit-*` components) | Built |

### Not built (by design or deferred)

- **Auth/accounts, backend API for user data, sync, multi-device.**
- **iOS platform** (`ios/` folder does not exist; `npx cap add ios` has not been run).
- **Push/system notifications** and notification settings (inbox is in-app only).
- **Health-app integration** (steps are typed in by the user; no HealthKit/Health Connect).
- **Progress photos** (Quick Add shows "Coming soon").
- **Food database, barcode scanning, photo food logging, meals/recipes.**
- **AI coaching, adaptive workout programming from history** (progression rules exist in the plan but are not applied automatically), **payments/subscriptions**.
- **PDF import** of InBody reports (PNG/JPEG/WEBP only).
- **Encryption of stored data** (see [§17](#17-security-privacy-and-safety-design)).
- **Calorie-burn estimates, 1RM estimates, PR badges, scores** — deliberately absent.
- **A real exercise library screen** (the original plan listed one; there is no standalone library page — exercise info appears inside workout detail rows).
- **Localization** (English only; copy lives in `*-content.ts` files, not i18n).
- **CI/CD** — there is no `.github/` folder or pipeline configuration in the repo.

---

## 3. Technology stack and versions

From `package.json` (exact pins unless a caret/tilde is shown):

| Concern | Choice |
|---|---|
| UI framework | **Angular 22.1.7** (standalone components, **zoneless**, signals, `resource()`, OnPush everywhere) |
| Mobile UI kit | **Ionic 9** (`@ionic/angular ^9.0.0`), `ionicons ^8.1.0` |
| Native shell | **Capacitor 8.5.3** (`@capacitor/core`, `android`, `cli`) + plugins `app 8.1.2`, `haptics 8.0.2`, `keyboard 8.0.6`, `status-bar 8.0.4` |
| Language | **TypeScript ~6.0.0**, strict, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `strictTemplates` |
| Styling | **SCSS** + CSS custom properties; **Inter Variable** font (`@fontsource-variable/inter`) bundled |
| Reactive | RxJS ~7.8 (minimal use; signals preferred) |
| Build | `@angular/build:application` (esbuild-based), output `www/` |
| Unit tests | **Vitest ~4.0.18** via `@angular/build:unit-test`, **jsdom ^30.1.1**; setup in `src/test-setup.ts` |
| Lint | **ESLint ^10.10** + `angular-eslint 22.5.0` (template accessibility rules on) + `typescript-eslint ^8.61` |
| Server | Node ≥22 (`--target=node22`), bundled with **esbuild ^0.28.2** to `server/dist/main.mjs`, tests in Vitest (Node env) |
| Required Node | **22.22.3+ or 24.15+** (Angular CLI 22 refuses older) |
| Browser targets | `.browserslistrc`: Chrome ≥119, Firefox ≥119, Edge ≥119, Safari ≥17, iOS ≥17 |
| Android | `minSdk 24`, `compileSdk/targetSdk 36`, Cordova Android 14.0.1 shim, JDK 21 to build |

Notable choices: no NgModules; no NgRx or other state library (services + signals); no HTTP client module (the only network calls are `fetch` from the InBody client and plain `<img>` loads of demonstration photos); no analytics or crash-reporting SDK (Angular CLI analytics id exists in `angular.json` — a CLI setting, not an app feature).

Bundle budgets (production): initial warning 2 MB / error 5 MB; any component style warning 4 KB / error 6 KB.

---

## 4. Repository layout

```
fitness-app/
├── README.md                       Feature list, structure, conventions, "Production readiness"
├── package.json / package-lock.json
├── angular.json                    Build/serve/test/lint targets; prod fileReplacements for environments
├── capacitor.config.ts             appId com.fitnessapp.app, appName "Fitness", webDir "www"
├── ionic.config.json               type angular-standalone, capacitor integration
├── eslint.config.js                Architectural lint rules (see §5.3)
├── tsconfig*.json, .editorconfig, .browserslistrc, .gitignore
├── docs/
│   ├── design-system.md            UI contract + per-screen reference implementations + visual QA record
│   ├── initial plan.md             Original 6-module product idea
│   └── app-overview-for-chatgpt.md THIS FILE
├── server/                         InBody extraction service (separate TS project, own tsconfig/vitest)
│   ├── src/{main,config,node-server,extraction-handler,openai-client,rate-limiter,report-upload}.ts
│   ├── test/*.spec.ts + fixtures.ts
│   ├── .env.example                (the real .env is git-ignored)
│   └── README.md
├── android/                        Capacitor Android project (added 15 Oct 2026; uncommitted parts, see §22)
├── www/                            Build output (git-ignored)
├── src/
│   ├── index.html, main.ts, global.scss, test-setup.ts
│   ├── environments/{environment.ts, environment.prod.ts}
│   ├── assets/icon/favicon.png
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

**Size (15 Oct 2026, raw `wc -l` line counts):** ≈ 37,300 lines of non-test TypeScript, ≈ 22,700 lines of spec TypeScript in 135 spec files, ≈ 11,400 lines of component SCSS plus ≈ 960 lines of global theme SCSS, ≈ 1,400 lines of server TypeScript (incl. tests). 29 `*.page.ts` routed page components (28 feature pages + the tab shell).

**Git:** remote `origin` = `https://github.com/keshavkhatri/fitness-app.git`. 72 commits on `main` between 8 and 15 Oct 2026 (the project is about one week old). Work was done on branches (e.g. `claude/sharp-brown-jjp18e`) merged by pull requests #1–#12.

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

Dependency direction is one-way: **domain ← core ← features/shell/shared**. The domain layer is deliberately runnable anywhere (the server imports the InBody extraction contract/request builder directly from `src/app/domain/inbody-extraction`).

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
- An **app initializer** that (1) registers the ionicons that are bundled (`registerAppIcons`: unregistered icon names don't render), (2) starts `trackTextScale()` (uncommitted, see §22), (3) awaits `ThemeService.restore()` so the stored theme applies before first paint.

Zoneless: no `zone.js` polyfill (`"polyfills": []`).

---

## 6. Data model and persistence

All user data is **device-local JSON in `localStorage`** under these keys (every repository wraps data in a versioned envelope; all are parsed strictly):

| Key | Contents | Owner |
|---|---|---|
| `fitness.profile` | `{ version: 2, profile: UserFitnessProfile }` | `LocalFitnessProfileRepository` |
| `fitness.assessment-reviewed` | `{ version: 1, profileUpdatedAt }` — marker that the assessment for that profile version was seen | `OnboardingStatusService` |
| `fitness.onboarding-progress` | resumable onboarding draft | `OnboardingProgressStore` |
| `fitness.workout-plan` | the generated `WorkoutPlan` snapshot | `LocalWorkoutPlanRepository` |
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
| `onboarding.guards.ts` | `requireOnboardingComplete`, `redirectIfOnboarded`, `requireProfile` |
| `UnitPreferenceService` | Changes `unitSystem` only; keeps plan; marks a reviewed assessment as reviewed for the new `updatedAt` |
| `FITNESS_CALCULATION_CONFIG`, `WORKOUT_PROGRAMMING_CONFIG` tokens | Inject engine configs (tests can override) |
| `FitnessAssessmentService` | profile → assessment via the engine |
| `WorkoutPlanService` | Create/keep/regenerate plan; serialized; `saved` flag if persistence failed |
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
| `trackTextScale()` (uncommitted) | Publishes `--text-scale` CSS variable from the user's OS/browser font size (§22) |
| `APP_BRAND` (`core/brand.ts`) | The wordmark name "StokeForm" |

---

## 9. Navigation, routes and guards

**First-run flow:** `onboarding` → `assessment` → `home`. Guards derive where the user must go: no profile → `/onboarding`; profile whose assessment is not reviewed → `/assessment`; otherwise the app. Editing the profile changes `updatedAt`, so its assessment is shown again (except for unit-only changes).

**Top-level routes** (`app.routes.ts`, 12 routes): `/onboarding` (lazy, `redirectIfOnboarded`), `/assessment` (lazy, `requireProfile`), two full-screen workout routes **outside the tab shell** (so no tab bar): `/workout/session/:sessionId/active` and `/workout/summary/:workoutId` (both `requireOnboardingComplete`), then the tab shell `''` with children `home`, `workout`, `nutrition`, `progress`, `you`, and `**` → `home`. All routes preload.

**Tab bar (5 tabs):** Home, **Train** (`/workout`), **Fuel** (`/nutrition`), **Progress** (`/progress`), You. Active tab uses a filled icon variant (state never by colour alone). Quick Add is not a tab: it opens from the You tab as a bottom sheet.

**Complete route/screen inventory** (route → page → screen theme):

| Route | Page | Theme |
|---|---|---|
| `/home` | Home dashboard | dashboard |
| `/home/notifications`, `/:id` | Notification inbox / detail | inbox: immersive for All/Unread, dashboard for category filters + empty; detail: dashboard |
| `/workout` | Workout tab (Plan) | dashboard |
| `/workout/history`, `/workout/history/:id` | History / History detail | immersive |
| `/workout/session/:id` | Workout detail | immersive |
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
| `/assessment` (`?view=macros|why|next`) | Assessment | immersive Results+Why, dashboard Macros+Next |

Several screens keep their sub-views on **query parameters on the same route** (assessment, workout summary, notifications filter) so browser Back, in-page Back and Android hardware Back all move between views without re-creating the page.

---

## 10. Screens and features, one by one

### 10.1 Onboarding (`/onboarding`)

Steps (`onboarding-steps.ts`): `welcome` → `report` (only when the user chose upload) → `basics` (name, sex as 3 cards, date of birth via platform date picker; 18+) → `height` (vertical ruler, 26 px per cm/in, cm ↔ ft-in switch, "Enter manually") → `weight` (horizontal ruler 0.1 kg/lb steps) → `activity` → `goal` → `goal-target` (only for lose-fat/build-muscle; optional target weight with direction check) → `experience` → `frequency` (2–6, `circles` layout) → `location` → `equipment` (3-column icon tiles, multiple) → `summary` ("Create my profile") → `finish` ("See my starting point"; the plan is created here and the screen says it is ready only once it was). Twelve screens in the common path. Progress shown as slim bar + `n/total` on question/review screens. Progress is **resumable** (`fitness.onboarding-progress`); progress from older versions still resumes. Answers are canonical metric; switching units changes only display and every ruler tick round-trips (tested for every tick) so toggling never drifts. A value from a report or typed may sit between ticks and is shown exactly until the ruler is moved. The name goes to the identity store, not the profile. There's no nutrition-preference question (the profile has no field for it). The welcome offers "Get started" and, when the build can read reports, "Set up from an InBody report instead".

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

Photo/initials, name, age and height (only when known), goal card (opens Profile editor), six tiles: Profile, Weight, Body measurements, Body composition, Fitness review, Quick add; link to Progress; Settings: **Appearance** (System/Light/Dark), **Units** (metric/imperial), and a coming-soon list (push notifications, connected health apps, subscription). **Name and photo sheet** (photo resized on device before storing). **Profile editor** (`/onboarding/review`, immersive): grouped field-like rows (Personal details, Goal, Training), each opens the existing step with its validation; "Save profile" re-runs the assessment.

### 10.10 Body tracking

- **Weight history:** ranges, latest value large with change from first in range and range min/max; area chart; entries list with change vs previous; add/edit/delete (delete confirmation); **Weight entry** (immersive): large field + ±10 fine-adjust slider; "Use as profile weight" (confirmed; then the updated assessment is shown); no notes field (model has none).
- **Measurements:** Chart/List switch; one line per site with its own colour **and marker shape**; legend toggle buttons (`aria-pressed`); readings also as text; entry screen with date + five sites (any subset).
- **Body composition (InBody):** history of report cards (placeholder sheet art — images aren't stored), latest value per metric and change vs previous report in the same unit; **detail** (Overview/All values tabs; key tiles; composition bars; shares-of-weight labelled as calculated only for masses in the weight's unit); **entry**: Take photo (`capture="environment"`) or Choose file → extraction fills the form (review step with warnings; nothing saved until Save), manual entry always available; edit/delete from detail (delete confirms; other data untouched). No segmental view (the extraction doesn't read it).
- **Weekly Fitness Review** (`/you/review`, immersive): week navigation; Summary / Trends / Insights; "View detailed progress".

### 10.11 Notifications (in-app only)

Reminders are **derived each time from the user's data** (no scheduling or delivery): workout in progress or planned today (and not yet trained), recovery check-in not done, no food logged today, weigh-in due (none ever, or ≥7 days). Ids are day-stable (`planned:<session>:<date>`), so read state (`fitness.notifications-read`) resets daily. Inbox filters All / Unread / Workouts / Nutrition (query param `filter`), Mark all read, detail with facts and one action; a reminder no longer current says so and has no action. Empty states: "No notifications yet", "All caught up!", "No workout/nutrition notifications".

### 10.12 Quick Add

Registry `shell/quick-add/quick-add.actions.ts`: Start workout (resumes in-progress, else opens today's session in Workout Detail — never starts silently; rest days → Workout tab), Add food (today), Log weight, Add measurement, Add InBody (all `available: true`); **Progress photo** (`available: false` → "Coming soon"). If navigation fails, the sheet reopens so the tap isn't lost.

---

## 11. Design system

Full detail in `docs/design-system.md`. Essentials:

- **Source-of-truth order:** `src/theme/*.scss` (values) → design doc (rules) → `shared/ui` components. Components only use `var(--color-*)`, `--space-*`, `--radius-*`, font/motion/shadow tokens and the mixins (`fx.text(step, weight)`, `fx.eyebrow`, `fx.focus-ring`, `fx.safe-area-padding`, `fx.pressable`, `fx.tabular-numbers`, `fx.button-reset`). **Never hex values, raw `rgba()`, Sass palette maps or `--ion-*` directly.**
- **Four palettes with identical key sets:** `$light`/`$dark` (**classic**: blue primary `#1f6bff`, root default and fallback), `$warm` (redesign light: bg `#f5f4ee`, white cards, ink `#151714`, lime primary `#c5f36b`), `$charcoal` (redesign dark `#0f100e`). `variant($base, $overrides)` fails the build on unknown keys.
- **Three screen themes** (opt-in via class on the routed page host, never on `ion-app`/`body`): *classic* (none), `fit-theme-dashboard` (warm light / charcoal in dark Appearance — follows the user setting), `fit-theme-immersive` (always charcoal — active workout and focused tasks). Sheets render outside the page, so **every `fit-bottom-sheet` must pass `screenTheme`** (a sheet without it falls back to classic blue — found and fixed in QA).
- **Colour roles:** lime = fill (primary action, selected, progress on ink) — **never text/border/focus ring on light** (1.16–1.28:1); light-mode brand text `--color-primary-text` `#3F5E0A`, graphics `--color-primary-strong` `#5F8F14`, focus ring = ink. Domain hues `train*` (ember `#e5482a`) and `body*` (teal `#0d8a79`); status `success/warning/danger` each with base/-text/-soft/on-. At most one **ink hero card** per screen.
- **Typography:** Inter Variable. Steps: display-xl 48/52, display 32/40, h1 28/34, h2 22/28, h3 18/24, body 16/24, body-sm 14/20, caption 12/16 (smallest allowed). Weights 400/500/600/700. Tabular numbers for changing numerals.
- **Spacing** 4/8/12/16/20/24/32/40/48; gutter 20 (16 at ≤360px); page max 640px (70em for two-column); tap targets 44px (52px for primary/mid-workout); radii 8/12/16/20/24/pill; elevation tokens (card, hero, raised, sheet); motion tokens (120/200/700 ms; reduced-motion collapses to 0 and sequences that autoplay start paused).
- **Components** (`shared/ui`, `fit-` prefix, presentational, OnPush, signal inputs): `fit-button` (variants primary, secondary, outline, ghost, **danger**, **ghost-danger**, on-ink, ghost-ink; sizes md 44 / lg 52), `fit-icon-button` (aria-label enforced by lint), `fit-card` (default/muted/ink), `fit-section-header`, `fit-metric`, `fit-progress` (bar/ring, gradient), `fit-chip`, `fit-notice`, `fit-avatar`, `fit-empty-state`, `fit-skeleton`, `fit-text-field`, `fit-segmented-control` (default, ink, compact, inverse, pills, underline), `fit-choice-group` (list/grid/chips/circles), `fit-ruler` (ARIA slider; drag/flick/snap/tap/keys/wheel), `fit-bottom-sheet`, `fit-page` (large title that collapses; custom header; refreshable; wide).
- **Copy conventions:** sentence-case buttons ("Finish workout", "Build muscle"; proper nouns like "Upper Body A", "InBody" keep capitals); destructive actions red (`danger` for the confirm, `ghost-danger` for the opener, neutral `outline` for cancel); lime stays for primary/positive actions.
- **Imagery:** no photography ships: workout art is a generated seeded SVG (`app-workout-art`), food thumbs and report thumbs are placeholders, onboarding welcome/body figures are placeholders (`onboarding-media.ts`).
- **Ionic mode independence:** UI must look identical in `ios` and `md` modes; never rely on mode-only features (e.g. `collapse="condense"`); test with `?ionic:mode=ios|md`.

---

## 12. The InBody extraction server

### 12.1 Role

`server/` is a tiny standalone Node service (no framework; `node:http` + Web `Request/Response` handler) whose only job is to keep the **OpenAI API key off the device**. One endpoint:

- `POST /v1/inbody-extractions` — raw image bytes as body (`Content-Type: image/png|image/jpeg|image/webp`) → `200` validated `inbody-extraction.v1` JSON, or `{ "error": { "code", "message" } }`.
- `GET /health` → `{ "status": "ok" }`.

### 12.2 Behaviour and protections

- Calls **OpenAI Responses API** (`POST https://api.openai.com/v1/responses`) with the request built by the shared domain function `inBodyExtractionRequest`, **Structured Outputs `strict: true`**, `store: false`. Model name comes from `OPENAI_MODEL` (not hard-coded; must be a vision model supporting Structured Outputs).
- Answer is validated server-side with the strict contract, and **again in the app**.
- Upload checks: declared type must be PNG/JPEG/WEBP **and match the file signature**; streamed read stops at the size limit (413).
- **Limits:** per-client fixed-window rate limit (default 5 per 15 min), global daily extraction cap (default 200 — a cost ceiling), **max concurrent extractions** (default 4; extra requests get `503 server-busy` + `Retry-After` *before the upload is read*, slot released on every outcome), request/headers timeouts, CORS allow-list of exact origins (`*` refused; Capacitor origins: `capacitor://localhost` iOS, `https://localhost` Android; requests without `Origin` served under the same limits).
- **Privacy:** image and extraction live in memory for the request only; nothing written to disk; logs carry event codes/statuses/durations only (never image, values, client IPs or provider text); provider errors map to fixed codes/messages (provider text may echo the request); key only goes to `api.openai.com` in the `Authorization` header and is never logged/returned/included in errors.
- Without key/model the server still starts, logs `server.not-configured`, and answers extraction with `503 not-configured` without reading the upload.
- **Error codes → HTTP:** `empty-upload`/`invalid-image` 400; `origin-not-allowed` 403; `not-found` 404; `method-not-allowed` 405; `upload-too-large` 413; `unsupported-media-type` 415; `extraction-refused` 422; `rate-limited`/`service-limit-reached` 429; `internal-error` 500; `extraction-incomplete`/`invalid-extraction`/`provider-error` 502; `not-configured`/`server-busy`/`provider-unavailable` 503; `provider-timeout` 504.
- Config (env vars, validated at startup; errors name the variable, never its value): `OPENAI_API_KEY`, `OPENAI_MODEL` (required for extraction), `OPENAI_MAX_OUTPUT_TOKENS` (8000; 1000–64000), `OPENAI_TIMEOUT_MS` (90000), `INBODY_MAX_UPLOAD_BYTES` (8 MiB; ≤20 MiB), `MAX_CONCURRENT_EXTRACTIONS` (4), `ALLOWED_ORIGINS`, `RATE_LIMIT_PER_CLIENT`/`RATE_LIMIT_WINDOW_MS`, `DAILY_EXTRACTION_LIMIT`, `CLIENT_IP_HEADER` (only behind a trusted proxy), `HOST`/`PORT` (127.0.0.1 / 8787).
- Limiter state is **per process** (several instances would multiply the limits).

### 12.3 Client side (`core/inbody/inbody-extraction.client.ts`)

Checks file type/size/empty first, POSTs with a 120 s timeout, maps server codes to client failures (`unsupported-type | too-large | empty | unavailable | rejected-file | busy | refused | network | service | invalid-response`), re-validates with `parseInBodyExtraction`. The endpoint comes from the `INBODY_EXTRACTION_ENDPOINT` token → `environment.inbodyExtractionEndpoint`; **`null` hides all upload UI**.

### 12.4 Tests

`npm run server:test` (Vitest, Node env, fake OpenAI client; no network, placeholder key). Specs: config, extraction-handler, node-server, openai-client. A **synthetic** InBody380 fixture (fictional female, 172 cm, 68.4 kg, test date 2026.09.14) replaced real data in tests; **never put real report values in fixtures**.

---

## 13. Environments, configuration and external dependencies

**`src/environments/environment.ts` (dev)** and **`environment.prod.ts`** (swapped by `fileReplacements` in the production build). Public values only — never secrets:

| Field | Dev | Prod |
|---|---|---|
| `production` | false | true |
| `inbodyExtractionEndpoint` | `http://localhost:8787/v1/inbody-extractions` | **`null`** (upload hidden until hosting exists) |
| `exerciseMediaBaseUrl` | jsDelivr URL of `yuhonas/free-exercise-db` pinned to commit `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5` `/exercises/` | same (set `null` to hide demonstrations) |

**External network dependencies at runtime:**

1. **jsDelivr CDN** — exercise demonstration photos from free-exercise-db (public domain / The Unlicense), loaded **only when the user asks** ("Show demonstration"/"How to do it"). Offline = demonstrations show a retry state. Credit string: "Photos: free-exercise-db (public domain)". 58 of 77 exercises have a *faithful* mapping (same movement, same equipment type); the rest deliberately show none rather than a different movement (e.g. Archer Push-Up, Burpees, several band variants).
2. **The extraction server → OpenAI** (only the server talks to OpenAI) — dev only today.
3. Inter font is bundled (no Google Fonts request).

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
| `npm run server:build` | esbuild bundle of `server/src/main.ts` → `server/dist/main.mjs` (ESM, node22) |
| `npm run server:start` | build + `node --env-file-if-exists=server/.env server/dist/main.mjs` (listens `127.0.0.1:8787`) |
| `npm run server:test` / `server:typecheck` | Server tests / `tsc -p server/tsconfig.json` |

### 14.2 Local development recipe

```
npm install
npm start                              # app on http://localhost:4200
# optional, for photo import:
cp server/.env.example server/.env     # fill OPENAI_API_KEY + OPENAI_MODEL (never commit)
npm run server:start                   # http://127.0.0.1:8787
```

`ALLOWED_ORIGINS` in `.env.example` defaults to `http://localhost:8100,http://localhost:4200`. Append `?ionic:mode=ios` or `?ionic:mode=md` to the dev URL to check both Ionic modes.

### 14.3 Deployment status — honest summary

| Target | Status |
|---|---|
| **Web** | The production build runs as a static SPA (needs SPA fallback to `index.html` for deep links; `<base href="/">`). **Not hosted anywhere** — no hosting config, no deploy script. |
| **Android** | Capacitor project exists; a **debug APK** (~5 MB) was built and installed on one physical phone (§15). **No release signing config, no Play Store setup, no versioning scheme beyond `versionCode 1 / versionName "1.0"`**. `minifyEnabled false` in release. |
| **iOS** | **Not added.** Would need `npx cap add ios` and a Mac/Xcode. |
| **Extraction server** | **Not deployed.** Needs: HTTPS, key in the platform's secret store (not a file), production app origins in `ALLOWED_ORIGINS`, `CLIENT_IP_HEADER` matching the proxy, a shared rate-limit store if more than one instance runs. Then set the production endpoint in `environment.prod.ts`. Hosting provider **not chosen** (open decision). |
| **CI/CD** | None in the repo. |
| **Release readiness** | Blocked on "Production readiness" items (§19): unencrypted storage, client-only age gate, no backend, etc. |

Capacitor config is minimal (`appId com.fitnessapp.app`, `appName Fitness`, `webDir www`). The Android manifest requests only `INTERNET`, uses `launchMode singleTask`, and handles configuration changes (`orientation|…|uiMode|density`), so rotation does not restart the activity; portrait is **not** locked.

---

## 15. Android build and device testing

**Setup done 15 Oct 2026 (Windows 11, no admin):** user-level **scoop** installs of `temurin21-jdk` and `android-clt` (SDK root `C:\Users\keshu\scoop\apps\android-clt\current`, platform 36, build-tools 36.0.0, licences accepted with user approval). `JAVA_HOME`/`ANDROID_HOME` are **not** persisted — export per shell (`JAVA_HOME=C:\Users\keshu\scoop\apps\temurin21-jdk\current`). adb is standalone at `C:\Users\keshu\platformtools\platform-tools`.

**Build:** `npm run build && npx cap sync android && cd android && ./gradlew.bat assembleDebug` (first run ≈ 5 min). Output: `android/app/build/outputs/apk/debug/app-debug.apk`.

**Device test (Samsung SM-A336E, Android 16, 384×853 CSS px, DPR 2.81)**, driven by adb + Chrome DevTools attached to the WebView (`adb forward tcp:9444 localabstract:webview_devtools_remote_<pid>`; works in the debug build). **Passed:** 27 routes (no overflow), keyboard, weight save/delete, a full workout including timers across background and force-stop, system dark mode, cold start ≈ 0.75 s. Phone data was backed up and restored. The harness scripts lived in a session scratchpad only (not in the repo).

**Findings from that pass and their status:**

| Finding | Status |
|---|---|
| Large font scale (1.5): Home ring text overflows | Fix in working tree (uncommitted): `--text-scale` + ring size scaling |
| "Progress" tab label truncated at 150% | Fix in working tree: tab label `overflow: visible; text-overflow: clip` |
| Muscle chips clip at 150% | **Open** |
| Hardware Back leaves an active workout without prompt | Fix in working tree: `Platform.backButton` handler opens exit dialog |
| Landscape cramped (portrait not locked) | **Open** (decision: lock portrait or design landscape) |
| Reinstall of the fixed build on the phone | **Not done** |

In the production web build the InBody endpoint is `null`, so **photo import is hidden in the APK**; demonstrations need internet.

---

## 16. Testing and quality gates

- **135 spec files**, ≈ 22,700 lines. Project notes recorded **1986 tests passing** earlier on 15 Oct 2026, with `npm run lint`, `tsc` and `npm run build` green. **Re-run while writing this document (15 Oct 2026, including the uncommitted work): `npm test -- --watch=false` → 135 files passed, 1990 tests passed, ≈19 s.** Lint, `tsc`, the server tests and the production build were **not** re-run for this document.
- Coverage emphasis: the **domain layer is heavily unit-tested** (calculation engine incl. boundaries, workout engine with **golden plans** in `domain/workout-programming/testing/golden-plans.ts`, workout logging, nutrition math in exact tenths, calorie check-in gates, weekly review rules, strict parsers, extraction contract/mapping/request); **view-model functions** have their own specs; **page specs** render components in jsdom (with `MemoryKeyValueStorage` and a fake `CLOCK`); **onboarding tests** include "every ruler tick round-trips to itself"; **server tests** cover config, handler paths, node server streaming limits and the OpenAI client with a fake.
- `src/test-setup.ts` polyfills `matchMedia`, registers icons, and installs a MutationObserver that removes leftover `ion-modal` elements (spec files share one document because the builder runs Vitest with `isolate: false`).
- **No end-to-end/UI automation suite is committed.** QA of the running app was done with ad-hoc scripted headless Chrome over CDP (`chrome.exe --headless=new --remote-debugging-port=…`, Node's global WebSocket, seeded `localStorage`) and the adb/DevTools harness above; those scripts are *not* in the repo. A saved reproducible screenshot set is a stated next step.
- **Caution:** `npm test` must run with nothing else loading the machine — concurrent browser automation caused 5 s timeouts and a runaway `NG0406` log (300+ MB).
- **Visual QA (15 Oct 2026):** 29 page components checked at 320/390/430 px in light & dark, scripted for overflow/clipped text/tiny controls/console errors; 8 defects fixed (sheets without `screenTheme`, dark-mode sheet host opacity, Next-up card word-break, empty-state gutters, Exercise Performance wrapping, Measurements axis duplicate month labels, History filter pill alignment, 3-digit protein vs ring). The approved mockup HTML files are **not on disk**, so the pass checked consistency with the design doc, not pixel parity.

---

## 17. Security, privacy and safety design

**Handled**

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
5. The extraction server has no auth beyond origin allow-list + rate limits; a deployed instance would need abuse controls appropriate to a public endpoint (the daily cap bounds cost).
6. No dependency/licence audit documented; no CSP configured for the web build; `android:allowBackup="true"` in the manifest means app data (incl. unencrypted `localStorage`) may be included in Android backups.

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
- Android release build is not configured (no signing, no minification, no store listing assets; launcher icons are Capacitor defaults **(unverified)**; `favicon.png` is the only icon under `src/assets`).
- Server rate-limit state is per process; not horizontally scalable as is.
- `README.md` has two statements that are slightly stale relative to the code: it says "Native platforms have not been added yet" (Android now exists) and lists "notifications" under not-implemented while an in-app inbox exists. (`docs/design-system.md` is the more current of the two.)
- Mockups that defined the redesign are not stored in the repo.

**Unverified in this document**

- Real-device behaviour of safe-area insets, on-screen keyboard, haptics, pull-to-refresh and native date picker on iOS (no iOS build exists); Ionic `ios` vs `md` modes (only default run in QA); tablet two-column layouts; screen reader output; populated Body Composition screens with a real report (needs the extraction server + key); exercise-demo photos loading on device.

---

## 20. Open product and infrastructure decisions

(The code deliberately stops at these; ask the owner rather than assuming.)

1. **Production hosting for the extraction server** (provider, secrets store, domain/HTTPS), and the per-upload size limit beyond the 8 MB default.
2. **PDF support** for InBody reports (today PNG/JPEG/WEBP only).
3. **Confirm the OpenAI key rotation** (§17).
4. **Backend/auth/sync strategy** and moving from `localStorage` to encrypted storage; server-side age enforcement.
5. **iOS**: add platform, signing, App Store path.
6. **Release/versioning** strategy for Android (signing keys, Play Store listing, app icon/splash).
7. **Design calls still open:** use of teal `body*` tokens; retiring classic palettes; larger card radii globally; real photography/illustration for onboarding, workouts and food; portrait lock vs landscape support.
8. **Whether regeneration of the plan should be explicit** once users follow it; whether training weekdays should be user-assignable.
9. **Accessibility pass** and fixing the two documented contrast gaps (input outline, tertiary text).
10. **Saved reproducible screenshot set / E2E tests** (owner's stated next step), plus testing populated Body Composition screens with a real report.

---

## 21. Project history and working conventions

**Timeline (from git log, 72 commits):** 8 Oct 2026 app shell + Quick Add → 9 Oct workout page, weight and measurement tracking, domain profile/assessment/engines → 10–11 Oct body composition, AI InBody onboarding + server, security fixes, exercise demonstrations, recent foods, weekly nutrition summary, weekly review, Calorie Check-in → 9–14 Oct (in parallel branch `claude/sharp-brown-jjp18e`, PRs #1–#12) the **screen-by-screen redesign**: foundation + Home → Active Workout → Workout tab/detail/history → Progress → Nutrition → You/body tracking → Onboarding (12 screens) → Assessment → Workout Summary → Notifications → 15 Oct visual QA, Android platform + Gradle wrapper (`51dbcb4`).

**Design decisions approved by the owner (9 Oct 2026):** palette applies app-wide (blue = actions/nutrition in classic, ember = training, teal = body data; secondary text darkened to `#5b6170` in classic); Today's workout CTA **starts** the workout directly; Home shows a weight card with trend but body measurements stay off Home; extras in scope: pull-to-refresh, haptic on crossing calorie target, collapsing "Today" title, two-column tablet layout; target WCAG 2.1 AA. Later decisions: sentence-case copy; red destructive actions; FFM ≠ lean body mass; reports never persisted; age never converted to DOB.

**Working conventions** (from `README.md`/design doc):

- Never hard-code colours or sizes; use tokens and mixins.
- Components standalone, OnPush, signal inputs/outputs; `fit-*` presentational only; feature-specific components in `features/<area>/components`.
- Add routes in the feature's own `<area>.routes.ts`; full-screen flows that hide the tab bar go beside the shell route in `app.routes.ts` *above* the wildcard.
- Domain code: explicit `asOfDate`, `{ok,value|error}` results, new `calculationVersion` / programming `version` for result-changing edits; UI copy must say "estimated"/"starting".
- Quick Add: ship an action by flipping `available` and handling `(actionSelected)` in `TabsPage`.
- Don't change routes, domain logic, persistence or copy semantics as part of a visual change.
- Don't add a shared component until two screens need it (or one needs it and it encodes an accessibility rule).
- Git: feature branches + PRs; the project owner asked that QA edits stay **uncommitted** until reviewed. Commit messages follow conventional style (`feat(scope):`, `fix(scope):`, `docs:`).

---

## 22. Uncommitted work at time of writing

`git status` at the start of this session (all on `main`, none committed):

| File | Change |
|---|---|
| `src/app/core/text-scale/text-scale.ts` (+ spec) — **new** | `readTextScale()` reads the root element's computed font size ÷ 16 (clamped 1–2); `trackTextScale()` publishes it as CSS variable `--text-scale` now and on `resize` / `visibilitychange`. Rationale: Android WebViews draw glyphs at the zoomed size but leave px/rem/em lengths alone, so fixed-size rings were outgrown by their text. |
| `src/app/app.config.ts` | Calls `trackTextScale()` in the app initializer. |
| `src/app/shared/ui/progress/fitness-progress.component.ts` | Ring size is now `calc(<ringSize>px * var(--text-scale, 1))`. |
| `src/app/shell/tabs/tabs.page.scss` | Tab label no longer ellipsised (`overflow: visible; text-overflow: clip; white-space: nowrap`). |
| `src/app/features/workout/active/active-workout.page.ts` (+ spec) | Android hardware Back (`Platform.backButton`, priority 10) opens the "Leave this workout?" dialog while a workout is shown, else passes through. |
| `android/` and earlier QA/design-doc edits | The Android project was added 15 Oct (partly committed in `51dbcb4`: Gradle wrapper and config); the earlier QA fixes and doc rewrites were left uncommitted at the owner's request. |

Not yet re-verified on the phone (fixes were never reinstalled).

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

---

## 24. How to use this file when asking an AI for help

Suggested framing for a prompt: *"Below is a full description of my Ionic/Angular/Capacitor fitness app. Use it as ground truth. Then help me with: …"*. Good tasks given this document:

- Design review: security/privacy plan for moving to encrypted storage or a backend; choosing hosting for the extraction server; Android release/signing checklist; iOS bring-up plan.
- Product/engineering planning: sequencing the "not built" list; designing history-based progressive-overload suggestions on top of the existing progression rules; designing a food database/barcode integration that preserves the "snapshot nutrition per entry" model; push notifications that reuse the derived-reminder rules.
- Review of domain choices: the calorie/protein formulas and safety floors, Calorie Check-in thresholds, volume-balancing numbers (all are "product defaults, not clinical prescriptions").
- Accessibility and QA planning: closing the documented contrast gaps, large-text support, an E2E/screenshot suite.

**Constraints to remember when proposing changes:** domain stays framework-free and clock-free; result-changing calculation/programming edits need a new version; never invent or zero-fill missing data; never convert FFM to lean body mass or age to DOB; never persist or log report images/values; no secrets in the client; copy is sentence case with destructive actions red; every sheet passes `screenTheme`; use tokens, not literals; keep Ionic `ios`/`md` visuals identical.

*End of document.*
