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
 * Release builds intentionally omit `server.url` so the signed native app
 * always ships and executes the locally built `dist/` bundle. Add a temporary
 * development-only server override outside this checked-in configuration when
 * device hot reload is needed.
 */
const config: CapacitorConfig = {
  appId: "com.crownmemedia.app",
  appName: "CrownMe",
  webDir: "dist",
  bundledWebRuntime: false,
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
