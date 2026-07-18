import type { Page, Route } from "@playwright/test";
import { currentRequiredLegalAcceptances } from "./legalConsentMock";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? "https://bailrqskqpmzvsgivhvm.supabase.co";
const PROJECT_REF =
  process.env.VITE_SUPABASE_PROJECT_ID ??
  (SUPABASE_URL.match(/https?:\/\/([^.]+)\./)?.[1] ?? "bailrqskqpmzvsgivhvm");
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

const USER_ID = "00000000-0000-0000-0000-000000000e2e";
const USER = {
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "hermetic-e2e@crownme.test",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  user_metadata: {},
  app_metadata: { provider: "email" },
  created_at: "2026-01-01T00:00:00Z",
};

function session() {
  return {
    access_token: "fake.e2e.access.token",
    refresh_token: "fake.e2e.refresh.token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: USER,
  };
}

const PROFILE = {
  id: USER_ID,
  username: "hermetic_e2e",
  email: USER.email,
  profile_photo_url: null,
  bio: null,
  city: null,
  state: null,
  country: null,
  followers_count: 0,
  following_count: 0,
  votes_received: 0,
  votes_given: 0,
  crowns_held: 0,
  crowns_total: 0,
  battle_wins: 0,
  is_suspended: false,
};

const MAIN_CATEGORIES = Array.from({ length: 12 }, (_, index) => ({
  id: `category-${index + 1}`,
  slug: `category-${index + 1}`,
  label: `Category ${index + 1}`,
  description: null,
  icon: null,
  gradient: "from-amber-400 to-yellow-600",
  sort_order: index + 1,
  is_active: true,
}));

const FEED_POSTS = Array.from({ length: 8 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  user_id: USER_ID,
  image_url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1080' height='1080'%3E%3Crect width='1080' height='1080' fill='%23201810'/%3E%3C/svg%3E",
  image_urls: null,
  caption: `Hermetic feed post ${index + 1}`,
  category: "overall",
  main_category_slug: MAIN_CATEGORIES[index % MAIN_CATEGORIES.length].slug,
  subcategory_slug: null,
  hashtags: [],
  city: "Test City",
  state: "Test State",
  country: "Test Country",
  crown_score: 100 - index,
  vote_count: 0,
  comment_count: 0,
  share_count: 0,
  repost_count: 0,
  battle_wins: 0,
  created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
  edited_at: null,
  pinned_at: null,
  scheduled_for: null,
  parent_post_id: null,
  repost_caption: null,
  tagged_user_ids: [],
  media_type: "image",
  video_url: null,
  video_poster_url: null,
  duration_ms: null,
  filter: null,
  alt_texts: ["Abstract test placeholder"],
  aspect_ratio: "1 / 1",
  is_sensitive: false,
  content_type: "post",
  is_removed: false,
  is_archived: false,
  profile: {
    username: PROFILE.username,
    profile_photo_url: null,
    crowns_held: 0,
    gender: null,
    hide_likes: false,
    hide_comments: false,
    hide_views: false,
    verified: false,
  },
}));

/**
 * Seed a synthetic authenticated session and accepted cookie/legal choices
 * before CrownMe boots. No request from this fixture reaches production.
 */
export async function seedHermeticSession(page: Page) {
  await page.addInitScript(
    ([key, fakeSession]) => {
      window.localStorage.setItem(key as string, JSON.stringify(fakeSession));
      window.localStorage.setItem("cm:cookie-consent:v1", "rejected");
    },
    [STORAGE_KEY, session()] as const,
  );
}

/**
 * Mock the minimum authenticated Supabase surface used by protected pages.
 * Call page-specific routes after this helper so they take precedence.
 */
export async function installHermeticAuthMock(page: Page) {
  await page.route("**/realtime/v1/**", (route) => route.abort());

  await page.route("**/auth/v1/**", async (route: Route) => {
    const url = route.request().url();
    if (url.includes("/user")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(USER),
      });
    }
    if (url.includes("/token")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(session()),
      });
    }
    if (url.includes("/logout")) return route.fulfill({ status: 204, body: "" });
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.route("**/rest/v1/**", async (route: Route) => {
    const url = route.request().url();
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "content-range": "0-0/1" },
        body: JSON.stringify(body),
      });

    if (url.includes("/rpc/get_my_profile")) return json(PROFILE);
    if (url.includes("/rpc/get_my_admin_roles")) return json([]);
    if (url.includes("/rpc/")) return json([]);
    if (url.includes("/profiles_private")) {
      return json({
        age_confirmed: true,
        onboarded_at: "2026-01-01T00:00:00Z",
        welcome_email_sent_at: "2026-01-01T00:00:00Z",
        onboarding_step: 999,
      });
    }
    if (url.includes("/user_legal_acceptances")) {
      return json(currentRequiredLegalAcceptances());
    }
    if (url.includes("/main_categories")) return json(MAIN_CATEGORIES);
    if (url.includes("/subcategories")) return json([]);
    if (url.includes("/posts")) return json(FEED_POSTS);
    if (url.includes("/profiles")) {
      const wantsObject = route.request().headers().accept?.includes("vnd.pgrst.object");
      return json(wantsObject ? PROFILE : [PROFILE]);
    }
    return json([]);
  });

  await page.route("**/functions/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  // Registered after the catch-all because Playwright evaluates matching
  // routes in reverse registration order.
  await page.route("**/functions/v1/get-mapbox-token", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: "pk.hermetic-e2e-mapbox-token" }),
    }),
  );
}
