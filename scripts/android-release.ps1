<#
.SYNOPSIS
  Builds the Play Store release (Windows): an Android App Bundle (.aab) signed with the upload key.

.DESCRIPTION
  Production web build (environment.prod.ts) -> Capacitor sync -> Gradle bundleRelease (shrunk, signed with the key
  in android/keystore.properties). The bundle is written to android/app/build/outputs/bundle/release/app-release.aab.
  Installs and uploads nothing. Set the version in android/app/build.gradle (versionCode, versionName) first.
  See docs/release-android.md.

.PARAMETER Apk
  Also build a signed release APK (to install on a phone with adb before uploading).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/android-release.ps1
#>
param(
  [switch]$Apk
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $env:JAVA_HOME) {
  $jdk = Join-Path $env:USERPROFILE 'scoop\apps\temurin21-jdk\current'
  if (Test-Path $jdk) { $env:JAVA_HOME = $jdk } else { throw 'Set JAVA_HOME to a JDK 21 (see the README, Scripts).' }
}
if (-not $env:ANDROID_HOME) {
  $sdk = Join-Path $env:USERPROFILE 'scoop\apps\android-clt\current'
  if (Test-Path $sdk) { $env:ANDROID_HOME = $sdk } else { throw 'Set ANDROID_HOME to the Android SDK.' }
}
if (-not (Test-Path (Join-Path $root 'android\keystore.properties'))) {
  throw 'android/keystore.properties is missing: create the upload key first (docs/release-android.md, step 1).'
}
if (-not (Test-Path (Join-Path $root 'android\app\google-services.json'))) {
  throw 'android/app/google-services.json is missing: push notifications would not work in this build.'
}

npx ng build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }

npx cap sync android
if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync failed.' }

Push-Location (Join-Path $root 'android')
try {
  $tasks = @('bundleRelease')
  if ($Apk) { $tasks += 'assembleRelease' }
  .\gradlew.bat @tasks
  if ($LASTEXITCODE -ne 0) { throw 'Gradle release build failed.' }
} finally {
  Pop-Location
}

Write-Host ''
Write-Host 'Release bundle: android/app/build/outputs/bundle/release/app-release.aab'
if ($Apk) { Write-Host 'Release APK:    android/app/build/outputs/apk/release/app-release.apk' }
