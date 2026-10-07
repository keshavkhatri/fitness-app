# Fitness App

Cross-platform (iOS / Android) fitness app built with **Ionic 9 + Angular 22 (standalone, zoneless, signals) + Capacitor 8**.

Implemented so far: app shell, navigation, design system, placeholder screens (phase 1), **onboarding + fitness profile** (phase 2) and the **fitness calculation engine** (phase 3, domain only; not yet shown in the UI). Auth, backend/API, workout/nutrition engines, InBody, AI coaching, payments and health integrations are deliberately not implemented yet. Each will arrive as a separate, reviewed phase.

## Requirements

- Node **22.22.3+** or **24.15+** (Angular CLI 22 refuses older versions)

## Scripts

| Command         | Purpose                                  |
| --------------- | ---------------------------------------- |
| `npm start`     | Dev server (`ng serve`)                  |
| `npm run build` | Production build to `www/`               |
| `npm run lint`  | ESLint (TS + templates + template a11y)  |
| `npm test`      | Vitest unit tests (`--watch=false` in CI) |

Native platforms have not been added yet. Once the bundle ID is final: `npx cap add ios` / `npx cap add android`.

## Structure

```
src/
  theme/                    Design tokens: the ONLY place colors/type/spacing are defined
    _palette.scss           Light + dark color values (Sass maps)
    _tokens.scss            Emits CSS custom properties (--color-*, --space-*, --radius-*, --font-size-*)
    _ionic-bridge.scss      Maps tokens onto Ionic's --ion-* variables
    _mixins.scss            Component helpers: text(), focus-ring, button-reset, pressable
    theme.scss              Global entry: base styles, utility classes, Ionic overrides
  app/
    app.config.ts           Providers (Ionic platform mode, router, icon + theme init)
    app.routes.ts           Tabs shell; each feature mounted via its own <area>.routes.ts
    domain/
      fitness-profile/      Framework-free profile model, units, equipment catalog, goal-target policies,
                            plausibility ranges and runtime parsing (for storage/API data)
      fitness-calculations/ Deterministic engine: profile → FitnessAssessment (BMR, TDEE, calorie and
                            macro targets, safeguards, explanation). All coefficients in calculation-config.ts
    core/                   App-wide singletons (no UI)
      profile/              FitnessProfileRepository (local today), FitnessProfileService, onboarding guards
      storage/              KeyValueStorage: async device-local preference store (localStorage today)
      theme/                ThemeService: system/light/dark preference
      icons/                Central ionicon registration (only listed icons are bundled)
    shared/ui/              Design-system components (selector prefix `fit-`), import via `shared/ui`
    shell/
      tabs/                 Bottom tab bar (Home, Workout, Quick Add, Nutrition, You)
      quick-add/            Quick Add sheet + action registry (all actions "coming soon")
    features/
      home/                 Dashboard: page, routes, view models, section cards
        data/               HomeSummarySource (abstract) + demo implementation + the ONLY demo data file
      workout/ nutrition/   Section shells (empty states)
      you/                  Profile/settings shell (working appearance setting)
      onboarding/           Full-screen onboarding flow (no tab bar)
        state/              OnboardingFlow (signals), draft model, step definitions, resumable progress store
        validation/         Pure step/form validation with user-facing messages
        steps/              Step components; generic single-choice step + config, form steps, summary
        onboarding-content.ts  Labels, descriptions and icons for every answer
```

## Conventions

- **Never hard-code colors or sizes in components.** Use `var(--color-*)`, `var(--space-*)`, `var(--radius-*)`, and `@use 'mixins' as fx; @include fx.text(h3, semibold);` (`src/theme` is on the Sass include path).
- **Theming:** no class on `<html>` follows the OS; `theme-light` / `theme-dark` force a mode (managed by `ThemeService`).
- **Components:** standalone, `OnPush`, signal inputs/outputs. `fit-*` is presentational and has no business logic. Feature-specific components live in `features/<area>/components`.
- **Platform mode:** Ionic picks `ios`/`md` per platform for native behaviour (transitions, swipe-back). The look must be mode-independent: never rely on mode-only Ionic features (e.g. `collapse="condense"`) or on Ionic's mode-specific sizing; check new UI in both modes (append `?ionic:mode=ios` / `?ionic:mode=md` to the dev URL).
- **Data:** pages inject an abstract source (e.g. `HomeSummarySource`) and load it with `resource()`. The concrete source is provided in the feature's route file, so demo → API is a one-line provider change. Demo data lives only in `*.demo.ts` files, is enforced by lint (`no-restricted-imports`), and is flagged in the UI ("Demo data" chip).
- **Routing:** add nested pages to the feature's own `<area>.routes.ts`. Full-screen flows that hide the tab bar go next to the shell route in `app.routes.ts`.
- **Onboarding:** "completed" means a valid profile exists. `requireOnboardingComplete` guards the tab shell; `redirectIfOnboarded` guards `/onboarding`. Answers are stored canonically in metric (cm/kg); `unitSystem` is display-only. The profile stores `dateOfBirth` (ISO `YYYY-MM-DD`), never age; derive age with `currentAge()` from `domain/fitness-profile/date-of-birth.ts`, and display age rather than the birth date. The app is adults-only (18+, `AGE_YEARS` in `profile-rules.ts`). `weight` is the starting/current weight at profile creation, not a history; weight tracking will get its own measurement model. No fitness calculations happen here; engines consume `UserFitnessProfile` later.
- **Domain layer** (`src/app/domain`): framework-free TypeScript, enforced by lint (no Angular/Ionic/Capacitor/rxjs or app-layer imports). Calculations take an explicit `asOfDate` (no hidden clock) and return `{ ok, value | error }`. Formula/coefficient changes require a new `calculationVersion` in `calculation-config.ts`. Results are estimates; UI copy must say "estimated maintenance", "starting calorie target", "initial protein target".
- **Quick Add:** the sheet only renders the actions it is given and emits the chosen one; the host (`TabsPage`) decides what happens. Ship an action by flipping `available` and handling `(actionSelected)`.
- **Accessibility:** touch targets ≥ 40–44px, secondary text on muted surfaces uses `--color-text-on-muted` (AA), every progress bar has a label/value text, state never relies on color alone (filled icons for the active tab, text for trends and "Coming soon"), and reduced-motion is honoured via the motion tokens.

## Production readiness

Known items that must be resolved before a production release:

- **Profile data is stored unencrypted.** `LocalFitnessProfileRepository` and `OnboardingProgressStore` keep personal and body data (date of birth, sex, height, weight, goals) as plain JSON in device storage (`localStorage` via `KeyValueStorage`). Review profile persistence (platform secure storage / encrypted local store, server as source of truth once the API exists) before release. Marked with `TODO(security, before production)` in both files.
- **Minimum age (18) is enforced client-side only.** It must also be enforced by the backend once profiles are persisted server-side.
