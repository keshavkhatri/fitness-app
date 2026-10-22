# Motion plan

Written 2026-10-22. The motion is meant to make the app feel alive without slowing anyone down:
- most animations are short, under 600 ms
- the ones that loop are tiny and decorative: the flame, the flag and the water surface
- nothing important depends on an animation

**Rules for every item:**

- **Reduced motion.** When the system's reduced-motion setting is on, everything below stops. The global switch is in `src/theme/_motion.scss`. The Ionic page transitions are already off in that case (`app.config.ts`). Values still show instantly, and no information exists only in motion.
- **What may animate.** Only `transform`, `opacity`, `stroke-dashoffset` and `clip`/`y` on SVGs, so the animations stay cheap on phones. Layout properties are never animated.
- **Shared parts.** The keyframes and timings are shared: `src/theme/_motion.scss` (global keyframes, `--motion-*` tokens) and `mixins.enter()` for staggered entrances.

## Navigation

| # | Animation | Where | Status |
| --- | --- | --- | --- |
| 1 | Page transition on Android: the new page slides in a little from the right and fades in; Back reverses it. iOS keeps its native slide and swipe-back. | `core/motion/page-transition.ts`, `app.config.ts` | Built |
| 2 | Switching tabs: the tab's content fades and rises in. It plays only on a tab change, never on pages opened inside a tab (it showed as a blink after their transition). | `shell/tabs/tabs.page.ts` | Built |
| 3 | Tab bar: the selected icon pops (a small bounce); the glow behind it already fades in. | `shell/tabs/tabs.page.scss` | Built |

## Shared components

| # | Animation | Where | Status |
| --- | --- | --- | --- |
| 4 | Rings and bars fill up from empty when they first appear, and slide to new values after that. This covers Home's rings, the macro rings, Nutrition's day ring and every progress bar. | `shared/ui/progress` | Built |
| 5 | Tappable cards press in slightly when touched. | `theme/_dashboard-card.scss` | Built |
| 6 | Choices (onboarding, check-in, settings): the selected option's check pops in. | `shared/ui/choice-group` | Built |
| 7 | Segmented controls and filter pills: the selected pill pops. | `shared/ui/segmented-control` | Built |

## Home

| # | Animation | Where | Status |
| --- | --- | --- | --- |
| 8 | The dashboard's cards rise in one after another on first load. | `home.page.scss` | Built |
| 9 | Streak flame flickers, on the header pill and the Next milestone card. | `home-header`, `milestone-card` | Built |
| 10 | Bell: it rings once when there are unread notifications, and the red dot pulses. | `home-header` | Built |
| 11 | This week: done days' checks pop in one by one, and today's planned ring pulses once. | `week-activity-card` | Built |
| 12 | Next milestone: the dots pop in one by one, the summit rises and the flag waves. | `milestone-card` | Built |
| 13 | Hydration: water rises in the glasses, the surface ripples in a filled glass, a new glass splashes, and "+" bounces. | `nutrition/components/hydration-card` | Built |
| 14 | Body overview: the weight line draws itself from left to right, the area fades in under it, and the latest point pulses. | `body-overview-card` | Built |
| 15 | Macro rings fill one after another (from #4, with a stagger). | `macro-target-card` | Built |
| 16 | Today's meals: the sun turns slowly, and "+" turns as it's pressed. | `today-meals-card` | Built |
| 17 | Weekly progress: the bars grow from the left, one after another. | `weekly-progress-card` | Built |
| 18 | Mindset and Track your progress: the photo zooms slowly (Ken Burns), and the button's arrow nudges. | `mindset-card`, `track-progress-card` | Built |
| 19 | Today's workout: the Start arrow nudges, and "Mark as done" turns into a check that pops. | `today-workout-card` | Built |

## Other pages

| # | Animation | Where | Status |
| --- | --- | --- | --- |
| 20 | Streak page: the grid's days fade in week by week, and the milestones pop in. | `home/streak` | Built |
| 21 | Notifications: the items slide in one after another, and unread dots pulse. | `notifications` | Built |
| 22 | Workout summary: a confetti burst, and the headline pops. | `workout/summary` | Built |
| 23 | Active workout: a completed set's check pops. | `workout/active` | Built |
| 24 | Nutrition week: the chart bars grow from the bottom, one after another (calories, macros, water). | `nutrition/components/week-bar-chart` | Built |
| 25 | Progress charts: the line draws itself, and the points pop in. | `shared/ui/point-chart` | Built |
| 26 | Nutrition: the meal sections rise in when a day loads. | `nutrition.page.scss` | Built |
