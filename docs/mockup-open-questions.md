# Mockup matching: open questions

Decisions to go through together. While matching the mockups in `C:\Users\keshu\Downloads\stokeform mockups`, anything that needs a product or design call is left as it was in the app and logged here instead of blocking the work.

Each entry: the screen, what the mockup shows, what the app does today, and the options.

## Workout

1. **Workout detail: "•••" menu (top right).** The mockup shows one; it has no defined action. Options: add actions (swap an exercise, skip the session, edit the plan), or leave it out. *Left out for now.*
no changes needed
2. **Workout tab: "See all ›" next to "This week".** The mockup has "See all" where the app shows "0 of 4 done". Options: "See all" opens History; keep the progress count; show both. *Kept the count.*
no changes needed
3. **Tab bar labels.** The mockups disagree: Workout + Nutrition (workout showcase), Train + Fuel (dashboard), and Train + Fuel + **Body** (UI collection, newest). Options: pick one set; add a Body tab. *Kept Home · Train · Fuel · Progress · You.*
no changes needed
4. **Workout detail: day label ("Thursday") above the title.** Not in the mockup. Options: remove it; keep it (it tells you which day the session is planned for). *Kept.*
no changes needed

## Home

5. **"Weekly review" card.** Home (and Progress) show a "Weekly review" card that is not in the dashboard mockup. Options: keep it; move it to Progress only; remove it. *Kept.*
no changes needed
6. **Greeting.** The mockup shows "Good morning," on one line and the name large below. The app already does this when the account has a name; without a name it shows the greeting large on its own (as now). No change needed unless you want a fallback name.
no changes needed

## Progress and history

7. **History filters.** The mockup filters by **Strength / Cardio**; the app filters by the session types you actually trained (Upper Body, Lower Body, …), because every logged workout today is a strength session. Options: Strength/Cardio (needs cardio logging first); keep session types. *Kept.*
no changes needed
8. **Key metrics deltas.** The mockup shows "+12% vs previous 3 months" under Total workouts / Total volume / Avg. duration; the app shows "All time" totals. Options: switch to a 3-month window with a comparison; keep all-time. *Kept.*
no changes needed
9. **Chart and bar colours.** The mockups use bright lime for the weight line and consistency bars; the app uses a darker green there so they pass contrast on the light card (WCAG AA). Options: lime (lower contrast); keep the darker green. *Kept.*
no changes needed
10. **Weight trend range "All" and "Weight history" link.** Not in the mockup (it has 1M/3M/6M/1Y only). *Kept.*
no changes needed
## Workout summary

11. **"Est. calories" stat.** The completion overview mockup has an "Est. calories" tile. The app doesn't estimate workout calories yet (it would need a method, e.g. MET × body weight × time). Options: add the estimate; leave it out. *Left out.*
yes implement this feature
**Done (2026-10-20):** an "Est. calories" tile on the completion overview and in Performance insights (with the change vs last time). Estimate = MET 5.0 (general resistance training) × body weight (profile) × time from start to finish, rounded to 5 kcal (`estimateWorkoutCalories`, domain/workout-session/workout-energy.ts). Hidden when there is no body weight.

## Notifications

12. **Settings gear vs "Mark all read".** The mockup has a settings gear top right; the app has "Mark all read" there (and no notification settings screen yet). Options: add a notification settings screen behind a gear; keep "Mark all read". *Kept.*
no changes needed

## Onboarding

13. **Nutrition approach step** (Balanced / Vegetarian / Vegan / Other with food photos). Not in the app; nothing uses a diet preference yet, and it is nutrition imagery. Options: add the step (and use it in Fuel); leave it out. *Left out, no images generated.*
no changes needed
14. **Activity levels.** The mockup has five (adds "Extremely active"); the app has four, matching the calorie formula's activity factors. *Kept four.*
no changes needed
15. **Equipment items.** The mockup lists Barbell, Dumbbells, Cable machine, Squat rack, Bench, Pull-up bar, Resistance bands, Kettlebell, Other; the app's list is what the workout engine understands (Dumbbells, Barbells, Resistance bands, Pull-up bar, Bench, Bodyweight only, Other). Adding items means teaching the engine about them. *Kept.*
no changes needed
16. **Sex: "Prefer not to say".** Not in the mockup (Male / Female only). *Kept (it now has its own avatar).*
no changes needed
17. **Height / weight pickers.** The mockup's height ruler has a body silhouette and the weight step a BMI-style "Visual reference" row. *Not added: the BMI bands are a health claim we should decide on together.*
yes we need to implement both
**Done:** the height step shows a generated grey body figure beside the ruler; the weight step shows a "Visual reference" row with the four WHO BMI bands converted to weights for the height you entered (kg or lb), marking yours, with a one-line caveat that BMI doesn't tell muscle from fat.
18. **Account step and "You're all set!" screen.** The app asks to create an account after Review (not in the mockup); the mockup ends with a "You're all set!" screen. *Kept the current flow (account → assessment → plan offer).*
no changes needed

## Plans, Pro and the custom plan editor

