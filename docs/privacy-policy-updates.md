# Website updates needed before release (stokeform.com)

The privacy policy at <https://stokeform.com/privacy> (last updated 19 October 2026) matches the app on everything except three things that have since changed: push notifications, deleting your account in the app, and water logging. Below is the wording to add. Change the policy's "Last updated" date when you publish.

## 1. Privacy policy: push notifications (new; Firebase is not mentioned yet)

Add this to "Data collected and storage":

> **Notification token (if you turn on reminders while signed in).** To send you notifications such as a test notification, your phone gets a notification token from Google's Firebase Cloud Messaging. We store this token, with the type of phone (Android or iOS), on our server, linked to your account, until you sign out, turn reminders off, or delete your account. Notifications never contain your health or body numbers.

Add this to "Third parties":

> **Google Firebase Cloud Messaging:** delivers notifications to your phone (if you turn on reminders while signed in).

Add a line on reminders (they are scheduled on the phone):

> **Reminders** you turn on are scheduled on your phone and are not sent to us. A short history of the notifications your phone has shown is kept on your phone for 30 days.

## 2. Privacy policy: deleting your account (now in the app)

Replace the account-deletion part of "Rights and account deletion" with:

> **Deleting your account.** In the app, go to You › Settings › Privacy and account › Delete account, and confirm. This deletes your account and everything we hold for it on our server straight away: your name, email, sign-in, sessions, linked Google sign-in and notification tokens. It also erases the fitness data the app keeps on your phone. Copies in our database backups expire within 30 days. If you can't use the app, email support@stokeform.com from the address on the account and we will delete it within 30 days.

## 3. Privacy policy: fitness and health data (cloud backup is new; the policy says it is never uploaded)

The policy currently says fitness data "is stored only on your phone and is not uploaded or synced", and it promises to update the document before sync is added. Sync now exists as an opt-in, so replace that paragraph:

> **Fitness and health data** (date of birth, sex, height, weight, goals, your plan, workouts, food logs, water intake, body measurements, InBody records, check-ins, and your profile name and photo).
>
> - **On your phone** this data is stored encrypted (AES-256). The key is kept in your phone's secure hardware-backed storage and never leaves the phone.
> - **Cloud backup (optional, off until you turn it on).** In Settings › Cloud backup you can choose to copy this data to our server, so you can restore it on a new phone and keep it in step across your phones. It is encrypted on our server (AES-256) before it is stored, and it is linked to your account. We use it only to back up and sync your data for you, never for anything else. You can turn backup off at any time, which deletes the copy on our server immediately. Deleting your account deletes it too. Copies in database backups expire within 30 days.
> - If backup is off, this data stays on your phone and is not uploaded.

Also add to "Data collected and storage":

> **Age check.** If cloud backup is on, our server reads the date of birth in your profile to make sure you are 18 or over, and refuses to keep the data of anyone younger.

## 3b. Privacy policy: crash and error reports (new: Sentry)

Add this to "Data collected and storage":

> **Crash and error reports.** When the app or our server hits an error, a report is sent to Sentry, our error-monitoring provider. It contains what went wrong (the error, where in the code, the app version, the type of phone and its operating system, and the screen it happened on). It does not contain your name, email, account, IP address or any of your fitness or health data. Reports are kept for up to 90 days (set by our Sentry plan).

Add to "Third parties":

> **Sentry (Functional Software, Inc.):** crash and error reports, without personal data.

## 3c. Privacy policy: exercise photos

Remove the jsDelivr line from "Data collected" and "Third parties". The app no longer loads exercise photos from jsDelivr: every exercise guide is now bundled inside the app.

## 4. A deletion page for Google Play (suggested: stokeform.com/delete-account)

Play asks for a web page where people can request account deletion without the app. Suggested content:

> # Delete your StokeForm account
>
> **In the app (fastest):** open StokeForm, go to **You › Settings › Privacy and account › Delete account**, type DELETE and confirm. Your account is deleted straight away.
>
> **Without the app:** email **support@stokeform.com** from the email address on your account, with the subject "Delete my account". We'll confirm it's you and delete the account within 30 days.
>
> **What is deleted:** your account (name, email, sign-in, linked Google sign-in), your sessions, your notification tokens and your cloud backup, if you turned it on. Your fitness data on the phone (profile, plan, workouts, food, water, weight, measurements, InBody records) is erased when you delete the account in the app; uninstalling the app also erases it from that phone.
>
> **What may be kept:** copies in our database backups, which expire within 30 days. Limited technical logs (request times and IP addresses), kept for a short time for security.

## 5. Later: billing

Before Pro goes on sale, add RevenueCat (subscription status) and Google Play Billing (payment) to "Third parties", and say what they receive.
