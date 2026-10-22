# Releasing on Google Play (Android)

What exists in the repo:
- release signing that reads `android/keystore.properties` (never committed)
- shrinking turned on for release builds (R8 plus unused resources)
- `npm run android:release`, which builds a signed `.aab` for Play
- `npm run android:release:apk`, which also builds a signed APK to try on a phone first

A test build with a throwaway key worked: the bundle was about 34 MB, against 44 MB for the debug APK.

## 1. Create the upload key (once)

Play App Signing holds the real app-signing key. You sign uploads with an *upload key* that you keep. If you lose it, Play can reset it, but that takes days, so back it up (a password manager plus an offline copy).

```powershell
& "$env:USERPROFILE\scoop\apps\temurin21-jdk\current\bin\keytool.exe" -genkeypair -v `
  -keystore "$env:USERPROFILE\keys\stokeform-upload.jks" -alias stokeform-upload `
  -keyalg RSA -keysize 4096 -validity 10000
```

Keep the key outside the repo. Then create `android/keystore.properties`. It is git-ignored, like `*.jks`:

```properties
storeFile=C:/Users/<you>/keys/stokeform-upload.jks
storePassword=<the store password>
keyAlias=stokeform-upload
keyPassword=<the key password>
```

## 2. Before every upload

1. Set the version in `android/app/build.gradle`:
   - `versionCode`: add 1 every upload, because Play refuses a code it has already seen.
   - `versionName`: what users see, for example `1.0.0`.
2. For the public release only, set `privateTesting.enabled` to `false` in `src/environments/environment.prod.ts`. Otherwise the tester promo code unlocks Pro for anyone.
3. Make sure the server is deployed with the matching code (see `server/CLOUD_RUN.md`). The app calls the server for accounts, account deletion, push notifications and InBody reading.
4. Run `npm test`, `npm run lint` and `npm run server:test`.
5. Run `npm run android:release`. The output is `android/app/build/outputs/bundle/release/app-release.aab`.

Try the release on a phone first with `npm run android:release:apk`, then install `android/app/build/outputs/apk/release/app-release.apk`. Its signature differs from the debug build, so installing it means uninstalling the debug app first, which erases that phone's app data. Use a spare phone, or the Play internal testing track instead.

## 3. Play Console (first time)

1. **Create the app.**
   - Name: StokeForm
   - Default language: English
   - It's an app, it's free (Pro comes later, through RevenueCat)
   - Package: `com.stokeformfitness.app`
2. **Play App Signing:** accept the default (Google manages the app-signing key) and upload the first `.aab`.
3. **Internal testing track:**
   - Add testers by email.
   - Upload the bundle.
   - Install from the opt-in link. This is also where Play purchases can be tested later.
4. **App content** (the declarations; answers below):
   - Privacy policy URL: `https://stokeform.com/privacy`
   - Ads: none
   - Target audience: 18 and over (the app enforces 18+)
   - Content rating: complete the questionnaire (a fitness tool, no user-generated content shared with others)
   - Data safety: see below
   - Account deletion URL: see below
   - Health apps declaration: fitness tracking, not a medical device
   - Government, financial and news apps: not applicable
5. **Store listing.**
   - Category: Health & Fitness
   - Contact email: `support@stokeform.com`
   - Website: `https://stokeform.com`
   - App icon: 512×512 (`npm run brand:assets` makes the brand set)
   - Feature graphic: 1024×500
   - 2–8 phone screenshots
   - Short description (80 characters) and full description

## 4. Account deletion (Play requirement)

**In the app:** You › Settings › Privacy and account › **Delete account**. Typing DELETE does the following:
- The server deletes the account: sign-in, name and email, sessions, linked Google sign-in, push notification registrations, and anything stored for it, all in one statement (`server/src/account/account-routes.ts`).
- The app then erases its data on the phone and starts again at setup.
- Signed out, the same screen erases the phone's data only.

**On the web:** Play also asks for a page where someone can ask for deletion without the app. `stokeform.com/contact` already says to email support from the account's address. A dedicated page is clearer: suggested wording is in `docs/privacy-policy-updates.md`. Give its URL, for example `https://stokeform.com/delete-account`, in the Data safety form.

## 5. Data safety form (suggested answers)

These follow what the app actually does today. If sync, billing or crash reporting is added, update this and the privacy policy.

| Data type (Play's name) | Collected? | Shared? | Notes for the form |
| --- | --- | --- | --- |
| Personal info › Name | Yes | No | Account. Required for an account. |
| Personal info › Email address | Yes | No | Account and account emails (Resend sends them for StokeForm, as a service provider). |
| Photos | Yes, processed ephemerally | No | Optional InBody report photo. Sent to the server and OpenAI to read the values, then discarded. Neither stores it. OpenAI acts as a service provider. |
| Health and fitness › Health info, Fitness info | No | No | Stays on the phone and is never uploaded. The values read from an InBody photo are returned to the phone, not stored on the server. |
| App activity, App info and performance | No | No | No analytics and no crash reporting. |
| Device or other IDs | Yes | No | The Firebase push token, for notifications. It is stored with the account and deleted with it. |

For the whole app:
- Data is encrypted in transit: yes.
- Users can request deletion: yes (in the app and on the website).
- No data is sold, and none is used for advertising.

## 6. Later

- **Billing.** Set up RevenueCat with the Play products, then:
  - put the public key in `src/environments/billing.ts`
  - add RevenueCat to the privacy policy
  - test purchases on the internal track
- **Smaller download.** The exercise guide images (`src/assets/exercise-art`, about 13 MB) are the largest part of the app and could be compressed further.
