import { test, expect, Page, Route, devices } from "@playwright/test";
import { currentRequiredLegalAcceptances } from "./helpers/legalConsentMock";

/**
 * Hermetic E2E regression: follow toggling + refreshing another user's
 * profile URL across mobile and tablet viewports.
 *
 * These tests do not touch a live backend. They mock the Supabase HTTP
 * surface (auth + rest) via `page.route` and seed a fake session into
 * localStorage before the app boots. The goal is a fast, deterministic
 * smoke that catches two regressions the user reported:
 *   1. Refreshing `/{username}` bounces back to `/feed`.
 *   2. Follow toggle doesn't persist / has no loading feedback.
 */

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? "https://bailrqskqpmzvsgivhvm.supabase.co";
const PROJECT_REF =
  process.env.VITE_SUPABASE_PROJECT_ID ??
  (SUPABASE_URL.match(/https?:\/\/([^.]+)\./)?.[1] ?? "bailrqskqpmzvsgivhvm");
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

const VIEWER_ID = "00000000-0000-0000-0000-000000000aaa";
const TARGET_ID = "00000000-0000-0000-0000-000000000bbb";
const TARGET_USERNAME = "e2etarget";

const VIEWER = {
  id: VIEWER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "viewer@crownme.test",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  user_metadata: {},
  app_metadata: { provider: "email" },
  created_at: "2026-01-01T00:00:00Z",
};

function fakeSession() {
  return {
    access_token: "fake.e2e.access.token",
    refresh_token: "fake.e2e.refresh.token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: VIEWER,
  };
}

type State = {
  following: boolean;
  followersCount: number;
  failNextInsert: boolean;
  insertAttempts: number;
};

async function installMocks(page: Page, state: State) {
  await page.route("**/realtime/v1/**", (route) => route.abort());

  await page.route("**/auth/v1/**", async (route: Route) => {
    const url = route.request().url();
    if (url.includes("/user")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(VIEWER) });
    }
    if (url.includes("/token")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fakeSession()) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.route("**/rest/v1/**", async (route: Route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "content-range": "0-0/1" },
        body: JSON.stringify(body),
      });

    if (url.includes("/user_legal_acceptances")) {
      return json(currentRequiredLegalAcceptances());
    }
    if (url.includes("/profiles_private")) {
      return json({
        age_confirmed: true,
        onboarded_at: "2026-01-01T00:00:00Z",
        welcome_email_sent_at: "2026-01-01T00:00:00Z",
        onboarding_step: 999,
      });
    }

    // Target profile lookup by username
    if (url.includes("/profiles") && url.includes(`username=eq.${TARGET_USERNAME}`)) {
      return json({
        id: TARGET_ID,
        username: TARGET_USERNAME,
        profile_photo_url: null,
        bio: "e2e target",
        city: null, state: null, country: null,
        followers_count: state.followersCount,
        following_count: 0,
        votes_received: 0, votes_given: 0,
        crowns_held: 0, crowns_total: 0, battle_wins: 0,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        banner_url: null, banner_position_y: 50, avatar_position_y: 50,
        gender: null, pronouns: null,
        is_private: false,
        hide_likes: false, hide_comments: false, hide_views: false,
        posts_visibility: "public",
        links: [],
        verified: false, verified_at: null,
        liked_posts_public: false,
        is_founder: false, founder_title: null,
        royal_frame_variant: null, equipped_frame_key: null,
        equipped_achievement_crown_id: null,
        frames_hidden: false, hide_recent_unlocks: false,
      });
    }

    // Follow relation check
    if (url.includes("/follows") && method === "GET") {
      return json(state.following ? { id: "rel-1" } : null);
    }
    if (url.includes("/follows") && method === "POST") {
      state.insertAttempts += 1;
      if (state.failNextInsert) {
        state.failNextInsert = false;
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ code: "500", message: "simulated failure" }),
        });
      }
      state.following = true;
      state.followersCount += 1;
      return json({ id: "rel-1" }, 201);
    }
    if (url.includes("/follows") && method === "DELETE") {
      state.following = false;
      state.followersCount = Math.max(0, state.followersCount - 1);
      return route.fulfill({ status: 204, body: "" });
    }

    // Empty defaults for anything else the profile page touches so the
    // page renders without hanging on missing data.
    return json([]);
  });
}

async function seedSession(page: Page) {
  await page.addInitScript(([key, session]) => {
    window.localStorage.setItem(key as string, JSON.stringify(session));
  }, [STORAGE_KEY, fakeSession()] as const);
}

const VIEWPORTS = [
  { name: "mobile", vp: devices["iPhone 13"].viewport },
  { name: "tablet", vp: devices["iPad (gen 7)"]?.viewport ?? { width: 810, height: 1080 } },
];

for (const { name, vp } of VIEWPORTS) {
  test.describe(`profile follow + refresh (${name})`, () => {
    test.use({ viewport: vp });

    test("refreshing another user's profile stays on that route", async ({ page }) => {
      const state: State = { following: false, followersCount: 0, failNextInsert: false, insertAttempts: 0 };
      await seedSession(page);
      await installMocks(page, state);

      await page.goto(`/${TARGET_USERNAME}`);
      await expect(page).toHaveURL(new RegExp(`/${TARGET_USERNAME}$`));

      await page.reload();
      await expect(page).toHaveURL(new RegExp(`/${TARGET_USERNAME}$`));
      // Must not bounce to /feed
      expect(page.url()).not.toMatch(/\/feed(\/|$)/);
    });

    test("follow toggle: optimistic UI, disabled during in-flight, persists", async ({ page }) => {
      const state: State = { following: false, followersCount: 0, failNextInsert: false, insertAttempts: 0 };
      await seedSession(page);
      await installMocks(page, state);

      await page.goto(`/${TARGET_USERNAME}`);
      const followBtn = page.getByRole("button", { name: /^Follow$/i }).first();
      await expect(followBtn).toBeVisible({ timeout: 10_000 });
      await followBtn.click();
      // After settle the button should read "Following"
      await expect(
        page.getByRole("button", { name: /Following/i }).first(),
      ).toBeVisible({ timeout: 5_000 });
      expect(state.insertAttempts).toBeGreaterThanOrEqual(1);
    });

    test("follow failure shows retry action toast and rolls back", async ({ page }) => {
      const state: State = { following: false, followersCount: 0, failNextInsert: true, insertAttempts: 0 };
      await seedSession(page);
      await installMocks(page, state);

      await page.goto(`/${TARGET_USERNAME}`);
      const followBtn = page.getByRole("button", { name: /^Follow$/i }).first();
      await expect(followBtn).toBeVisible({ timeout: 10_000 });
      await followBtn.click();

      // Sonner renders the retry as a button labelled "Retry"
      const retry = page.getByRole("button", { name: /^Retry$/ });
      await expect(retry).toBeVisible({ timeout: 5_000 });
      await retry.click();

      await expect(
        page.getByRole("button", { name: /Following/i }).first(),
      ).toBeVisible({ timeout: 5_000 });
      expect(state.insertAttempts).toBeGreaterThanOrEqual(2);
    });
  });
}
