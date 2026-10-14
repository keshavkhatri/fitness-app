# Design system

The implementation contract for the app's UI, and for the redesign towards a
modern, premium fitness companion. Every screen consumes this system; no
screen defines its own colors, type sizes, spacing, radii or shadows.

**Status:** Phase 1 (foundation: tokens, screen themes, shared primitives),
Phase 2 (Home, to the approved mockup) and Phase 3 (the Active Workout) are in
place. Home, its notifications page and the bottom tab bar use
`fit-theme-dashboard`; the Active Workout uses `fit-theme-immersive`; every
other screen still renders with the classic theme, unchanged. Screens adopt the redesign one at a time, in reviewed phases
(see [Adopting the system](#adopting-the-system-in-a-screen)).

Source of truth, in this order: `src/theme/*.scss` (values) → this document
(rules) → `src/app/shared/ui` (components). If this document and the code
disagree, fix one of them in the same change.

## Architecture

```
src/theme/
  _palette.scss       Sass maps: $light, $dark (classic), $warm, $charcoal (redesign)
  _tokens.scss        Emits CSS custom properties; light/dark resolution; screen-theme classes
  _ionic-bridge.scss  Maps each palette onto Ionic's --ion-* variables
  _mixins.scss        text(), eyebrow, focus-ring, safe-area-padding, pressable, button-reset, tabular-numbers
  theme.scss          Global entry: base styles, utility classes, the few Ionic overrides
src/app/shared/ui/    fit-* components (public API: shared/ui/index.ts)
src/app/core/theme/   ThemeService: System / Light / Dark preference → class on <html>
```

- **One token vocabulary.** Components only use `var(--color-*)`,
  `var(--space-*)`, `var(--radius-*)`, the other tokens below and the
  mixins. Never hex values, raw `rgba()`, Sass palette maps or Ionic's
  `--ion-*` variables directly.
- **One key set.** All four palettes have exactly the same keys. `$warm` and
  `$charcoal` are built with `variant($base, $overrides)`, which fails the
  build on an unknown key. To add a color, add it to `$light` and `$dark`
  first (with values that keep classic screens unchanged), then override it
  in the redesign palettes if needed.
- **Ionic follows automatically.** Each palette also emits the `--ion-*`
  variables (background, text steps, primary/success/warning/danger/medium,
  toolbar, tab bar, overlays), so stock Ionic components match the active theme.

## Themes

Two independent axes:

1. **Appearance** (user setting, You → Appearance): System / Light / Dark.
   `ThemeService` sets `theme-light` / `theme-dark` on `<html>`; no class
   follows the OS.
2. **Screen theme** (per screen, opt-in): a class on the screen's root
   element re-emits the same tokens for its subtree.

| Screen theme | Class | Appearance light | Appearance dark |
| --- | --- | --- | --- |
| Classic (default) | none | `$light` | `$dark` |
| Dashboard | `fit-theme-dashboard` | `$warm` | `$charcoal` |
| Immersive (active workout) | `fit-theme-immersive` | `$charcoal` | `$charcoal` |

Because the names don't change, every `fit-*` component and every existing
style written against tokens adopts a screen theme with no code changes.
Screens without a class are unaffected.

### Dashboard mode

For: Home, Workout tab, Nutrition, You, Progress and other overview screens.

- Warm background `--color-bg` (#F5F4EE), white cards `--color-surface`.
- Ink text `--color-text` (#151714); secondary text `--color-text-secondary`.
- Lime (`--color-primary`, #C5F36B) only as a **fill**: the primary action,
  the selected/active state, meaningful progress on ink. Content on lime is
  always `--color-on-primary` (ink).
- At most one ink hero card (`<fit-card tone="ink">`) per screen; lime
  accents on it via `--color-ink-accent`.
- Follows the user's Appearance setting: in dark it uses `$charcoal`.

### Immersive mode (active workout)

For: the active workout and its sheets; later possibly the workout summary.

- Deep charcoal `--color-bg` (#0F100E), raised surfaces `--color-surface` /
  `--color-surface-elevated`, high-contrast text (#F5F4EE, 15.6:1).
- Lime marks the active set, completion and the primary action; on charcoal
  lime may also be text or a graphic (13.4:1 on surface).
- Exercise imagery gets visual priority: largest element above the fold,
  with text and controls arranged around it, not over it (unless on a scrim).
- Always dark, whatever the Appearance setting: the screen is used mid-set,
  often at arm's length.

### Applying a screen theme

```ts
@Component({
  selector: 'app-active-workout',
  host: { class: 'fit-theme-immersive' }, // the routed page's host (.ion-page)
  …
})
```

```html
<!-- Sheets are moved to <body> by Ionic, outside the page: pass the theme on. -->
<fit-bottom-sheet title="Finish workout?" screenTheme="immersive" [(open)]="confirmOpen">…</fit-bottom-sheet>
```

Rules:

- Put the class on the routed page's host, never on `ion-app`, `body` or a
  shell element (that would re-theme unrelated screens and the tab bar).
- Overlays (sheets, modals, alerts, toasts) render outside the page. Use
  `fit-bottom-sheet`'s `screenTheme` input; for controller-created overlays,
  add `SCREEN_THEME_CLASS[theme]` to `cssClass`.
- Nesting works (an immersive subtree inside a dashboard page wins by
  inheritance). Never put both classes on one element.
- `FitScreenTheme` and `SCREEN_THEME_CLASS` (`shared/ui/screen-theme.ts`)
  are the typed names; the CSS lives in `_tokens.scss`.
- **Status bar:** the native status bar follows the app Appearance, so an
  always-dark screen holds it dark: call `ThemeService.holdAlwaysDark()` and
  release it on destroy (the Active Workout does). It never changes the stored
  preference or `<html>`. `<meta name="theme-color">` (the browser chrome)
  still follows Appearance.
- A screen-theme class paints `background-color: var(--color-bg)`. On a sheet's
  `ion-modal` host (full viewport) that would hide the page behind the scrim, so
  `fit-bottom-sheet` keeps its host transparent.

## Color tokens

Values per palette. Ratios quoted in this document are WCAG 2.x contrast ratios.

| Token | Classic light | Classic dark | Warm (dashboard) | Charcoal (dark dashboard, immersive) |
| --- | --- | --- | --- | --- |
| `--color-bg` | `#f7f8fa` | `#0b0d10` | `#f5f4ee` | `#0f100e` |
| `--color-surface` | `#ffffff` | `#15181d` | `#ffffff` | `#1a1c19` |
| `--color-surface-elevated` | `#ffffff` | `#1c2027` | `#ffffff` | `#222520` |
| `--color-surface-muted` | `#f0f2f5` | `#22272f` | `#eceae2` | `#2a2d28` |
| `--color-text` | `#111318` | `#f5f7fa` | `#151714` | `#f5f4ee` |
| `--color-text-secondary` | `#5b6170` | `#9ca3af` | `#5c5f57` | `#a3a79c` |
| `--color-text-tertiary` | `#9ca3af` | `#6b7280` | `#8e8c84` | `#6b7067` |
| `--color-text-on-muted` | `#5b6170` | `#9ca3af` | `#5c5f57` | `#a3a79c` |
| `--color-border` | `#e5e7eb` | `#292e36` | `#e4e2da` | `#2c2f2a` |
| `--color-border-strong` | `#d1d5db` | `#3a404a` | `#cfcdc4` | `#3d413a` |
| `--color-track` | `#eceef2` | `#262b34` | `#eceae2` | `#2c2f2a` |
| `--color-primary` | `#1f6bff` | `#4d8dff` | `#c5f36b` | `#c5f36b` |
| `--color-primary-pressed` | `#1a5ce0` | `#3d7cf0` | `#b5e54f` | `#b5e54f` |
| `--color-primary-soft` | `#eaf1ff` | `#16233b` | `#eaf6cf` | `#26301a` |
| `--color-primary-text` | `#1a5fe6` | `#6ea2ff` | `#3f5e0a` | `#c5f36b` |
| `--color-on-primary` | `#ffffff` | `#0b0d10` | `#151714` | `#151714` |
| `--color-primary-strong` | `#1f6bff` | `#4d8dff` | `#5f8f14` | `#c5f36b` |
| `--color-focus` | `#1f6bff` | `#4d8dff` | `#151714` | `#c5f36b` |
| `--color-ink` | `#14161c` | `#20242e` | `#151714` | `#23261f` |
| `--color-on-ink` | `#ffffff` | `#ffffff` | `#f5f4ee` | `#f5f4ee` |
| `--color-on-ink-secondary` | `#a3a9b6` | `#a3a9b6` | `#a3a79c` | `#a3a79c` |
| `--color-ink-accent` | `#ff7a52` | `#ff7a52` | `#c5f36b` | `#c5f36b` |
| `--color-ink-track` | `rgba(255, 255, 255, 0.14)` | `rgba(255, 255, 255, 0.12)` | `rgba(245, 244, 238, 0.14)` | `rgba(245, 244, 238, 0.12)` |
| `--color-train` | `#e5482a` | `#ff7a52` | `#e5482a` | `#ff7a52` |
| `--color-train-text` | `#c2381a` | `#ff8f6b` | `#c2381a` | `#ff8f6b` |
| `--color-train-soft` | `#fdece7` | `#2e1a14` | `#fdece7` | `#2e1a14` |
| `--color-on-train` | `#ffffff` | `#14161c` | `#ffffff` | `#14161c` |
| `--color-ink-outline` | `transparent` | `#6b7280` | `transparent` | `#5e6359` |
| `--color-body` | `#0d8a79` | `#2dd4bf` | `#0d8a79` | `#2dd4bf` |
| `--color-body-text` | `#0b7a6b` | `#5eead4` | `#0b7a6b` | `#5eead4` |
| `--color-body-soft` | `#e3f5f2` | `#0f2a27` | `#e3f5f2` | `#0f2a27` |
| `--color-success` | `#16a34a` | `#22c55e` | `#15963f` | `#22c55e` |
| `--color-success-soft` | `#e8f6ee` | `#10291b` | `#e8f6ee` | `#10291b` |
| `--color-success-text` | `#15803d` | `#4ade80` | `#15803d` | `#4ade80` |
| `--color-on-success` | `#111318` | `#0b0d10` | `#111318` | `#0b0d10` |
| `--color-warning` | `#f59e0b` | `#fbbf24` | `#f59e0b` | `#fbbf24` |
| `--color-warning-soft` | `#fef4e2` | `#2e2410` | `#fef4e2` | `#2e2410` |
| `--color-warning-text` | `#b45309` | `#fcd34d` | `#b45309` | `#fcd34d` |
| `--color-on-warning` | `#111318` | `#0b0d10` | `#111318` | `#0b0d10` |
| `--color-danger` | `#dc2626` | `#f87171` | `#dc2626` | `#f87171` |
| `--color-danger-soft` | `#fdecec` | `#2f1517` | `#fdecec` | `#2f1517` |
| `--color-danger-text` | `#b91c1c` | `#fca5a5` | `#b91c1c` | `#fca5a5` |
| `--color-on-danger` | `#ffffff` | `#0b0d10` | `#ffffff` | `#0b0d10` |
| `--color-scrim` | `#111318` | `#000000` | `#151714` | `#000000` |

Also emitted: `--color-scrim-rgb` and `--color-ink-accent-rgb` (comma
separated channels, for `rgba()` in shadows only).

### Roles

| Role | Tokens | Use |
| --- | --- | --- |
| Page | `bg` | Screen background (`ion-content`, toolbars of top-level pages). |
| Surfaces | `surface`, `surface-elevated`, `surface-muted` | Cards; sheets and popovers; wells, tracks, skeletons, tonal controls. |
| Text | `text`, `text-secondary`, `text-on-muted`, `text-tertiary` | Primary content; supporting text on bg/surface; supporting text on `surface-muted` or tinted fills; placeholders and disabled only. |
| Lines | `border`, `border-strong`, `track` | Card borders and separators; input outlines and empty indicators; progress tracks. |
| Brand fill | `primary`, `primary-pressed`, `on-primary` | Primary button, Quick Add, selected indicator fill, solid primary chip. |
| Brand tint | `primary-soft`, `primary-text` | Secondary button, soft chips, selected backgrounds; brand-colored text and links. |
| Brand graphic | `primary-strong` | Progress fills, selection rings, active markers: anything that must reach 3:1 without text on it. |
| Focus | `focus` | Keyboard focus rings and focused field borders (via `fx.focus-ring`). |
| Hero | `ink`, `on-ink`, `on-ink-secondary`, `ink-accent`, `ink-track`, `ink-outline` | The one dark hero card per screen and its content. |
| Domains | `train*` (ember), `body*` (teal) | Only on their own data, always with an icon and a label. |
| Status | `success*`, `warning*`, `danger*` | Base = graphic/fill, `-text` = text, `-soft` = tinted background, `on-*` = content on the base fill. |
| Overlay | `scrim` | Backdrops and shadow tint. |

### Lime rules (contrast)

Lime #C5F36B is 1.16:1 on the warm background and 1.28:1 on white. On light
surfaces it can **never** be text, an icon, a border, a focus ring, a chart
line or a progress stroke. That is why the redesign palettes split the brand
into roles:

| On light (warm) | Token | Value | Ratio |
| --- | --- | --- | --- |
| Lime fill + ink content | `primary` + `on-primary` | #C5F36B / #151714 | 14.1:1 |
| Brand text and links | `primary-text` | #3F5E0A | 6.8:1 on bg, 7.5:1 on white, 6.6:1 on `primary-soft` |
| Progress, selection rings | `primary-strong` | #5F8F14 | 3.5:1 on bg, 3.9:1 on white, 3.2:1 on `surface-muted` |
| Focus ring | `focus` | #151714 (ink) | 16.4:1 on bg |

On charcoal, `primary-text`, `primary-strong` and `focus` are lime itself
(13.4:1 on surface, 10.9:1 on `surface-muted`). In the classic palettes the
new keys `primary-strong` and `focus` equal `primary`, so classic screens
look exactly as before.

Other verified pairs (warm): `text-secondary` 5.9:1 on bg / 6.5:1 on white /
5.4:1 on `surface-muted`; `on-ink-secondary` 7.4:1 on ink; `success`
#15963F 3.5:1 on bg (classic #16A34A would be 2.99:1), `on-success` on it
4.8:1; status `-text` shades 4.55–5.9:1 on bg. Charcoal: `text-secondary`
7.0:1 on surface, `ink-accent` 12.0:1 on ink, `ink-outline` 3.1:1 on bg.
Every solid chip pair (fill + `on-*`) is at least 4.5:1 in all four palettes.

## Typography

Inter Variable (bundled, `@fontsource-variable/inter`), system fallback.
Apply with `@include fx.text(<step>, <weight>)`; utility classes
`.text-<step>` exist for templates.

| Step | Size / line height | Letter spacing | Use |
| --- | --- | --- | --- |
| `display-xl` | 48 / 52px | tight (−0.02em) | The one hero numeral: rest timer, ring centre, key metric. New. |
| `display` | 32 / 40px | tight | Hero titles (today's workout). |
| `h1` | 28 / 34px | tight | Page large titles, exercise names. |
| `h2` | 22 / 28px | snug (−0.01em) | Sheet titles, big in-card values. |
| `h3` | 18 / 24px | snug | Section headings, card titles, metric values. |
| `body` | 16 / 24px | — | Default text, buttons, inputs (never smaller in inputs). |
| `body-sm` | 14 / 20px | — | Supporting text, descriptions. |
| `caption` | 12 / 16px | — | Labels, chips, axis labels. Smallest size allowed. |

Weights: `--font-weight-regular` 400, `medium` 500, `semibold` 600, `bold` 700.
`--letter-spacing-wide` (0.04em) is for uppercase only, via `@include fx.eyebrow`
(caption, semibold, uppercase). Numbers that change or align (timers,
weights, reps, tables) use `@include fx.tabular-numbers`.

Hierarchy rule: one dominant element per card (a number, a title or an
image), one supporting line, at most one eyebrow. Prefer a number with a
unit and a short label over a sentence.

## Spacing, layout and radii

| Spacing | Value | | Layout | Value |
| --- | --- | --- | --- | --- |
| `--space-1` | 4px | | `--page-gutter` | 20px (16px at ≤360px wide) |
| `--space-2` | 8px | | `--page-max-width` | 640px |
| `--space-3` | 12px | | `--page-max-width-wide` | 70em (two-column tablet pages) |
| `--space-4` | 16px | | `--tap-target-min` | 44px |
| `--space-5` | 20px | | `--tap-target-lg` | 52px (new: primary actions, large buttons, fields) |
| `--space-6` | 24px | | `--toolbar-height` | 44px |
| `--space-8` | 32px | | `--border-hairline` | 1px |
| `--space-10` | 40px | | Safe areas | `fx.safe-area-padding(top or bottom, $base)` mixin (Ionic's `--ion-safe-area-*`; 0 on the web) |
| `--space-12` | 48px | | | |

Use: inside a card `--space-3`–`--space-4` between items, card padding
`--space-5` (`--space-4` compact); between cards and sections `--space-6`
(`.page-body` gap). Only scale values; no in-between pixels.

| Radius | Value | Use |
| --- | --- | --- |
| `--radius-sm` | 8px | Segments, small tiles, checkbox indicators |
| `--radius-md` | 12px | Buttons, fields, notices |
| `--radius-card` | 16px | Cards and choice options |
| `--radius-lg` | 20px | Sheets |
| `--radius-hero` | 24px | The ink hero card, large imagery |
| `--radius-pill` | 999px | Chips, icon buttons, progress bars |

Icons (ionicons, registered in `core/icons/register-icons.ts`; unregistered
names don't render): `--icon-size-sm` 16px (chips, inline), `--icon-size-md`
20px (in buttons), `--icon-size-lg` 24px (icon buttons, tab bar).

## Elevation

| Level | Token | Light palettes | Dark palettes |
| --- | --- | --- | --- |
| 0 — flat | none | Muted tiles, wells | |
| 1 — card | `--shadow-card` | 1px, 2–4% scrim | none (surface color separates) |
| 2 — hero | `--shadow-hero` | soft 30px, 50% scrim, offset down | 1px `ink-accent` hairline (ember classic, lime charcoal) |
| 1b — raised | `--shadow-raised` | soft 28px lift, 14% scrim (borderless dashboard cards) | none |
| 3 — sheet | `--shadow-sheet` | upward 24px, 8% scrim | none |

Restraint: shadows are tinted with the palette's scrim and never stacked; on
dark surfaces elevation comes from lighter surfaces, not shadows.

## Motion and interaction states

| Token | Value | Use |
| --- | --- | --- |
| `--motion-duration-fast` | 120ms | Press feedback, color changes |
| `--motion-duration-base` | 200ms | Fades, toolbar title |
| `--motion-duration-ring` | 700ms | Rings and bars filling |
| `--motion-ease` | cubic-bezier(0.2, 0, 0, 1) | All transitions |
| `--state-pressed-scale` | 0.98 | `fx.pressable` |
| `--state-disabled-opacity` | 0.4 | Disabled controls (busy buttons stay opaque) |
| `--focus-ring-width` / `--focus-ring-offset` | 2px / 2px | `fx.focus-ring` |

Under `prefers-reduced-motion: reduce` all durations become 0 and a global
rule stops animations; anything animated must use these tokens (never a
literal duration) and still make sense without motion. Sequences that
would autoplay (exercise demonstrations) start paused under reduced motion.

States: pressed = scale and/or `primary-pressed` / `surface-muted`
background; selected = fill or ring **and** an icon/weight change (never
color alone); focus = `fx.focus-ring` (never remove an outline without
replacing it); disabled = native `disabled` + opacity token; busy = spinner
+ `aria-busy` (see `fit-button`'s `loading`).

## Components

All in `src/app/shared/ui`, prefix `fit-`, imported from `shared/ui`.
Presentational only: inputs in, outputs out, no services or business logic.
Native elements stay native (`button[fit-button]`, not a `<div>` with a click).

| Component | Variants / inputs | Use |
| --- | --- | --- |
| `button[fit-button]`, `a[fit-button]` | `variant`: primary, secondary, outline, ghost, on-ink, ghost-ink · `size`: md (44px), lg (52px) · `icon` · `block` · `loading` | One `primary` per view: the main action. `on-ink`/`ghost-ink` only on the ink hero. |
| `button[fit-icon-button]`, `a[fit-icon-button]` **(new)** | `icon` (required) · `variant`: plain, tonal, primary · `size`: md (44px), lg (52px) | Icon-only actions: close, back, more, play/pause. Requires `aria-label` (lint enforces it). |
| `fit-card` | `tone`: default, muted, ink · `padding`: none, sm, md | Grouping surface. `ink` = the one hero per screen. |
| `fit-section-header` | `title`, `headingId`, projected trailing action | Section title (h2) + optional "See all". |
| `fit-metric` | `label`, `value`, `unit`, `trend` · `size`: md, lg, xl **(new)** | A labelled number. `xl` for the one hero number of a card. Trend always has text. |
| `fit-progress` | `variant`: bar, ring · `tone`: primary, success, warning, danger · `label`, `valueText` (accessible) · `ringSize`, `thickness`, `gradient` **(new)** | Progress toward a target. Primary fills with `primary-strong` (accessible on light). |
| `fit-chip` | `tone`: neutral, primary, success, warning, danger · `fill`: soft, solid **(new)** · `icon` | Non-interactive status. `solid` = live state ("Active", "Done"), at most one per card. |
| `fit-notice` | `tone`: info, warning, danger · `title` · `headingLevel` | Inline explanation or problem with a heading. |
| `fit-avatar` **(new)** | `name`, `photo`, `size`, `label` | The user's photo, else initials, else a person icon. Decorative unless labelled. |
| `fit-empty-state` | `icon`, `title`, `description`, projected actions | No data yet. |
| `fit-skeleton` | (see component) | Loading placeholders. |
| `fit-text-field` | (see component) | Labelled input with suffix, hint and error; 52px. |
| `fit-segmented-control` | `variant` **(new)**: default (grey track, forms), ink (ink pill, lime selection: a light screen's main switch), compact (text options with a soft selected pill: a card's range), inverse (surface track, text-colour selection: ranges on dark screens), pills (separate pills: chart metrics on dark screens), underline (tabs of one record) | 2–4 mutually exclusive views or ranges. Native radios; every segment stays a 44px target whatever its look. |
| `fit-choice-group` | list, grid, chips layouts; single/multiple | Choosing answers (onboarding, forms). |
| `fit-bottom-sheet` | `title`, `description`, `[(open)]`, `screenTheme` **(new)** | Short focused tasks and confirmations. |
| `fit-page` | `title`, `heading`, `kicker`, `refreshable`, `wide`, `customHeader` (projected `[fitPageHeader]` instead of toolbar + large title) · projected `[fitPageSubtitle]` and `[fitPageAside]` | Top-level tab pages (large title that collapses into the toolbar). |

Known consolidation candidate (leave until its screen is redesigned; then
replace with `fit-icon-button`): `fit-bottom-sheet`'s close button.

Do not add a component until two screens need it, or one screen needs it and
it encodes an accessibility rule. Feature-specific pieces live in
`features/<area>/components`.

## Accessibility requirements

Every change must keep these; reviewers check them.

- **Contrast:** text ≥ 4.5:1 (≥ 3:1 only for text ≥ 24px, or ≥ 18.7px bold);
  icons, progress fills, focus rings, selection rings, input states ≥ 3:1
  against their surface. Use the role tokens above, which are chosen to meet
  this; a new pairing needs its ratio recorded here.
- **Never color alone:** state also changes an icon (filled/outline), weight,
  text or shape. Trends have text, status chips have words.
- **Touch targets:** ≥ `--tap-target-min` (44px); primary and mid-workout
  actions `--tap-target-lg` (52px), with ≥ `--space-2` between targets.
- **Focus:** every interactive element shows `fx.focus-ring` (or an
  equivalent `--color-focus` indicator). On ink, override the outline color
  to `--color-on-ink`.
- **Names:** icon-only controls have `aria-label`; decorative icons are
  `aria-hidden="true"`; progress has `label` and `valueText`.
- **Text scaling:** layouts wrap instead of clipping (`flex-wrap`,
  `minmax(0, 1fr)`, `overflow-wrap: anywhere` on names); no fixed heights on
  text containers.
- **Motion:** only via motion tokens; respect reduced motion.
- **Known gaps (pre-existing, accepted for now):** `text-tertiary` and the
  `border-strong` input outline are below 3:1 in the light palettes; inputs
  are identified by their visible label and focus state. Revisit with the
  form redesign.

## Responsive rules

- Design at 360px wide; verify at 320px (gutter drops to 16px at ≤360px)
  and on tablets (content capped at `--page-max-width`, or
  `--page-max-width-wide` for two-column pages).
- Single column on phones. Side-by-side tiles use
  `grid-template-columns: repeat(auto-fit, minmax(<min>, 1fr))` or
  `minmax(0, 1fr)` columns, never fixed widths.
- Full-screen flows without a tab bar pad their footer with
  `@include fx.safe-area-padding(bottom, var(--space-3))`; top insets are
  handled by `ion-header`. Never hard-code notch sizes.
- Must look identical in Ionic `ios` and `md` modes (check with
  `?ionic:mode=ios` / `?ionic:mode=md`); never rely on mode-only features.
- Landscape and short screens: sheets cap at 85dvh and scroll.

## Usage examples

```scss
// Correct
@use 'mixins' as fx;

.rest-time {
  @include fx.text(display-xl, bold);
  @include fx.tabular-numbers;
  color: var(--color-text);
}

.label {
  @include fx.eyebrow;
  color: var(--color-text-secondary);
}

.done-marker {
  background: var(--color-primary); // lime fill…
  color: var(--color-on-primary); // …with ink on it
}

.progress-tick {
  background: var(--color-primary-strong); // a graphic, must reach 3:1
}
```

```scss
// Incorrect
.rest-time { font-size: 48px; color: #151714; }              // literal values
.link { color: var(--color-primary); }                        // lime text on light (1.2:1)
.ring { stroke: var(--color-primary); }                       // lime stroke on light; use primary-strong
.field:focus { border-color: var(--color-primary); }          // focus must use --color-focus
.badge { background: var(--color-primary); color: #fff; }     // white on lime is 1.3:1; use on-primary
.page { --color-bg: #f5f4ee; }                                // redefining tokens locally; use a screen theme
.card { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2); }          // ad-hoc shadow; use an elevation token
.title { font-size: var(--ion-font-size); color: var(--ion-color-primary); } // Ionic variables directly
```

```html
<!-- Correct -->
<button fit-button variant="primary" size="lg" block icon="play">Start</button>
<button fit-icon-button type="button" icon="close" aria-label="Close"></button>
<fit-chip tone="primary" fill="solid" icon="checkmark">Done</fit-chip>
<fit-progress variant="ring" label="Protein" [value]="96" [max]="150" valueText="96 of 150 grams" />

<!-- Incorrect -->
<div class="btn" (click)="start()">Start</div>                 <!-- not a button -->
<button fit-icon-button type="button" icon="close"></button>  <!-- no accessible name (lint error) -->
<span class="green-dot"></span>                               <!-- color-only status -->
```

## Adopting the system in a screen

For each screen redesign phase:

1. Decide the screen theme: dashboard (overview screens) or immersive (the
   active workout). Add the class on the routed page's host and pass
   `screenTheme` to its sheets.
2. Rebuild layout with existing `fit-*` components first. Add a new shared
   component only per the rule above, with a spec.
3. Replace direct `--color-primary` uses that act as a focus indicator,
   border, outline or other stand-alone graphic with `focus` or
   `primary-strong` (fills paired with `on-primary` are fine). Done in
   Phase 2 for the Workout tab's today hero border and the set logger's
   active-set borders (no visual change in the classic palettes). Uses as a fill
   (`tabs.page.scss` Quick Add, `week-schedule`, `welcome-step`,
   `progress.page.scss` marks) need only a check that their content uses
   `on-primary`.
4. Check contrast for any new pairing, both appearances (light and dark),
   both Ionic modes, 320px width, large text, reduced motion.
5. Don't change routes, domain logic, persistence or copy semantics as part
   of a visual change.

When every screen has opted into `fit-theme-dashboard`, make `$warm` /
`$charcoal` the root palettes, drop the class, and retire the classic
palettes in one reviewed change.

## Reference implementation: Home

`features/home` is the dashboard-mode screen built to the approved mockup;
copy its patterns.

- Theme: `host: { class: 'fit-theme-dashboard' }` on `HomePage`, and on the
  tab bar (`shell/tabs`), so it matches the redesigned tab pages.
- Header: `fit-page customHeader` (no toolbar; the page projects its own
  header with its `<h1>`, below the safe area): wordmark (`core/brand.ts`),
  bell with an unread dot, `fit-avatar`, greeting + name, streak chip.
- Geometry: borderless cards lifted with `--shadow-raised`; the day card and
  featured card `--radius-hero` (24px), compact cards `--radius-lg` (20px),
  icon tiles `--radius-md`; Home's gutter is `--space-4`, card gaps `--space-3`.
  Everything above the tab bar fits a 390 × 844 screen.
- Brand rings and bars use `fit-progress [gradient]` (lime into the accessible
  `primary-strong`); decorative bars inside buttons are spans with the same
  gradient (the button's `aria-label` carries the value).
- One ink hero (the featured workout) with one lime primary action per state;
  frosted pills (`color-mix` of `on-ink`) over imagery; inside ink, re-point
  `--color-focus`, `--color-primary-strong` and `--color-track`.
- Whole-card links: a heading button whose `::after` stretches over the card
  (one tab stop, a full-card hit area and focus ring); see the compact cards.
- Data honesty: the ring is the mean of today's goals, each a share of its own
  target (steps vs goal, planned workout done, recovery check-in level), so no
  units are mixed; days without a planned workout leave Train out. Steps and
  recovery are self-reported (no health-device data); the streak counts days
  with any record.
- Narrow phones: container queries move the day card's tiles under the ring,
  stack the featured action, and drop compact-card title icons.

**Imagery.** No exercise photography ships yet. The featured card draws
`app-workout-art`, a seeded SVG scene in theme colors; set
`FEATURED_WORKOUT_PHOTO` (`features/home/home-media.ts`) to a bundled photo in
`src/assets/images/workouts/` to replace it. The avatar shows the user's photo
(You → name and photo) or initials.

## Reference implementation: Active Workout

`features/workout/active` is the immersive-mode screen; copy its patterns.

- Theme: `host: { class: 'fit-theme-immersive' }`, `screenTheme="immersive"` on its
  sheet, and `ThemeService.holdAlwaysDark()` for the status bar. Dark in every
  Appearance.
- Header: tonal `fit-icon-button`s (exit, options) around the position ("Exercise
  2 of 7") and a thin `fit-progress` bar. The workout's name is the page's h1,
  set as a small eyebrow above the exercise name (an h2, `display` size).
- Demonstration stage: `<app-exercise-demo variant="stage">` is always there so the
  screen doesn't jump between exercises. A placeholder with a "How to do it"
  pill; photos load only when asked, and the controls then sit under them (one
  persistent button, so focus stays on it).
- Sets: a raised panel. Completed rows read as results (badge check, "50 kg × 10",
  a filled lime check that undoes and edits), the current row is highlighted
  (`aria-current="step"`, "Current set" for screen readers, lime badge and
  border), later rows are quiet but editable. Never colour alone: icon, text and
  shape differ too.
- Rest: a ring that drains, pause/resume in its centre, restart and skip. Before
  any rest it shows the programmed rest with a start button. Next to it, a "Next
  up" card (the same action as the footer's next button; confirmation first).
- Persistent controls: workout time, "Complete set" (the current set, using what
  is typed) and "Next Exercise" / "Finish Workout"; with nothing left on the
  exercise the next step becomes the one big action. Respects the bottom safe area.
  Below 360px the clock's icon and label are dropped to keep the labels whole.
- The current set is scrolled above the footer when it changes (short phones).
- Elapsed time is measured from the log's start, so it is right after a resume.

## Reference implementation: Workout screens

The Workout tab and the screens it opens (`features/workout`).

- **Plan (the tab), dashboard theme**, following Appearance. A custom header (h1 and a
  Plan / History switch: two links in an ink pill, the current one lime with
  `aria-current="page"`; History is its own route, not a second state of the
  page). Then a Monday–Sunday date strip (today filled lime, a dot for planned
  training, an olive dot once a workout is done; training days are buttons,
  rest days aren't; it bleeds 12px into the gutter so seven 44px targets fit at
  320px), today's workout as the one ink hero (`plan/plan-today-card`: start,
  resume the workout in progress, done today → its record, activity, rest), the
  week's sessions as compact rows with date and status by icon and text, and the
  plan's facts.
- **Workout Detail, History and History Detail: immersive (always dark)**, like the
  Active Workout they lead to or come from (`holdAlwaysDark()` for the status bar).
  An image hero that fades into the page, the back button over it (an
  `ion-back-button`, so Back returns to wherever the user came from), then light
  lists (`fit-theme-dashboard` on the list) on the dark page.
- Workout Detail's exercise rows open in place (`aria-expanded`) to the full
  prescription, muscles, equipment, demonstration and any substitution: there is
  no exercise screen to link to.
- History groups by local month. A filter by session type appears only when the
  history has more than one type (logs are always resistance work, so a
  Strength/Cardio split would be invented). History Detail shows recorded totals
  only: exercises with a done set, sets done, and volume (weight × reps of done
  weighted sets, in the log's unit; omitted without weighted work). "Max" is the
  domain's `isBetterSet` rule (heaviest, then most reps). Exercises / Summary is a
  `fit-segmented-control`; Summary holds the totals and what was planned at the time.
- Imagery: no photos ship yet; heroes and thumbnails use the generated
  `app-workout-art` (seeded by session, exercise or workout id, decorative,
  `aria-hidden`). Swap in real images there when they exist.

## Reference implementation: Progress

`features/workout/progress`, mounted at `/progress` (its own tab) and `/you/progress`.

- **Overview (dashboard theme, follows Appearance).** Custom header (h1, avatar to You on
  the tab; a back button under You) and an Overview / Workout / Body
  `fit-segmented-control` that shows all of the page or one half (UI state, no routes).
  - Body cards: the latest weigh-in (`weightHistory`), body-fat % and skeletal muscle
    mass (`latestReportedValues` / `metricChange`), each with the difference from the
    previous recording and its date ("vs Oct 1"; body fat in percentage points), its
    date alone with one recording, "Not recorded" without one. Arrow and sign, never
    judged good or bad.
  - Weight trend: the weight history's own rolling ranges (30, 90, 180 and 365 days and
    all, labelled 1M / 3M / 6M / 1Y / All, with full spoken names), summary and chart
    (`weightRangeSummary`, `weightChart` with its opt-in area and callout), the latest
    value called out; the line is olive on the white card.
  - Consistency: finished training workouts per Monday–Sunday week
    (`weeklyWorkoutCounts`) over the last 12 weeks, never before the week of the first
    workout (unknown, not inactive). Ring = share of counted weeks with a workout; bars =
    workouts per week (this week outlined: in progress); the current plan's resistance
    sessions per week as a dashed reference line.
  - Key metrics: total workouts (≥ 1 completed set), total volume (weight × reps of
    completed weighted sets, `totalVolumeByUnit`; kg and lb never added; whole units),
    average start-to-finish duration.
- **Exercise list (dashboard).** Search (name or body area, case- and accent-insensitive),
  body-area chips (only areas present), sort (most recent, name); they combine, "Clear
  filters" resets. Rows: catalog area, the latest top set, and a mini trend of the top
  set over the last six comparable sessions with the change in text ("+5 kg since Sep
  30"); no trend from one session.
- **Exercise Performance (immersive, always dark).** Ranges 1M / 3M / 6M / 1Y / All (calendar
  months back from today), always all five; a range without sessions says so.
  Best set in the range (`isBetterSet`), the change of the charted metric first to last,
  a chart of one recorded value per session (top weight, volume, most reps or longest
  time; only sessions comparable with the latest, so kg and lb never share an axis). No
  estimated 1RM exists in the app, so none is shown. Sessions open their workout.
- **Workout history detail** is the one screen at `/workout/history/:id`, also mounted in
  the Progress stack (`…/progress/workout/:id`) so Back returns to the exercise without
  switching tabs. Weighted exercises show a Set / Weight / Reps table; "Best set" uses
  the same rule.

## Reference implementation: Nutrition

`features/nutrition` (the Fuel tab, `/nutrition`) and `features/calorie-check-in`.
Food comes only from the user's own log; targets only from the calculation engine
(`NutritionService` → `TargetState`). Nothing is invented: no food database, barcode,
photos or substitute targets. Food artwork is a neutral placeholder (`app-food-thumb`).

- **Daily log (dashboard).** Custom header (h1, a calendar button to the week); the
  selected date with previous / next day, and a Monday–Sunday strip of that week
  (`toDayStrip`; days after today disabled). Every day control loads the one selected
  date in `NutritionService`, which Add, Edit and Week also read. `app-day-summary`:
  calories eaten in a gradient ring ("1,450 of 2,000 kcal", remaining or over, never a
  negative remainder); without a target a plain ring with intake only and the notices'
  actions (set up / review profile). Macro columns with bars where targets exist.
  A lime **Log food** (suggested meal for the time of day). Meals as rows (what was
  logged, subtotal): a meal with food expands to its entries (tap to edit) and Add Food;
  an empty meal's row adds food. Calorie check-in as a link card.
- **Add food (immersive, always dark).** `/nutrition/food/new?meal&date`; the day and meal
  are shown and kept. Meal pills (`pills` with `--segment-selected-bg` lime). Search over
  Recent foods only (the last 30 days, de-duplicated; case- and accent-insensitive, every
  word must match) with clear, loading, none, no-match and error states. Rows: the food
  (opens it in the form to change first) and a lime + that logs it again as it was —
  disabled while saving and for 1.5 s after (a check), so a double tap never logs twice;
  the result is announced. "Enter food manually" opens the shared `app-food-form`. No
  Meals / Recipes / My foods categories or barcode exist, so none are shown.
- **Edit food (dashboard).** Close, title, Delete (confirmation sheet). The food's name
  and day · meal; serving size in the entry's own unit, nutrition per serving, a number
  of servings stepper (0.5 steps) and live totals, all from the domain (`foodPortion`:
  recorded values scaled by amount; a missing or unreadable size shows no total, never
  zero). Meal pills. Save updates the same entry (`NutritionService.update`, same id).
  "Edit name and nutrition values" switches to the full form for anything else.
- **Week (dashboard).** Back, h1, a Day / Week switch (Day returns to the daily log),
  the week range with previous / next. Calories by day (`toWeekChart`): food as a lime
  bar, the daily target as a dashed outline (legend "Food / Daily target / – Not logged");
  a day without entries has no bar and a dash, never a zero. Average this week over
  logged days only: calories with the difference from the target (arrow, %), macros with
  % of target and a bar — only where a target exists. Macros by day (Protein / Carbs /
  Fat pills), the total, and the day list (opens a day). Charts are `aria-hidden` with an
  equivalent spoken list.
- **Calorie check-in (dashboard).** Restyled only: back button, a lime badge, white
  cards, the estimate on soft lime, the outcome on lime. Content, order, the confirm
  sheets and what is saved are unchanged. It is an evidence review (logged intake vs
  weight trend → estimated maintenance → a proposed target saved only after
  confirmation), not a rating scale.

## Open design decisions

- Domain hues (ember for training, teal for body) stay alongside lime
  (decided for Phase 2).
- Corner radii are unchanged (cards 16px, hero 24px). Larger card radii can
  be adopted globally later; they are not theme-scoped on purpose.
- Lime progress on light surfaces is rendered as `primary-strong` (#5F8F14)
  for contrast; bright lime rings belong on ink or charcoal surfaces
  (confirmed for Phase 2).
- Overriding `--color-primary` to recolor a `fit-progress` no longer works
  (it reads `--color-primary-strong`); override that token instead.
