import type { CapacitorConfig } from "@capacitor/cli";

// The app loads the Integer ERP web app from the server (same screens, same sign-in), so a web release
// reaches the app without reinstalling it. Only the native shell and the SiteTracker plugin
// (background location while checked in) live in this project.
//
// ERP_APP_URL is read when you run `cap sync` (it is copied into the APK):
//   production:            https://erp.integertel.com   (example; use the real hosted URL)
//   emulator + Docker:     http://localhost:8080        (after `adb reverse tcp:8080 tcp:8080`)
//   phone on office Wi-Fi: http://<your PC's IP>:8080
const url = process.env["ERP_APP_URL"] ?? "http://localhost:8080";

const config: CapacitorConfig = {
  appId: "com.integertel.erp",
  appName: "Integer ERP",
  webDir: "www",
  server: {
    url,
    cleartext: url.startsWith("http://"),
    // Shown if the server can't be reached (no signal, server down).
    errorPath: "offline.html",
  },
  android: {
    // Debug builds can be inspected from desktop Chrome (chrome://inspect).
    webContentsDebuggingEnabled: process.env["NODE_ENV"] !== "production",
  },
};

export default config;
