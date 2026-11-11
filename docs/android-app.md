# Integer ERP Android app (field engineers)

The Android app is the normal Integer ERP web app inside a native shell (Capacitor 6), plus one native
feature the browser can't do: **sharing the field engineer's location in the background while they are
checked in to a site**. Everything else (sign-in, screens, rules) comes from the web app, so a web release
reaches the app without reinstalling it.

```
apps/mobile/
  capacitor.config.ts        app id com.integertel.erp, which server the app opens (ERP_APP_URL)
  www/offline.html           shown when the server can't be reached
  android/                   generated Android project (Capacitor) + our code:
    app/src/main/java/com/integertel/erp/
      MainActivity.java      registers the SiteTracker plugin
      tracker/SiteTrackerPlugin.java   bridge the web app calls (apps/web/src/lib/tracker.ts)
      tracker/SiteTrackerService.java  foreground service: one reading per interval, notification
      tracker/PointStore.java          readings buffered on the phone until uploaded
      tracker/TrackerState.java        current visit + interval
```

## How check-in and location sharing work

1. The FE taps **Check in** on a site (FE home screen). The first time, they see what is shared and agree.
2. The app takes one accurate reading, the API records the visit and its distance from the site's
   **Map position** (set by the PM on the site's Overview → Edit), and flags check-ins more than 500 m away.
3. The app starts a **foreground service** with a permanent notification "Checked in · Integer ERP". It asks
   Android for **one location every 10 minutes** (`FE_LOCATION_INTERVAL_SECONDS`); GPS is off in between,
   so battery use stays small. This keeps working with the app in the background or the screen off.
4. Readings are stored on the phone first and uploaded when the app is awake and online, so no signal on
   site loses nothing (the API accepts late readings that fall inside the visit).
5. **Check out** takes a final reading, stops the service and the notification. Nothing is recorded outside
   a visit. A visit left open 14 hours is closed automatically and the FE and their manager are told.
6. Managers (Admin, Ops leader, PM, Associate PM, Delivery lead) see it on the site's **Check-ins** tab:
   who is on site now, every visit, time on site, distance from site, and the trail (opens in Google Maps).

Permissions: **"While using the app"** location is enough (the service is a visible foreground service), plus
notifications on Android 13+. No "Allow all the time" permission is needed.

In a normal phone browser the same screens work, but location is only shared while the page is open; the
screen tells the FE to install the app.

## Build it

One-time setup (already done on Niranjan's PC):
- Android SDK (Android Studio installs it) with platform 34 and build-tools 34.
- **JDK 17** (a full JDK, not IntelliJ's bundled runtime, which lacks `jlink`). E.g. Eclipse Temurin 17 in
  `%USERPROFILE%\.jdks\jdk-17...`.
- `apps/mobile/android/local.properties` containing `sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk`
  (git-ignored; Android Studio creates it automatically).

Build a debug APK (Git Bash, from the repo root):

```bash
cd apps/mobile
ERP_APP_URL=http://localhost:8080 pnpm exec cap sync android     # which server the app opens
cd android
JAVA_HOME="C:/Users/<you>/.jdks/jdk-17.0.21+9" ./gradlew.bat assembleDebug
# → apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

`ERP_APP_URL` is baked in at `cap sync`:

| Where the app should connect | ERP_APP_URL | Notes |
|---|---|---|
| Emulator → Docker test stack | `http://localhost:8080` (default) | run `adb reverse tcp:8080 tcp:8080` once per emulator start |
| Real phone on the office Wi-Fi → Docker | `http://<PC's IP>:8080` | PC firewall must allow port 8080 |
| Production | `https://<the hosted ERP URL>` | release builds only allow https |

Use the Docker stack (`pnpm docker:test:up`), not `pnpm dev`: the Vite dev server listens on IPv6 only and
serves hundreds of small files, which is very slow inside the app.

## Run it on the emulator

```bash
ADB="$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
"$LOCALAPPDATA/Android/Sdk/emulator/emulator.exe" -avd Pixel_3_API_28 &      # needs a Google Play image
"$ADB" install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
"$ADB" reverse tcp:8080 tcp:8080
"$ADB" emu geo fix -73.9855 40.7486        # fake GPS: longitude latitude
```

Sign in as an FE (e.g. `crew.tech2@example.test`; the code shows on screen in the test stack), tap Check in.
To see readings quickly, start Docker with a short interval: `FE_LOCATION_INTERVAL_SECONDS=30 pnpm docker:test:up`.
Debug builds can be inspected from desktop Chrome at `chrome://inspect`.

## Run it on a real phone

Enable Developer options → USB debugging, connect, then `adb install -r app-debug.apk`; or copy the APK to
the phone and open it (allow "install unknown apps"). Point it at a server the phone can reach (table above).

## Releasing (not done yet)

- Create a release signing key once and keep it safe (losing it means users must uninstall to update):
  `keytool -genkeypair -v -keystore integer-erp.jks -alias integer-erp -keyalg RSA -keysize 2048 -validity 10000`,
  then add a `signingConfigs.release` block in `android/app/build.gradle` reading the passwords from
  environment variables (never commit the keystore or passwords).
- `ERP_APP_URL=https://<prod> pnpm exec cap sync android` then `./gradlew.bat bundleRelease` → `.aab`.
- Distribute through **Google Play** (US$25 one-off developer account; Play asks you to declare the
  foreground-service location use and show a privacy notice) or **company device management** (Intune etc.),
  or as a signed APK for a small pilot.
- Bump `versionCode` / `versionName` in `android/app/build.gradle` for every release.

## Known limits

- If Android kills the app and later restarts the service from the background, Android 14 may refuse to
  restart a location service; sharing resumes the next time the FE opens the app (it checks the open visit).
- After a phone restart, sharing resumes when the FE opens the app.
- Some phone makers (Xiaomi, Oppo, Samsung "sleeping apps") stop background services aggressively; FEs may
  need to set battery usage to "Unrestricted" for Integer ERP.
- Indoor sites (IBS) often have weak GPS; readings then come from Wi-Fi / cell and show a larger "±" accuracy.
