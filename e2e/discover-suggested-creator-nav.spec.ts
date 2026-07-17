import { test, expect, Page, Route } from "@playwright/test";
import { currentRequiredLegalAcceptances } from "./helpers/legalConsentMock";

/**
 * Discover → Suggested Creators → Profile navigation.
 *
 * Regression guard for the 404 the user hit when tapping a Suggested Creator
 * card. Verifies:
 *   1. The card link points at the canonical `/:username` route.
 *   2. Legacy `/profile/:username` URLs still resolve (redirect) to the same
 *      profile — no 404 fallback.
 */

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? "https://bailrqskqpmzvsgivhvm.supabase.co";
const PROJECT_REF =
  process.env.VITE_SUPABASE_PROJECT_ID ??
  (SUPABASE_URL.match(/https?:\/\/([^.]+)\./)?.[1] ?? "bailrqskqpmzvsgivhvm");
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

const VIEWER_ID = "00000000-0000-0000-0000-000000000aaa";
const TARGET_ID = "00000000-0000-0000-0000-000000000ccc";
const TARGET_USERNAME = "e2ediscover";

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

const TARGET_PROFILE = {
  id: TARGET_ID,
  username: TARGET_USERNAME,
  profile_photo_url: null,
  bio: "suggested creator",
  city: null, state: null, country: null,
  followers_count: 0, following_count: 0,
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
};

async function installMocks(page: Page) {
  await page.route("**/realtime/v1/**", (r) => r.abort());

  await page.route("**/auth/v1/**", async (route: Route) => {
    const url = route.request().url();
    if (url.includes("/user")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(VIEWER) });
    if (url.includes("/token")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fakeSession()) });
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.route("**/rest/v1/**", async (route: Route) => {
    const req = route.request();
    const url = req.url();
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

    if (url.includes("/profiles") && url.includes(`username=eq.${TARGET_USERNAME}`)) {
      return json(TARGET_PROFILE);
    }
    // Suggested creators list on Discover — return our target so it renders a card.
    if (url.includes("/profiles") && (url.includes("suggested") || url.includes("order=votes_received") || url.includes("order=crown_score"))) {
      return json([{ ...TARGET_PROFILE, crown_score: 100 }]);
    }
    if (url.includes("/profiles")) {
      return json([{ ...TARGET_PROFILE, crown_score: 100 }]);
    }
    return json([]);
  });

  await page.route("**/rpc/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
}

async function seedSession(page: Page) {
  await page.addInitScript(([key, session]) => {
    window.localStorage.setItem(key as string, JSON.stringify(session));
  }, [STORAGE_KEY, fakeSession()] as const);
}

test.describe("Discover → suggested creator profile navigation", () => {
  test("legacy /profile/:username redirects to /:username and renders profile (no 404)", async ({ page }) => {
    await seedSession(page);
    await installMocks(page);

    await page.goto(`/profile/${TARGET_USERNAME}`);

    // Client-side redirect fallback must move to canonical URL.
    await expect(page).toHaveURL(new RegExp(`/${TARGET_USERNAME}$`), { timeout: 10_000 });

    // 404 page should NOT be shown.
    await expect(page.getByTestId("not-found")).toHaveCount(0);
    // Profile username surfaces somewhere in the page.
    await expect(page.getByText(new RegExp(`@?${TARGET_USERNAME}`, "i")).first()).toBeVisible({ timeout: 10_000 });
  });

  test("suggested creator card links to canonical /:username and profile loads", async ({ page }) => {
    await seedSession(page);
    await installMocks(page);

    await page.goto("/discover");

    // Find any link pointing at our target username. The suggested creator
    // card renders a <Link to={`/${username}`}> — must not use /profile/.
    const card = page.locator(`a[href="/${TARGET_USERNAME}"]`).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    // Sanity: no legacy /profile/ links should exist for this user.
    await expect(page.locator(`a[href="/profile/${TARGET_USERNAME}"]`)).toHaveCount(0);

    await card.click();

    await expect(page).toHaveURL(new RegExp(`/${TARGET_USERNAME}$`), { timeout: 10_000 });
    await expect(page.getByTestId("not-found")).toHaveCount(0);
  });
});
