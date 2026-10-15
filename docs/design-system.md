# Design system

The implementation contract for the app's UI, and for the redesign towards a
modern, premium fitness companion. Every screen consumes this system; no
screen defines its own colors, type sizes, spacing, radii or shadows.

**Status (15 Oct 2026):** the redesign is in place across the app. All 28
feature page components and the tab shell render with a redesign screen theme
(`fit-theme-dashboard`, `fit-theme-immersive`, or one chosen by view); see the
[screen inventory](#screen-inventory). The classic palettes (`$light` / `$dark`)
are still the root palettes and the default for any new screen that doesn't
opt in; retiring them is a separate, reviewed change (see
[Adopting the system](#adopting-the-system-in-a-screen)). A visual QA pass of the
running app is recorded in [Visual QA](#visual-qa-15-oct-2026): what was
inspected, the defects fixed, and what is still open or unverified. The
approved mockup files are not in the repository, so that pass checked
consistency with this document and the screens' own specifications, not a pixel
comparison.

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

A page can pick its theme per view by binding both classes to one signal
(`[class.fit-theme-immersive]="dark()"`, `[class.fit-theme-dashboard]="!dark()"`),
never both true: Assessment, Workout Summary, Notifications and Onboarding do.
The tab bar stays on the app Appearance, so on an immersive view it is light in
light Appearance: the page above it is dark, the bar is not.

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

For: the active workout and its sheets, and the screens that lead to or from
it or are focused tasks (Workout Detail, History and History Detail, Exercise
Performance, Add food, the weight / measurement / InBody entry and detail
screens, Fitness Review). Assessment, Workout Summary and the Notifications
inbox use it for some of their views (see the [inventory](#screen-inventory)).

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
- **Every `fit-bottom-sheet` passes `screenTheme`**, matching its page. Without
  it the sheet falls back to the classic palette: in dark Appearance it shows
  the old blue (Save button, links, icons) on navy over a lime and charcoal
  page. The visual QA found five sheets without it (Calorie check-in ×2,
  Food entry's delete confirmation, the Name and photo sheet, Quick add); all
  now pass `dashboard`. A new sheet without `screenTheme` is a defect.
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
| Domains | `train*` (ember), `body*` (teal) | Only on their own data, always with an icon and a label. **As built:** only the active workout's muscle figure uses `train`; no screen uses `body*` yet (body data uses lime / olive like everything else). |
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
| `button[fit-button]`, `a[fit-button]` | `variant`: primary, secondary, outline, ghost, danger, ghost-danger, on-ink, ghost-ink · `size`: md (44px), lg (52px) · `icon` · `block` · `loading` | One `primary` per view: the main action. `on-ink`/`ghost-ink` only on the ink hero. |
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
| `fit-choice-group` | list, grid, chips, circles layouts; single/multiple; optional `media` (photo or placeholder) on list cards | Choosing answers (onboarding, forms). |
| `fit-ruler` | horizontal / vertical; any range and step | Picking a number by dragging a scale (onboarding height and weight). An ARIA slider: drag (touch, pen, mouse) with flick and snap, tap a tick, arrows / Page / Home / End, wheel. Only nearby ticks are drawn. Always offer a typed alternative next to it. |
| `fit-bottom-sheet` | `title`, `description`, `[(open)]`, `screenTheme` **(new)** | Short focused tasks and confirmations. |
| `fit-page` | `title`, `heading`, `kicker`, `refreshable`, `wide`, `customHeader` (projected `[fitPageHeader]` instead of toolbar + large title) · projected `[fitPageSubtitle]` and `[fitPageAside]` | Top-level tab pages (large title that collapses into the toolbar). |

Known consolidation candidate: `fit-bottom-sheet`'s close button is still its
own `button.close`, not `fit-icon-button`. Every screen is redesigned now, so it
can be replaced.

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
- **Known gaps (pre-existing, accepted for now; measured 15 Oct 2026):** the
  `border-strong` input outline is 1.45:1 on the warm page (1.59:1 on white;
  classic 1.47:1) and 1.65:1 on charcoal surfaces, below the 3:1 above;
  `text-tertiary` is 3.06:1 on the warm page, 3.37:1 on white (classic 2.54:1) and
  3.4:1 on charcoal surfaces, below 4.5:1, so it stays for placeholders and
  disabled text only. Inputs are identified by their visible label and focus
  state. The forms are redesigned now and these are still open.

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

Every screen has now opted into a redesign theme, so the last step is open: make
`$warm` / `$charcoal` the root palettes, drop `fit-theme-dashboard`, and retire
the classic palettes in one reviewed change (`fit-theme-immersive` stays: those
screens are always dark). Until then a surface that forgets its theme falls back
to the classic palette, which is how the five sheets above showed blue.

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
  is typed) and "Next exercise" / "Finish workout"; with nothing left on the
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
  logged, subtotal): a meal with food expands to its entries (tap to edit) and Add food;
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

## Reference implementation: You and body tracking

`features/you`, the Profile editor (`features/onboarding`, review mode), `features/body-weight`,
`features/body-measurements`, `features/body-composition` and `features/fitness-review`.
Every value comes from the stored profile, identity and histories; nothing is made up.
Shared chrome lives in `src/theme/_tracking.scss` and is applied by host class:
`fit-tracking-page` (light history screens: header with back, title and Add; card rows) and
`fit-tracking-form` (dark entry and detail screens: close bar, footer).

- **You (dashboard).** Photo or initials (`app-you-header`; the photo edits name and photo),
  name, then age and height from the profile, shown only when known. A goal card from the
  profile's primary goal (onboarding wording) opens the Profile editor. A six-tile grid
  (Profile, Weight, Body measurements, Body composition, Fitness review, Quick add) where each
  tile opens an existing screen or the Quick Add sheet. Progress has a link card. Settings
  keeps Appearance, Units and the coming-soon list.
- **Profile editor (immersive).** `/onboarding/review` (unchanged route and flow): a dark
  "Profile" view of the review summary, with the avatar and grouped field-like rows
  (Personal details, Goal, Training). Each row opens the existing step for that value, with
  that step's validation. **Save profile** saves through `OnboardingFlow` and re-runs the
  assessment as before. First-run onboarding keeps its light summary.
- **Weight history (dashboard).** Ranges 1M–All (`ink`). The latest value is large, beside
  its change from the first point in the range ("From 82.2 kg, Thursday, Oct 1") and the
  range's lowest and highest records; with a single point, no change is claimed. The area
  chart calls out the latest point. Entries are listed as date and change on the left, the
  weight on the right.
- **Weight entry (immersive).** A large weight field (`fit-text-field size="lg"`) and a
  ±10 fine-adjust slider around the entry or the latest record (none without one; it only
  writes the field), then the date. The model has no notes field, so none is shown.
  Profile-weight and delete actions are unchanged.
- **Measurements (dashboard).** A Chart/List switch. Chart: ranges and one line per site
  (`measurementChart`), each site with its own colour **and marker shape**. A site read once
  is a point; legend buttons (`aria-pressed`) show or hide sites. The readings are also
  listed as text. Latest values appear in both views; List adds every entry.
- **Measurement entry (immersive).** The date first, then the five sites on one card.
- **InBody history (dashboard).** Report cards with placeholder sheet art (`app-report-thumb`):
  report images aren't stored, so no real thumbnail exists. Latest values follow.
- **InBody detail (immersive).** Placeholder art, date and source; Overview / All values tabs.
  Overview has key tiles (weight, body fat %, SMM, plus BMI when the report states it, each with
  its change) and composition bars. A share of weight is **calculated** only for masses in the
  weight's unit, and is labelled as calculated; water in litres never gets one. The report
  has no segmental fields, so no segmental view exists.
- **InBody entry (immersive).** Take photo (`capture="environment"`) and Choose from files feed
  the same image upload. Supported formats: JPG, PNG and WebP up to 8 MB (no PDF). The
  extraction runs through the existing server endpoint (OpenAI key server-side) and is
  re-validated against the strict schema. Its result fills the form for review, with
  warnings, and nothing is saved until Save. Failures explain themselves; manual entry
  stays available.
- **Fitness Review (immersive).** Week navigation, then Summary (a highlight, stat tiles,
  body changes) / Trends (training, nutrition) / Insights (focus actions) over the existing
  review view model, plus **View detailed progress** (Progress).

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

## First-run onboarding

`/onboarding` (`features/onboarding`): twelve screens on the warm (lime) dashboard theme, with a
dark welcome. Progress is the slim bar and `n/total` in the header (question and review screens
only); Continue sits in the footer above the safe area. Copy states only what the app does.

- **Welcome**: dark backdrop (a placeholder until a photo ships; `onboarding-media.ts`), the brand
  from `APP_BRAND`, four benefits, *Get started*; *Set up from an InBody report instead* when the
  build can read reports.
- **About you**: name, sex as three cards (generic symbols until avatar artwork ships), date of birth
  from the platform date picker (18+).
- **Height**: vertical `fit-ruler` (26 px per cm or inch, higher is up) beside a placeholder
  figure; *cm / ft in* switch; *Enter manually* opens typed fields that stay in step with the ruler.
- **Weight**: big readout over a horizontal `fit-ruler` (10 px per 0.1); *kg / lb*; *Enter manually*.
- **Activity, goal, experience, location**: list cards; goal and location cards lead with a
  picture (`media`; placeholders today). **Days per week**: `circles` layout, 2–6 (the domain's
  `TRAINING_DAYS_PER_WEEK`), with a tip. **Equipment**: 3-column icon tiles (multiple).
- **Review**: grouped rows (icon, label, value, chevron); each opens its screen and returns.
- **Complete**: says the plan is ready only after `WorkoutPlanService` made it; continues to the
  assessment.

Not built (no data behind it): a nutrition-preference screen and the BMI "visual reference" under
the weight ruler.

## Assessment

`/assessment` (`features/assessment`): one result, four views, chosen by the `view` query
parameter on the same route (`?view=macros|why|next`; none is Results). The page and its loaded
result stay put while browser Back, the in-page Back and Android back move between views.

| View | Theme | Content |
|---|---|---|
| Results | immersive (dark) | Confidence chip, calorie target (maintenance underneath), three macro tiles, goal focus, weight / height / activity. |
| Macro breakdown | dashboard (warm light) | SVG donut of each macro's calories (labelled in words for screen readers; slices separated by gaps), rows with grams, % of calories and kcal, and how the split serves the goal. |
| Why these numbers? | immersive (dark) | The engine's steps (`explanation`): resting energy, activity factor, maintenance (and a Calorie Check-in figure when one is in use), goal adjustment, then the target, emphasised. Estimate confidence and a collapsible *Factors we consider*. |
| Next steps | dashboard | Workout plan, Nutrition, Progress (each marks the assessment reviewed, which the tab shell requires) and Adjust anytime (Profile editor); **Go to home**, *View assessment again*. |

Macro colours reuse theme fills: protein `--color-primary-strong`, carbohydrates `--color-primary`,
fat `--color-warning`; a macro is always named and valued next to its colour. Values come only from
`FitnessAssessment` through `toAssessmentViewModel`; the only arithmetic in the view model is the
goal adjustment in kcal (target minus maintenance, both engine values) and each macro's calories
(grams × the engine's energy per gram).

## Workout Summary

`/workout/summary/:workoutId` (`features/workout/summary`), opened by Active Workout when a workout
is finished. Four views of one finished workout, chosen by the `view` query parameter on the same
route (`?view=exercises|insights|next`; none is the overview), with the same Back behaviour as the
Assessment. Shared view mixins: `src/theme/_views.scss` (`@use 'views' as view;`).

| View | Theme | Content |
|---|---|---|
| Overview | immersive | Complete (check, confetti) or "Workout finished" (flag) — never "complete" unless every set was. Name, finish date and time; duration, exercises, sets, total volume (only with weighted sets), % of sets completed; a highlight that states only what the log shows. |
| Exercise breakdown | dashboard | Each exercise in recorded order: completed sets, reps (or seconds) per set, load range, the domain's volume, and a done / partly / skipped mark. Rows with completed sets open the exercise's Progress page. |
| Performance insights | immersive | Volume, sets and duration against the latest earlier workout of the same kind (session type and variant; volume only in the same unit); "Not enough history yet" without one. A volume trend of up to five same-kind workouts (bars labelled with value and date), and "New best volume" only when strictly higher than every earlier one. |
| What's next | dashboard | The plan's next training day (its weekly layout), Nutrition, Progress, and recovery advice (not a link: there is no recovery feature). **Go to home**, *View workout plan*. |

No calories are shown: the app has no supported estimate.

## Notifications

`/home/notifications` (Home's bell) and `/home/notifications/:notificationId`. In-app reminders
only: `NotificationInboxService` builds today's reminders from the user's own data each time
(planned or in-progress workout, recovery check-in, food not logged, weigh-in due); nothing is
pushed, scheduled or delivered by the system, and there are no notification settings yet.

- **Inbox**: chips All / Unread / Workouts / Nutrition (`fit-segmented-control`, `pills`, lime
  selection); the filter is the `filter` query parameter, so it survives a detail visit. Cards:
  category icon, title, message, "Today", chevron. Unread items have a dot, a bolder title and
  "unread" for screen readers. **Mark all read** when anything is unread. Dark for All and
  Unread; the category filters and the empty inbox are warm light.
- **Detail** (light): category icon and label, title, the day ("Today · Thursday, October 8" — a
  reminder is for a day, so no time is shown), message, the facts it was built from, and one
  action opening the existing screen (workout session, active workout, Home's recovery check-in,
  log food, log weight). Opening it marks it read (stored). A reminder that is no longer current
  says so, with no action.
- **Empty states**: "No notifications yet", "All caught up!" (Unread), "No workout / nutrition
  notifications".

## Screen inventory

Every routed page component and its screen theme, read from the code (`host`
classes and the route files), 15 Oct 2026. The app has 29 `*.page.ts` files: 28
feature pages and the tab shell page (`shell/tabs`, `fit-theme-dashboard`).
`app.routes.ts` defines 12 routes and the ten feature route files 35 more
(31 `loadComponent`, 4 `loadChildren`); Progress is also mounted at
`/you/progress`, and Workout History Detail at `…/progress/workout/:workoutId`.

| Route | Page | Screen theme |
| --- | --- | --- |
| `/home` | Home | dashboard |
| `/home/notifications` | Notifications | immersive for All / Unread, dashboard for the category filters and the empty inbox |
| `/home/notifications/:id` | Notification detail | dashboard |
| `/workout` | Workout (Plan) | dashboard |
| `/workout/history` | Workout History | immersive (list on `fit-theme-dashboard`) |
| `/workout/history/:id` | Workout History Detail | immersive |
| `/workout/session/:id` | Workout Detail | immersive |
| `/workout/session/:id/active` | Active Workout | immersive |
| `/workout/summary/:id` | Workout Summary | immersive for Overview and Insights, dashboard for Exercises and What's next |
| `/nutrition` | Nutrition (daily log) | dashboard |
| `/nutrition/week` | Nutrition Week | dashboard |
| `/nutrition/check-in` | Calorie Check-in | dashboard |
| `/nutrition/food/new` | Add food | immersive |
| `/nutrition/food/:id` | Food entry (edit) | dashboard |
| `/progress` | Progress | dashboard |
| `/progress/exercises` | Progress Exercises | dashboard |
| `/progress/exercise/:id` | Exercise Performance | immersive |
| `/you` | You | dashboard |
| `/you/review` | Fitness Review | immersive |
| `/you/weight-history` | Weight History | dashboard |
| `/you/weight-history/new`, `/:id` | Weight entry | immersive |
| `/you/measurements` | Measurement History | dashboard |
| `/you/measurements/new`, `/:id` | Measurement entry | immersive |
| `/you/body-composition` | Body Composition History | dashboard |
| `/you/body-composition/:id` | Body Composition Detail | immersive |
| `/you/body-composition/new`, `/:id/edit` | Body Composition entry | immersive |
| `/onboarding` (`/review`) | Onboarding / Profile editor | dashboard; immersive for the welcome screen and the Profile editor |
| `/assessment` | Assessment | immersive for Results and Why, dashboard for Macros and Next steps |

## Visual QA (15 Oct 2026)

A pass over the **running app** (dev server, headless Chrome driven over the
DevTools protocol, no added dependencies) with a seeded profile, ten completed
workouts, 14 weigh-ins, three measurement sets and food for seven days, and again
with a profile and no data. Screenshots were taken per screen at 320, 390 and
430 px wide in light and dark Appearance, and every one was checked by script
for horizontal overflow, clipped text, tiny controls and console errors.
Screenshots were only *looked at* where the table below says so.

**Not a mockup comparison.** The approved mockup files aren't in the
repository, so "matches" below means consistent with this document, the
screen's own specification above, and the other screens.

### Inspected by eye

| Area | What was looked at |
| --- | --- |
| Home | 390 light, 320 light and dark, empty data dark; the recovery check-in sheet |
| Onboarding → Assessment | the full first run at 390 light (welcome, About you, height, target weight, equipment, review, done) into Assessment |
| Assessment | Results, Macro breakdown, Why these numbers?, Next steps at 390 light (Results and Why are dark by design) |
| Workout Summary | Overview, Exercise breakdown, Performance insights, What's next at 390 light; Exercise breakdown at 320 dark; the not-found state; reached from a workout finished in the app |
| Notifications | All, a category filter and a detail at 390 light; All and the detail at 390 dark; All at 320 light |
| Workout | Plan 390 light and dark, Workout Detail, History, History Detail, not-found state |
| Active Workout | start, a set done, rest running, "move to next exercise?" and "finish?" sheets, options sheet, completing every set and finishing (log saved, session cleared, Summary opened); empty state at 320 |
| Nutrition | daily log 390 light and 320 dark, Week 390 light and dark, Calorie check-in 390 light and dark, Add food, Edit food at 320 dark |
| Progress | Overview 390 light and 320 dark, empty state, Exercises list, Exercise Performance |
| You | hub 390 light and 320 dark, Name and photo and Quick add sheets, Fitness Review, Weight History 390 light and dark, Weight entry add / edit / delete sheet, Measurements, Measurement entry at 320 dark, Body Composition empty state and entry at 320 |
| Navigation | Home → bell → Notifications → filters → detail → its action; Progress tabs and ranges → Weight History; Nutrition day → Add food; Workout → History → a workout; Workout Detail → Active Workout |

### Defects found and fixed

| Where | Defect | Fix |
| --- | --- | --- |
| You: Name and photo, Quick add; Calorie check-in ×2; Food entry delete confirmation | Sheets without `screenTheme` rendered in the classic palette: blue Save button, links and icons on navy, over a lime and charcoal page (dark Appearance) | `screenTheme="dashboard"` on all five |
| Every dashboard-themed sheet (Home's check-ins, and the five above once themed) | In dark Appearance the sheet's modal host was painted opaque charcoal by `:root.theme-dark .fit-theme-dashboard`, hiding the page behind the scrim (the "keep the host transparent" rule only won in light) | The transparent-host rule in `fit-bottom-sheet` now outranks the dark dashboard theme |
| Active Workout: Next up card | At 390 px a long next exercise ("Dumbbell Romanian Deadlift") broke mid-word (`Dumbbe / ll / Romania / n`) | Slimmer thumbnail between 150 and 170 px wide tiles |
| Active Workout: empty and loading states | The "No workout in progress" card and the loading skeletons touched the screen edges | Page gutter on both |
| Exercise Performance | The best set (`72.5 kg × 10`) wrapped, leaving the reps alone on a line, at 360–479 px | Change moves under the value up to 479 px (was 359 px) |
| Measurements chart | The 3-month axis read "Aug Aug Sep" (labels at fixed fractions named by month) | Month names at the first of each month, no repeats, none on an edge; unit test added |
| Workout History | Filter pills stretched with their labels left-aligned | Labels centred |
| Home: Nutrition card | Three-digit protein (`171g`) touched the 72 px ring | Value at body size |

### Open items

- *Resolved after the pass (decisions by the project owner):* button and action
  copy is **sentence case** everywhere ("Finish workout", "Back to home", "View
  workout", goal names such as "Build muscle"; proper nouns and session names such
  as "Upper Body A" and "InBody" keep their capitals), and **destructive actions are
  red**: `fit-button` variants `danger` (the confirm that deletes or discards, on
  `--color-danger` with `--color-on-danger`) and `ghost-danger` (the control that
  opens the confirmation, red text and trash icon); the cancel beside a
  destructive confirm is `outline` (neutral). Applied to the weight, food and
  InBody delete sheets, the Active Workout "Discard workout" confirm and the "Discard
  and start" action. Lime stays for primary and positive actions; only the action
  itself is red.
- **Notifications filter row** scrolls sideways at 320 px, the last pill running to
  the edge (by design, `--segment-wrap: nowrap`; the page doesn't overflow).
- **Dev-mode NG0956 warning** ("tracking expression … caused re-creation of the
  entire collection of size 1") on the Assessment footer action, the Active
  Workout muscle chips and the Workout Summary views: single-item lists whose
  item really changes. Harmless; production builds don't log it.
- **Colour tokens** `body*` (teal) is unused and `train*` (ember) only colours
  the muscle figure (see Roles).
- The two accessibility gaps in [Accessibility requirements](#accessibility-requirements).
- `fit-bottom-sheet`'s close button isn't a `fit-icon-button`.

### Not inspected

- **Real devices:** safe-area insets (zero in a desktop browser), the on-screen
  keyboard, haptics, pull-to-refresh, status bar behaviour, the native date
  picker.
- **Ionic `ios` and `md` modes** (only the default mode was run) and **tablet**
  two-column layouts.
- **Body Composition Detail, populated History and entry-with-data / edit**:
  no report was seeded, and reading a report needs the extraction server and its
  key. Their empty state and manual entry form were looked at; the populated
  screens were not.
- **Screenshots captured and machine-checked but not looked at one by one:** most
  430 px captures; dark Appearance at 320 and 430 for screens not listed above;
  Notifications Unread / Nutrition filters and the empty inbox; Measurement
  History's list view; Weight / Measurement *new* in light.
- Exercise demonstration photos (they load from a CDN on request), screen reader
  output, reduced motion, large text and keyboard-only navigation.
