<#
.SYNOPSIS
  Builds the Android debug APK (Windows). Installs nothing and never signs a release build.

.PARAMETER Api
  Local: the app talks to the API server on this computer (http://localhost:8787, environment.ts),
         reached from a USB-connected phone through `adb reverse tcp:8787 tcp:8787`.
  Cloud: the app talks to the deployed Cloud Run service (environment.prod.ts).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/android-debug.ps1 -Api Local
#>
param(
  [ValidateSet('Local', 'Cloud')]
  [string]$Api = 'Local'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Gradle needs a JDK and the Android SDK. Use the shell's settings, or the scoop installs this project was set up with.
if (-not $env:JAVA_HOME) {
  $jdk = Join-Path $env:USERPROFILE 'scoop\apps\temurin21-jdk\current'
  if (Test-Path $jdk) { $env:JAVA_HOME = $jdk } else { throw 'Set JAVA_HOME to a JDK 21 (see the README, Scripts).' }
}
if (-not $env:ANDROID_HOME) {
  $sdk = Join-Path $env:USERPROFILE 'scoop\apps\android-clt\current'
  if (Test-Path $sdk) { $env:ANDROID_HOME = $sdk } else { throw 'Set ANDROID_HOME to the Android SDK.' }
}

if ($Api -eq 'Local') {
  npx ng build --configuration development
} else {
  npx ng build
}
if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }

npx cap sync android
if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync failed.' }

Push-Location android
try {
  ./gradlew.bat assembleDebug
  if ($LASTEXITCODE -ne 0) { throw 'Gradle build failed.' }
} finally {
  Pop-Location
}

$apk = Join-Path $root 'android\app\build\outputs\apk\debug\app-debug.apk'
Write-Host ""
Write-Host "Debug APK ($Api API): $apk"
Write-Host "Install, keeping the app's data:  adb install -r `"$apk`""
if ($Api -eq 'Local') {
  Write-Host "Before opening the app:           adb reverse tcp:8787 tcp:8787   (with npm run server:start running)"
}