19. **Plan selection: "Free / Pro" tabs and price card.** The mockups show a Free/Pro tab switch, a "Most popular" tag and a "₹299 / month" price. The app shows a Free-vs-Pro comparison table and the store's real price (none until RevenueCat products are live). *Kept: prices must come from the store.*
since we are in a dev mode you can mark a todo for the price to come from store but for now put static price and match the given mockup fully including all the pages given in mock
**Done:** plans view with Free / Pro tabs ("Most Popular" on Pro), two-column comparison, inline promo code card and a dark Continue; "Go Pro" view with feature list, a static ₹299 / month preview price (`PREVIEW_PRODUCT`, marked `TODO(billing)` in offer-content.ts; the store's real products replace it as soon as RevenueCat returns any), Subscribe and Restore purchases; dark "Pro Test Access Activated!" screen after a promo code; Enter Promo Code sheet (from Settings); Restore Purchases sheet; dark Pro Feature gate with Unlock Pro and Learn more. Subscribe on the preview price explains that subscriptions aren't live and charges nothing.
20. **Custom plan editor: 3-step header (Basics → Workout → Review) and "Save".** The app's editor is one list with "Review plan"; the mockup has a stepper. Options: add the stepper; keep the single list. *Kept.*
yes entire custom plan pages need to change and need to match with mockup 100%
**Done:** dark header "Custom Workout Plan" with Save and the 1 Basics → 2 Workout → 3 Review steps on every page. Basics lists the training days (areas • count); Workout is the picker for one day with Library / My Plan tabs, search, type chips, photo rows with a circled + and a dark "N exercises selected · Next" bar (Next goes to the next day, then Review); My Plan holds the day's editing (sets, reps, rest, order, remove); Review lists the plan and saves. Exercise details sheet: photo with muscles • type, Equipment / Muscles / Description (the exercise's form and breathing cues) rows, Suggested Sets & Reps, Add to Plan.
21. **Picker filters.** The mockup uses chips (All / Strength / Mobility / Cardio); the app has Muscle and Equipment dropdowns, which match how the library is organised. *Kept.*
this also need to get changes we need to add tags into the excersize library like strength cardio etc and implement this too
**Done:** every catalog exercise has `categories` (strength, core, mobility, cardio; derived from its movement pattern, with Bird Dog, Dead Bug, Band Pull-Apart, Reverse Snow Angel and Prone Y Raise also tagged mobility). The picker shows All / Strength / Core / Mobility / Cardio chips; the muscle and equipment dropdowns are gone, and the search now also matches muscle and equipment words. Tags are browsing-only: they are left out of the plan id, so existing plans are unchanged.
22. **Saved plan view (Overview / Exercises tabs, plan photo, "4 days/week · 45–60 min").** Not built; the Workout tab already lists the plan's days. *Left out.*
no changes needed
23. **You: "Settings" row and "Your Plan" status row**, and the Fitness review "Trends / Insights" tabs. The app's You hub has a Progress row instead of Settings (there is no settings screen yet). *Kept.*
we need to have a settings screen and move all the settings there
**Done:** new Settings screen (/you/settings, gear on You and a Settings row): Appearance, Units, Your plan (status, Enter promo code, Restore purchases) and Coming soon. You keeps the hub, the account card and a Your Plan row.
## New questions (2026-10-20)

24. **Pro feature list.** The mockup's Pro list promises "Advanced programming", "More training options" and "Priority support". None of these exist, so selling them would mislead paying users. The plan screens list what Pro really adds: the custom plan editor, picking from the whole library, your own sets/reps/rest, and everything in Free. Options: build those features; keep the honest list. *Kept the honest list.*
25. **Demo promo code on the Enter Promo Code sheet.** The mockup shows the code in the app and says "works in both debug and production builds". The code unlocks Pro for anyone, so the sheet shows it (with a "use" button) only in development builds, never in the store build. Options: show it in production too; keep it development-only. *Development only.*
26. **Exercise descriptions.** The details sheet's Description is built from each exercise's form and breathing cues (the same words as its guide sheet), not a written paragraph like the mockup's. Options: write a paragraph per exercise (77); keep the cues. *Kept the cues.*

## New questions (2026-10-22, Home dashboard cards)

27. **"Mindset for today" photo.** The mockup shows a person on a mountain at sunrise; no such photo ships with the app, so the card uses the rest-day photo (`MINDSET_PHOTO` in `features/home/home-media.ts`). Options: supply a sunrise photo (dark enough for white text on the left); keep the rest-day photo. *Rest-day photo for now.* "Track your progress" uses the existing offer photo (`TRACK_PROGRESS_PHOTO`).
28. **Hydration without the Sleep card.** In the mockup Hydration shares a row with Sleep, which was left out, so Hydration takes the full row on phones. Options: keep it full width; pair it with another half card. *Full width.*
29. **Today's focus.** The mockup has a chevron on this card, but there's no "focus" screen to open, so it has none: Steps opens the steps sheet, Protein opens Nutrition, and Sleep is a reminder only (sleep isn't tracked). The step aim is the app's step goal (10k), not the mockup's 8k. *As described.*
30. **Next milestone copy.** The mockup says "Keep your 3-day streak" for a 1-day streak. The card says "Keep your N-day streak" (N = the next milestone), or "Start a 3-day streak" with no streak. *As described.*
31. **Water goal and units.** The goal is about 33 ml per kg of body weight, rounded to half a litre and kept within 2–4 L (3 L without a weight). Water is in litres for imperial users too. Options: let the user set the goal; show fl oz for imperial. *Not built yet.*
