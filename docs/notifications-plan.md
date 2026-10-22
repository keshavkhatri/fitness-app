# Notifications plan

Status (updated 2026-10-22): **Phases 1 and 2 are built; Phase 3 is not started.**

- **Phase 1, local reminders: built.** The pure planner is `domain/reminders/reminder-plan.ts`. It covers:
  - training days
  - a workout left open (2 h after the last set)
  - a streak at risk (3+ days)
  - the weekly weigh-in (only when the last one is a week old)
  - meals
  - the recovery check-in

  It also applies quiet hours and a daily cap. On the device side:
  - `features/reminders/reminder-device.ts` uses Capacitor Local Notifications on Android, on a private-visibility channel.
  - `ReminderService` re-plans the next 7 days on every app open or resume and replaces what it scheduled before.
  - Tapping a reminder opens its screen.
- **Phase 2, settings: built.** The screen is at Settings › Notifications › Reminders (`/you/settings/notifications`). It has:
  - a master switch (asks for the Android permission)
  - a switch and time for each reminder
  - the weigh-in day
  - quiet hours and the daily limit
  - a "Coming up" preview

  The web build shows "Reminders work in the StokeForm app on your phone".
- **Phase 3, push: the plumbing is built; nothing is sent automatically yet.**
  - **Firebase:** the project is `fitness-app-511714`. The Android app is `com.stokeformfitness.app`, and `android/app/google-services.json` is gitignored.
  - **Server credentials:** Cloud Run sends as its own service account, which has the role `roles/firebasecloudmessaging.admin`, so there is no key file. Without `K_SERVICE` or `FIREBASE_PROJECT_ID` (local runs), it sends nothing.
  - **Server:**
    - migration `0008_push_devices.sql` stores one row per device token, owned by the account
    - `POST /v1/push/devices` registers a device and `POST /v1/push/devices/remove` removes one
    - `POST /v1/push/test` pushes to the caller's own phones, at most every 30 s
    - `notifyUser(userId, message)` is ready for future server events; it deletes tokens that Firebase reports as unregistered
  - **App:** `PushService` registers the phone only while someone is signed in AND reminders are on with the permission granted. Sign-out removes the device using the ending session. A push that arrives while the app is open is shown as a local notification. Settings › Reminders › "Send a test notification" sends a test push.
  - **Not built yet:** the events themselves (subscription changes from RevenueCat, the weekly summary). They need billing and server-side data first.

Written 2026-10-22.

## Where we are today

- **In-app inbox only.** `features/notifications` builds short reminders from the user's own data every time the inbox is read (`buildNotifications`): resume a workout in progress, today's planned workout, the recovery check-in, food not logged yet, a weigh-in that is overdue. Read state is kept per device (`fitness.notifications-read`).
- Nothing is scheduled or pushed. A user only sees a reminder after opening the app and tapping the bell, so the reminders can't bring anyone back.
- No notification settings screen. The Settings screen lists it under "Coming soon".

## Goals

1. Bring people back at the right moment: training day, streak at risk, meal logging.
2. Never nag. Every kind can be switched off; quiet hours are respected; at most 2 a day by default.
3. Work offline and without an account wherever possible.
4. Keep health data out of push payloads.

## Phase 1: local (on-device) notifications (no server needed)

Use `@capacitor/local-notifications` (Android 13+ needs the `POST_NOTIFICATIONS` runtime permission; Android 12+ exact alarms need `SCHEDULE_EXACT_ALARM`, so use inexact scheduling).

| Kind | When | Text (example) | Tap opens |
| --- | --- | --- | --- |
| Training day | The user's chosen time (default 08:00) on a planned workout day, only if not trained yet | "Upper Body A is planned today: 50 min, 7 exercises" | Workout details for that day |
| Workout left open | 2 h after the last set of an unfinished workout | "Your workout is still open. Finish or keep going?" | The active workout |
| Streak at risk | 20:00 when nothing was recorded today and the streak is 3+ days | "Your 12-day streak ends at midnight. Log anything to keep it." | Streak page |
| Log your meals | Optional, 13:00 / 20:00 if no food logged | "Nothing logged for lunch yet" | Add food |
| Weigh-in | Weekly on the user's chosen day, if no weigh-in for 7 days | "Time for your weekly weigh-in" | Add weight |
| Recovery check-in | Optional morning, if not done | "How did you sleep?" | Recovery sheet |
| Milestone (in the moment) | When a streak milestone (7, 14, 30 …) or a personal best is reached | "7-day streak! 🔥" | Streak page / exercise |

How it works:

- A `NotificationScheduler` service rebuilds the schedule for the next 7 days whenever the plan, the day's records or the settings change, and when the app starts or resumes. It cancels and re-adds by a stable id per kind and day (`training:2026-10-23`), so nothing is duplicated.
- Because data can change while the app is closed (a workout finished on another device later), every scheduled notification is conditional: on delivery we can't re-check, so the conditions are evaluated at scheduling time and the schedule is refreshed on each app resume. Missed or no-longer-relevant ones are simply cancelled then.
- Deep links: each notification carries an action (`open-session`, `resume`, `streak`, `log-food`, `log-weight`, `recovery`). The existing `NotificationAction` type and `notification-actions.ts` already map these to routes, so reuse them.
- The in-app inbox stays as the history of what was sent.

## Phase 2: settings

A "Notifications" section in Settings:

- A master switch, and one switch per kind above.
- Reminder time for training days, the weigh-in day, meal reminder times.
- Quiet hours (default 22:00–07:00). Nothing is delivered inside them.
- Daily cap (default 2) with priority: workout left open > training day > streak at risk > others.
- The system permission state, with a button to open Android's settings when it was denied.

Stored like other preferences (`KeyValueStorage`, then `user_preferences` on the server once sync exists).

## Phase 3: push (server-sent), with accounts

Only for things the device can't know by itself:

- Account and security: "a new sign-in", email changed. Already sent by email; push is optional.
- Subscription status: renewal failed, Pro ending (from RevenueCat webhooks once billing is live).
- Coach-style weekly summary prepared on the server (once data syncs).

How:

- Firebase Cloud Messaging via `@capacitor/push-notifications`. The FCM token is stored per device in a new `stokeform.push_devices` table (user_id, token, platform, created_at, last_seen_at).
- Sending from Cloud Run with the FCM HTTP v1 API (a service account in Secret Manager).
- Payloads carry only a type and an id ("weekly-summary-ready"); the app fetches the content after opening. No health values in pushes, because they pass through Google's servers and show on the lock screen.

## Privacy and store requirements

- Ask for permission in context (after the first workout, or when the user switches a reminder on), never on first launch.
- Lock-screen text never shows health numbers (no weights or body fat); "Your weekly weigh-in" rather than "You weighed 94.5 kg".
- Play policy: declare notifications in the data safety form (if push tokens are stored); describe them in the privacy policy.

## Work breakdown (estimate)

1. Phase 1: scheduler service, the 5 core kinds, deep links, tests: about 3–4 days.
2. Phase 2: settings screen, quiet hours, cap: about 2 days.
3. Phase 3: FCM setup, token table and migration, server sender, payload contract: about 3–4 days, after accounts and data sync.

## Open questions

- Default on or off for meal reminders? (Suggest off: they're the most likely to annoy.)
- Should a missed training day suggest moving the workout ("Do Upper Body A tomorrow instead?")? That needs plan rescheduling, which doesn't exist yet.
- iOS later: same plugins work; APNs key needed for push.
