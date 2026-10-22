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

## 3. Privacy policy: the list of on-phone data

In "Fitness and health data", add **water intake** to the list of data kept only on your phone, for example "…food logs, water intake, body measurements…".

## 4. A deletion page for Google Play (suggested: stokeform.com/delete-account)

Play asks for a web page where people can request account deletion without the app. Suggested content:

> # Delete your StokeForm account
>
> **In the app (fastest):** open StokeForm, go to **You › Settings › Privacy and account › Delete account**, type DELETE and confirm. Your account is deleted straight away.
>
> **Without the app:** email **support@stokeform.com** from the email address on your account, with the subject "Delete my account". We'll confirm it's you and delete the account within 30 days.
>
> **What is deleted:** your account (name, email, sign-in, linked Google sign-in), your sessions and your notification tokens. Your fitness data (profile, plan, workouts, food, water, weight, measurements, InBody records) is only stored on your phone. Deleting the account in the app erases it, and so does uninstalling the app.
>
> **What may be kept:** copies in our database backups, which expire within 30 days. Limited technical logs (request times and IP addresses), kept for a short time for security.

## 5. Later: billing

Before Pro goes on sale, add RevenueCat (subscription status) and Google Play Billing (payment) to "Third parties", and say what they receive.
