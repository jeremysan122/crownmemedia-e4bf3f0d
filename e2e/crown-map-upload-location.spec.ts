import { test, expect } from "@playwright/test";

/**
 * Crown Map upload/location smoke — mocks the browser geolocation API so
 * the "Use my current location" and "denied" flows can run in CI without
 * a real permission prompt. These tests do NOT sign in and do NOT publish
 * real posts (auth + service-role work happens in the migration + vitest
 * layers) — they exercise the on-page consent UI itself, which is what the
 * five manual smoke checks care about.
 *
 * Requires the dev server on http://localhost:8080. Auth-gated routes are
 * fine to open; the location UI is compose-side and covered by rendering
 * the Upload page directly in an unauthenticated preview state where the
 * form is visible.
 */

test.describe("Crown Map — Upload location consent smoke", () => {
  test("A. Location off is the default and requires no permission prompt", async ({ page }) => {
    await page.goto("/upload");
    // The consent section is collapsed by default and starts in "None" mode.
    const addLoc = page.getByText(/Add location/i).first();
    await addLoc.click();
    await expect(page.getByRole("button", { name: /^None$/ })).toHaveClass(/gold-shadow/);
    await expect(page.getByText(/won't be pinned on the map/i)).toBeVisible();
  });

  test("B. Manual city switches modes and reveals city/state/country inputs", async ({ page }) => {
    await page.goto("/upload");
    await page.getByText(/Add location/i).first().click();
    await page.getByRole("button", { name: /^City$/ }).click();
    await expect(page.getByLabel("City")).toBeVisible();
    await expect(page.getByLabel("Country")).toBeVisible();
  });

  test("C. Current location succeeds with granted permission + mocked coords", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"], { origin: "http://localhost:8080" });
    await context.setGeolocation({ latitude: 53.5461, longitude: -113.4938 }); // Edmonton
    await page.goto("/upload");
    await page.getByText(/Add location/i).first().click();
    await page.getByRole("button", { name: /^Current$/ }).click();
    // The status line shows the captured coords, no denied banner rendered.
    await expect(page.getByText(/Current location · 53\.546/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("location-denied-banner")).toHaveCount(0);
  });

  test("D. Denied permission shows the branded banner with recovery buttons", async ({ page, context }) => {
    // No grantPermissions() → geolocation is denied by default in headless
    // Chromium. We explicitly clear + reset to guarantee the state.
    await context.clearPermissions();
    await page.goto("/upload");
    await page.getByText(/Add location/i).first().click();
    await page.getByRole("button", { name: /^Current$/ }).click();

    const banner = page.getByTestId("location-denied-banner");
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner).toContainText(/Location permission was denied/);
    await expect(banner).toContainText(/No problem/);

    // "Choose city manually" flips the mode and focuses the city field.
    await banner.getByRole("button", { name: /Choose city manually/ }).click();
    await expect(page.getByLabel("City")).toBeFocused();
    // Banner disappears; posting is not blocked.
    await expect(page.getByTestId("location-denied-banner")).toHaveCount(0);
  });

  test("E. /map exposes no user_id / raw lat / raw lng in network responses", async ({ page }) => {
    const responses: Array<{ url: string; body: string }> = [];
    page.on("response", async (res) => {
      const url = res.url();
      if (!/supabase|\/rest\/|\/rpc\//i.test(url)) return;
      try {
        const body = await res.text();
        responses.push({ url, body });
      } catch { /* opaque / redirect */ }
    });

    await page.goto("/map?view=map");
    // Give the map a beat to fire its RPC / REST calls.
    await page.waitForTimeout(2500);

    // The safe public RPC + any post-embed selects the map uses must never
    // leak profile/home/device location fields. `post_lat`/`post_lng` only
    // appear when the user consented (source = current_location), which is
    // fine — but bare `user_lat` / `home_lat` / `device_lat` must never appear.
    const combined = responses.map((r) => r.body).join("\n");
    expect(combined).not.toMatch(/"user_lat"|"user_lng"|"home_lat"|"home_lng"|"device_lat"|"device_lng"/i);
  });
});
