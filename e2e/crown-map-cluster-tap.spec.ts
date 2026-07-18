import { test, expect, type Route } from "@playwright/test";
import { installHermeticAuthMock, seedHermeticSession } from "./helpers/hermeticAuthMock";

/**
 * Crown Map cluster-tap E2E — verifies the locked launch rule that a cluster
 * of crowned posts (a) collapses to a single primary marker with a "+N"
 * badge, (b) opens the PRIMARY post's /post/:id on tap (highest crown_score
 * in the bucket), and (c) expands/splits on the next zoom.
 *
 * The test mocks the crowns REST payload and the post-existence check so it
 * does not depend on real seed data, and stubs the mapbox token endpoint
 * so the map can boot without hitting production edge functions. If the
 * environment cannot render Mapbox tiles (e.g. offline CI without the
 * MAPBOX_TOKEN secret), the visual cluster assertions will fail loudly
 * rather than silently pass.
 */

const HIGH_ID = "post-high-score-aaaaaaaaaaaa";
const LOW_ID = "post-low-score-bbbbbbbbbbbbbb";
const FAR_ID = "post-far-away-cccccccccccccc";

// Edmonton + Calgary are close enough to bucket together at the initial world
// zoom but split as the user zooms in. London remains a standalone marker.
// Distinct cities are intentional: public map rows snap posts to safe city
// centers rather than exposing exact post coordinates.
const CROWNED_POSTS = [
  {
    region_name: "Calgary",
    region_type: "city",
    user_id: "user-high",
    post_id: HIGH_ID,
    crown_score: 9999,
    category: "overall",
    profile: { username: "royal_calgary", profile_photo_url: null },
    post: {
      city: "Calgary",
      state: "Alberta",
      country: "Canada",
      location_enabled: true,
      location_source: "current_location",
      post_lat: 53.5461,
      post_lng: -113.4938,
      post_location_precision: "exact",
      image_url: null,
      caption: "top",
    },
  },
  {
    region_name: "Edmonton",
    region_type: "city",
    user_id: "user-low",
    post_id: LOW_ID,
    crown_score: 100,
    category: "overall",
    profile: { username: "second_edmonton", profile_photo_url: null },
    post: {
      city: "Edmonton",
      state: "Alberta",
      country: "Canada",
      location_enabled: true,
      location_source: "current_location",
      post_lat: 51.0447,
      post_lng: -114.0719,
      post_location_precision: "exact",
      image_url: null,
      caption: "second",
    },
  },
  {
    region_name: "London",
    region_type: "city",
    user_id: "user-far",
    post_id: FAR_ID,
    crown_score: 500,
    category: "overall",
    profile: { username: "london_holder", profile_photo_url: null },
    post: {
      city: "London",
      state: "England",
      country: "United Kingdom",
      location_enabled: true,
      location_source: "current_location",
      post_lat: 51.5072,
      post_lng: -0.1276,
      post_location_precision: "exact",
      image_url: null,
      caption: "solo",
    },
  },
];

async function stubCrownMapBackend(page: import("@playwright/test").Page) {
  await seedHermeticSession(page);
  await installHermeticAuthMock(page);
  await page.route("**/rest/v1/crowns**", (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-range": "0-2/3" },
      body: JSON.stringify(CROWNED_POSTS),
    });
  });
  // Post existence check the primary marker click runs before navigating.
  await page.route(/\/rest\/v1\/posts\?.*id=eq\./, (route: Route) => {
    const url = route.request().url();
    const match = url.match(/id=eq\.([^&]+)/);
    const id = match ? decodeURIComponent(match[1]) : "";
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(id ? [{ id }] : []),
    });
  });
  // Keep this regression hermetic: a minimal valid style lets Mapbox finish
  // booting without real tiles, telemetry, network access, or token refreshes.
  await page.route("https://api.mapbox.com/**", (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ version: 8, name: "Hermetic CrownMe map", sources: {}, layers: [] }),
    });
  });
  await page.route("https://events.mapbox.com/**", (route: Route) => {
    route.fulfill({ status: 204, body: "" });
  });
}

test.describe("Crown Map — cluster tap expands + opens correct /post/:id", () => {
  test("F. Cluster badge renders and primary tap opens the highest-score post", async ({ page }) => {
    await stubCrownMapBackend(page);
    await page.goto("/map?view=map&scope=city&category=overall");

    // Give the map + markers time to render; then look for the +N badge that
    // the client-side clusterer attaches to the primary marker.
    const badge = page.locator("[data-cluster-badge]").first();
    await expect(badge).toBeVisible({ timeout: 15000 });
    await expect(badge).toContainText("+1");
    // Badge itself must be inert so the tap resolves to the primary marker.
    await expect(badge).toHaveCSS("pointer-events", "none");

    // The primary marker is the badge's parent button; tapping it must open
    // the HIGH-score post's detail page (not the low-score sibling).
    const primary = page.locator("button:has([data-cluster-badge])").first();
    await primary.click();
    await page.waitForURL(new RegExp(`/post/${HIGH_ID}$`), { timeout: 5000 });
  });

  test("G. Zooming in splits the cluster and the +N badge disappears", async ({ page }) => {
    await stubCrownMapBackend(page);
    await page.goto("/map?view=map&scope=city&category=overall");

    const badge = page.locator("[data-cluster-badge]").first();
    await expect(badge).toBeVisible({ timeout: 15000 });

    // Mapbox NavigationControl exposes a "Zoom in" button by default.
    const zoomIn = page.getByRole("button", { name: /Zoom in/i });
    // Four zoom levels separate the Edmonton/Calgary city-center pins into
    // distinct 44px buckets.
    for (let i = 0; i < 4; i += 1) {
      await zoomIn.click();
      await page.waitForTimeout(350);
    }

    // After zoomend re-runs the cluster pass, no bucket has extras → no badge.
    await expect(page.locator("[data-cluster-badge]")).toHaveCount(0, { timeout: 5000 });
  });

  test("H. Far-away crowned post is never absorbed into another city's cluster", async ({ page }) => {
    await stubCrownMapBackend(page);
    await page.goto("/map?view=map&scope=city&category=overall");

    // Wait for the Edmonton cluster to appear so we know markers rendered.
    await expect(page.locator("[data-cluster-badge]").first()).toBeVisible({ timeout: 15000 });
    // Exactly one cluster badge — London stays standalone.
    await expect(page.locator("[data-cluster-badge]")).toHaveCount(1);
  });
});
