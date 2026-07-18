import { defineConfig, devices } from "@playwright/test";

const browserStackEnabled = process.env.BROWSERSTACK_ENABLED === "true";

/**
 * Visual regression config for share-card screenshots.
 *
 * Threshold strategy (NOT exact zero-diff):
 *   - `threshold: 0.2`           — per-pixel YIQ tolerance (font hinting, AA).
 *   - `maxDiffPixelRatio: 0.02`  — up to 2% of pixels may differ overall.
 *   - `animations: "disabled"`   — freezes Framer/CSS animations on capture.
 *
 * Update baselines after intentional UI changes:
 *   bunx playwright test --update-snapshots
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8080",
    trace: "on-first-retry",
  },

  expect: {
    toHaveScreenshot: {
      threshold: 0.2,
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
      scale: "css",
    },
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"] },
    },
    ...(browserStackEnabled
      ? [
          {
            // The BrowserStack SDK replaces this local profile with each
            // platform declared in browserstack.yml.
            name: "browserstack-production",
            use: { ...devices["Desktop Chrome"] },
          },
        ]
      : []),
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "bun run dev",
        url: "http://localhost:8080",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
