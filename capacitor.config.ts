import type { CapacitorConfig } from "@capacitor/cli";

/**
 * CrownMe — Capacitor configuration
 *
 * This file scaffolds the native shell. The actual `ios/` and `android/`
 * folders are NOT generated inside the Lovable sandbox. To produce them
 * the project owner must:
 *   1. Export to GitHub from Lovable.
 *   2. `git pull` locally → `npm install`.
 *   3. `npx cap add android` and/or `npx cap add ios`.
 *   4. `npm run build && npx cap sync`.
 *   5. `npx cap run android` (Android Studio) or `npx cap run ios` (Xcode).
 *
 * Hot-reload from the Lovable preview is enabled via `server.url` below.
 * Comment out `server` before producing a release build that should ship the
 * locally built web bundle.
 */
const config: CapacitorConfig = {
  appId: "app.lovable.fcbd98f7a4524e42a0f9b92cfce5c620",
  appName: "CrownMe",
  webDir: "dist",
  bundledWebRuntime: false,
  server: {
    url: "https://fcbd98f7-a452-4e42-a0f9-b92cfce5c620.lovableproject.com?forceHideBadge=true",
    cleartext: true,
  },
  ios: {
    contentInset: "always",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#0b0612",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
