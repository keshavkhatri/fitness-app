# Fitness App

Cross-platform (iOS / Android) fitness app built with **Ionic 9 + Angular 22 (standalone, zoneless, signals) + Capacitor 8**.

All data is stored on this device only (no account, backend or sync yet).

Implemented so far:

- **Onboarding + fitness profile** (it starts by asking the user's name, which Home greets them with; saved with the identity, not the profile), then the **assessment** ("Your starting point": estimated BMR/maintenance and starting calorie and macro targets from the fitness calculation engine). The profile can be reviewed and edited later from the assessment or the You tab.
- **Home** (redesigned dashboard, `fit-theme-dashboard`, matching the approved mockup): the Pulseform wordmark, a notification bell (dot while reminders are unread) and the avatar (opens You); a greeting with the user's name and the active-day **streak**; **"Your day, in motion"** with a ring (the mean of today's goals) and Move (logged steps vs 10,000), Train (today's planned workout done) and Recover (today's check-in) tiles, which open the steps and recovery check-ins; the featured workout (start, resume, activity, rest or setup) over a generated placeholder image (`home-media.ts` takes a real photo); compact Nutrition (protein ring, calories vs target) and This week (finished vs planned workouts, bars as tall as the time trained; opens Progress) cards. Each part loads independently; pull to refresh.
- **Workout planning**: the deterministic workout generation engine (v2, frozen) builds the user's plan from the profile; the plan is persisted and kept in sync as the profile changes. The Workout tab shows today, the week, today's exercises and the plan; each session opens Workout Detail.
- **Active workout logging** (full screen, always dark): one exercise at a time with a demonstration stage, editable set rows (current / completed / upcoming), a rest ring, a "next up" preview and persistent controls with the workout time; resumable after the app is closed, one workout in progress at a time, then a workout summary.
- **Workout history and progress**: finished workouts and their details. Progress (its own tab, and You → Progress) has an Overview / Workout / Body switch: the latest weight, body fat and muscle mass with the difference from the previous recording, the weight trend (1M / 3M / 6M / 1Y / All), weeks with a workout over the last 12 (the plan's sessions as a reference line), total workouts, recorded volume and average duration, and every performed exercise (search, body-area filter, sort) with its performance over time (best set, a chart of recorded top weight, volume or reps per session, and the sessions, each opening its workout). No estimates (no 1RM), scores or streaks.
- **Nutrition** (redesigned, `fit-theme-dashboard`): a daily food log by meal and day with a Monday–Sunday day strip, a calorie ring and macro bars against the day's calculated targets (intake only when a target is withheld). **Add food** (dark) searches your Recent foods (distinct foods from the last 30 days): + logs one again to the chosen day and meal in one tap, or tap it to change it first; foods can also be entered manually. **Edit food** scales a logged food by serving size and number of servings (live totals from the domain) and updates the same entry; delete asks first. **Week** charts calories and a chosen macro by day against the targets, with averages over logged days only (a day without entries is never a zero). There's no food database or barcode scanning.
- **Body-weight history** (You → Weight history): add, edit and delete weigh-ins; a chart and first/latest summary per range. Recording a weight never changes the profile; an entry becomes the profile's weight only through the explicit, confirmed "Use as profile weight" action (after which the updated assessment is shown).
- **Body measurements** (You → Measurements): tape circumferences (waist, chest, hips, arm, thigh), any subset per entry; history newest first, the latest value per site and the change between a site's two most recent readings. Separate from the profile and the weight history.
- **Quick Add** (You → Quick add): Start workout, Add food, Log weight, Add measurement and Add InBody work; Progress photo is shown as "Coming soon".
- **Daily check-ins**: steps (typed in; no health-app connection yet) and a recovery check-in (poor / fair / good / great), one value per day (`domain/daily-check-in`, `core/daily-check-in`).
- **Streak**: consecutive days with anything recorded (a finished workout, food, a weigh-in, steps or a check-in); today not yet active keeps yesterday's streak.
- **Notifications** (Home's bell): an in-app inbox of today's reminders built from the user's data (planned or in-progress workout, recovery check-in, nothing eaten yet, no weigh-in in a week); opening it marks them read. No push or system notifications yet.
- **You**: name and photo (resized on the device; used by Home's greeting and avatar), profile review, Quick add, Progress, Weight history, Measurements, appearance (System/Light/Dark) and **Units** (metric/imperial). Notification settings (push), connected health apps and subscription are listed but not built.

**InBody onboarding (AI-based):** the welcome screen offers *Enter manually* (the default; that path is unchanged) or *Upload InBody report*. The upload step says the image goes to an external AI service, checks the file (PNG/JPEG/WEBP, up to 8 MB) and posts it to the app's own extraction endpoint (`core/inbody`, `POST /v1/inbody-extractions`), which holds the OpenAI key (Responses API, Structured Outputs, `store: false`); the app never does. Every answer is re-validated (`parseInBodyExtraction`) and mapped (`inBodyPrefill`); a read report prefills sex, height and weight on the basics step, where each field shows the printed value or is flagged as uncertain, unreadable, absent or unusable for the user to correct. The profile is saved only from the summary's "Create My Profile", as before. Unsupported or unreadable reports, file, network, provider and invalid-response failures each have their own message, with retry and a switch to manual entry that keeps answers already given. The image and extraction stay in memory only; nothing is logged; weight history, assessments and workout plans are untouched; age is never turned into a date of birth and Fat Free Mass is not used as lean body mass. The endpoint is a public URL set in `src/environments` (`inbodyExtractionEndpoint`; never a key): the local server in development builds (`http://localhost:8787`); production builds set null, which hides the upload option until hosting is chosen. No local OCR.

**Exercise demonstrations:** workout detail ("Show demonstration") and the active workout ("How to do it") offer a demonstration for exercises with a faithful match in free-exercise-db (public domain): its start and end position photos, played in turn like a GIF, with Pause/Play (paused by default under reduced motion) and a retry if loading fails. Nothing loads until asked. The mapping is `domain/workout-programming/exercise-demonstrations.ts` (58 of 77 exercises; the rest show no demonstration rather than a different movement); photos come from `exerciseMediaBaseUrl` in `src/environments` (jsDelivr, pinned to one commit; null hides demonstrations).

**InBody assessments (You → Body composition, Progress, Quick Add → Add InBody):** a history of saved assessments (key values, the latest value per metric and the difference since the previous report in the same unit; a single assessment shows no change), and a detail page per assessment with every recorded value grouped as on the sheet. A new assessment can be typed in or uploaded: the upload reuses the onboarding extraction (`ReportImport`) and fills in the form, which is the review step; nothing is saved until the user saves. Values saved unchanged are stored as read from the report (`INBODY_AI_PROVENANCE`); any correction saves them as a manual entry. The catalogue covers every scalar the extraction reads (skeletal muscle mass, fat-free mass, water, BMI, visceral fat level, …); lean body mass stays a separate, manual-only metric. From the detail page an assessment can be edited (the same form, prefilled; it keeps its import provenance only while its values are unchanged) or deleted after a confirmation (other assessments, weigh-ins and the profile are untouched). Saving never changes the profile or weight history; the profile weight is still updated only with "Use as profile weight" on a weigh-in.

Not implemented yet: auth, backend/API and sync, progress photos, notifications, health-app integrations, AI coaching and payments/subscriptions. Each will arrive as a separate, reviewed phase.

## Requirements

- Node **22.22.3+** or **24.15+** (Angular CLI 22 refuses older versions)

## Scripts

| Command         | Purpose                                  |
| --------------- | ---------------------------------------- |
| `npm start`     | Dev server (`ng serve`)                  |
| `npm run build` | Production build to `www/`               |
| `npm run lint`  | ESLint (TS + templates + template a11y)  |
| `npm test`      | Vitest unit tests (`--watch=false` in CI) |
| `npm run server:start` | InBody extraction server on `127.0.0.1:8787` (reads `server/.env`; see `server/README.md`) |
| `npm run server:test` / `server:typecheck` | Server tests (no network, no key) / TypeScript check |

Native platforms have not been added yet. Once the bundle ID is final: `npx cap add ios` / `npx cap add android`.

## Structure

```
src/
  theme/                    Design tokens: the ONLY place colors/type/spacing are defined (contract: docs/design-system.md)
    _palette.scss           Color values (Sass maps): classic light + dark; redesign warm + charcoal (one key set)
    _tokens.scss            Emits CSS custom properties (--color-*, --space-*, --radius-*, --font-size-*, …)
                            and the opt-in screen themes (.fit-theme-dashboard, .fit-theme-immersive)
    _ionic-bridge.scss      Maps tokens onto Ionic's --ion-* variables
    _mixins.scss            Component helpers: text(), eyebrow, focus-ring, safe-area-padding, button-reset, pressable
    theme.scss              Global entry: base styles, utility classes, Ionic overrides
  app/
    app.config.ts           Providers (Ionic platform mode, router, icon + theme init)
    app.routes.ts           Tabs shell; each feature mounted via its own <area>.routes.ts
    domain/
      fitness-profile/      Framework-free profile model, units, equipment catalog, goal-target policies,
                            plausibility ranges and runtime parsing (for storage/API data)
      workout-programming/  Deterministic workout generator (v2): exercise catalog + progression chains,
                            objective-based session templates, weighted exercise selection, prescription
                            profiles, weekly volume balancing, sequencing, duration limits, profile adapter.
                            All programming numbers in workout-config.ts; golden fixtures in testing/
      training-plan/        The user's plan lifecycle on top of the engine: plan from profile, freshness
                            (does a stored plan still fit the profile?) and a strict stored-plan parser
      fitness-calculations/ Deterministic engine: profile → FitnessAssessment (BMR, TDEE, calorie and
                            macro targets, safeguards, explanation). All coefficients in calculation-config.ts
      workout-session/      Performed workouts: log rules, stored-log parser, history and progress facts
      nutrition/            Food entries, day totals and targets
      inbody-extraction/    AI extraction contract for InBody reports: JSON schema for the model, strict response
                            validation, mapping to profile/assessment suggestions (no network, files or storage)
      body-measurements/    Weight entries, history and trends; tape measurements, their history and changes;
                            the explicit profile-weight change
    core/                   App-wide singletons (no UI)
      profile/              FitnessProfileRepository (local today), FitnessProfileService, OnboardingStatusService,
                            UnitPreferenceService, guards
      calculations/         FITNESS_CALCULATION_CONFIG injection token for the domain engine
      workout/              WorkoutPlanRepository (local snapshot today), WorkoutPlanService (create / keep /
                            regenerate the plan as the profile changes), WORKOUT_PROGRAMMING_CONFIG token,
                            WorkoutLogRepository/Service (active workout + finished workouts), WorkoutHistoryService
      nutrition/            NutritionRepository (local food log), NutritionService (day log + calculated targets)
      body-measurements/    Weight and measurement history repositories/services; ProfileWeightService
                            (explicit "use as profile weight")
      inbody/               InBodyExtractionClient: sends a report image to the extraction endpoint, re-validates
                            the answer; INBODY_EXTRACTION_ENDPOINT token (null = upload unavailable)
      time/                 CLOCK token + local calendar date helper (deterministic tests)
      storage/              KeyValueStorage: async device-local preference store (localStorage today)
      theme/                ThemeService: system/light/dark preference
      icons/                Central ionicon registration (only listed icons are bundled)
    shared/ui/              Design-system components (selector prefix `fit-`), import via `shared/ui`
    shell/
      tabs/                 Bottom tab bar: Home, Train (workout), Fuel (nutrition), Progress, You
      quick-add/            Quick Add sheet + action registry; QuickAddLauncher opens it (from You)
    features/
      home/                 Dashboard: page, routes, view models, section cards (all real data: profile goal, plan,
                            workout history, nutrition, recorded weight)
      workout/              Plan, Workout Detail, active workout (full screen), summary, history; progress/ is
                            mounted under You (/you/progress)
      nutrition/            Daily food log, Add food (recent-food search), Edit food (portions), weekly view
      body-weight/          Weight history (/you/weight-history) and weigh-in entry
      body-measurements/    Measurement history (/you/measurements) and entry
      you/                  Profile review, links to progress and body tracking, appearance and units settings
      assessment/           "Your starting point": profile → engine → view model (pure adapter) → thin page
      onboarding/           Full-screen onboarding flow (no tab bar); /onboarding/review edits an existing profile
        state/              OnboardingFlow (signals), draft model, step definitions, resumable progress store
        validation/         Pure step/form validation with user-facing messages
        steps/              Step components; generic single-choice step + config, form steps, summary
        onboarding-content.ts  Labels, descriptions and icons for every answer
```

## Conventions

- **Design system:** [`docs/design-system.md`](docs/design-system.md) is the contract for tokens, screen themes, components, accessibility and responsive rules; screen redesigns follow it.
- **Never hard-code colors or sizes in components.** Use `var(--color-*)`, `var(--space-*)`, `var(--radius-*)`, and `@use 'mixins' as fx; @include fx.text(h3, semibold);` (`src/theme` is on the Sass include path).
- **Theming:** no class on `<html>` follows the OS; `theme-light` / `theme-dark` force a mode (managed by `ThemeService`). Redesigned screens opt into a screen theme with a class on the page host (`fit-theme-dashboard` follows light/dark, `fit-theme-immersive` is always dark); screens without one keep the classic look. Focus indicators use `--color-focus` and stand-alone graphics `--color-primary-strong`, never the brand fill (lime is invisible on light surfaces).
- **Components:** standalone, `OnPush`, signal inputs/outputs. `fit-*` is presentational and has no business logic. Feature-specific components live in `features/<area>/components`.
- **Platform mode:** Ionic picks `ios`/`md` per platform for native behaviour (transitions, swipe-back). The look must be mode-independent: never rely on mode-only Ionic features (e.g. `collapse="condense"`) or on Ionic's mode-specific sizing; check new UI in both modes (append `?ionic:mode=ios` / `?ionic:mode=md` to the dev URL).
- **Data:** pages load from core services with `resource()` (e.g. Home reads the profile, plan, history and nutrition services). If demo data is ever needed, it lives only in `*.demo.ts` files (enforced by lint, `no-restricted-imports`) and must be labelled in the UI.
- **Routing:** add nested pages to the feature's own `<area>.routes.ts`. Full-screen flows that hide the tab bar go next to the shell route in `app.routes.ts`.
- **First run:** onboarding → assessment → home. `OnboardingStatusService` derives `needs-onboarding` (no profile) / `needs-assessment` (profile whose assessment wasn't reviewed; marker stores only the profile's `updatedAt`) / `complete`. `requireOnboardingComplete` guards the tab shell, `redirectIfOnboarded` guards `/onboarding`, `requireProfile` guards `/assessment` and `/onboarding/review`. Editing the profile changes `updatedAt`, so its assessment is shown again.
- **Onboarding:** Answers are stored canonically in metric (cm/kg); `unitSystem` is display-only. The profile stores `dateOfBirth` (ISO `YYYY-MM-DD`), never age; derive age with `currentAge()` from `domain/fitness-profile/date-of-birth.ts`, and display age rather than the birth date. The app is adults-only (18+, `AGE_YEARS` in `profile-rules.ts`). `weight` is the profile's current weight, not a history; recorded weigh-ins live in the separate weight history and change the profile only through the explicit "Use as profile weight" action. No fitness calculations happen here; engines consume `UserFitnessProfile` later.
- **Domain layer** (`src/app/domain`): framework-free TypeScript, enforced by lint (no Angular/Ionic/Capacitor/rxjs or app-layer imports). Calculations take an explicit `asOfDate` (no hidden clock) and return `{ ok, value | error }`. Formula/coefficient changes require a new `calculationVersion` in `calculation-config.ts`. Results are estimates; UI copy must say "estimated maintenance", "starting calorie target", "initial protein target". Assessments separate `estimates` (BMR, TDEE) from `targets`; consumers must handle `targets.calories.status` (`normal` / `floor-applied` / `review-required`) and `targets.macros.status` (`feasible` / `constrained` / `infeasible`, which has no gram targets). The calorie threshold is a product safety guard, not medical guidance.
- **Units:** changing Units (You tab, `UnitPreferenceService`) only changes the profile's `unitSystem`: stored values stay metric and nothing is converted, the plan is kept, and an already reviewed assessment stays reviewed. A workout records its weight unit (kg/lb) when it starts.
- **Quick Add:** the sheet only renders the actions it is given and emits the chosen one; the host (`TabsPage`) decides what happens. Pages open it with `QuickAddLauncher.show()`. Ship an action by flipping `available` and handling `(actionSelected)`.
- **Accessibility:** touch targets ≥ 40–44px, secondary text on muted surfaces uses `--color-text-on-muted` (AA), every progress bar has a label/value text, state never relies on color alone (filled icons for the active tab, text for trends and "Coming soon"), and reduced-motion is honoured via the motion tokens.

## Production readiness

Known items that must be resolved before a production release:

- **Profile data is stored unencrypted.** `LocalFitnessProfileRepository` and `OnboardingProgressStore` keep personal and body data (date of birth, sex, height, weight, goals) as plain JSON in device storage (`localStorage` via `KeyValueStorage`). Review profile persistence (platform secure storage / encrypted local store, server as source of truth once the API exists) before release. Marked with `TODO(security, before production)` in both files.
- **The workout plan is stored unencrypted too.** `LocalWorkoutPlanRepository` keeps the plan (goal, experience, training setup; no body data) as plain JSON in device storage. Covered by the same persistence review.
- **Logs and histories are stored unencrypted too.** Workout logs, the food log, weight history, body measurements, daily check-ins and the user's name and photo are plain JSON in device storage (same caveat in each repository). Covered by the same persistence review.
- **Minimum age (18) is enforced client-side only.** It must also be enforced by the backend once profiles are persisted server-side.
