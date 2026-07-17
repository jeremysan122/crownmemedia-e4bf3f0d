import { test, expect, Page, Route } from "@playwright/test";
import { currentRequiredLegalAcceptances } from "./helpers/legalConsentMock";

/**
 * Hermetic E2E tests for /rewards.
 *
 * These specs do NOT need a seeded test user — they mock the Supabase HTTP
 * surface (auth + rest + rpc) via `page.route` and seed a fake session into
 * localStorage before the app boots. That keeps the tests fast and lets
 * them assert behaviour that's hard to reproduce against real backends:
 * UTC rollover countdown ticking, focus-driven auto-refresh, and the
 * streak_reminder notification deep link.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://bailrqskqpmzvsgivhvm.supabase.co";
const PROJECT_REF =
  process.env.VITE_SUPABASE_PROJECT_ID ??
  (SUPABASE_URL.match(/https?:\/\/([^.]+)\./)?.[1] ?? "bailrqskqpmzvsgivhvm");
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

const FAKE_USER_ID = "00000000-0000-0000-0000-000000000aaa";
const FAKE_USER = {
  id: FAKE_USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "rewards-e2e@crownme.test",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  user_metadata: {},
  app_metadata: { provider: "email" },
  created_at: "2026-01-01T00:00:00Z",
};

/** A long-lived fake session that the Supabase JS client will accept. */
function fakeSession() {
  return {
    access_token: "fake.e2e.access.token",
    refresh_token: "fake.e2e.refresh.token",
    token_type: "bearer",
    expires_in: 3600,
    // 1 hour from now so the client doesn't immediately try to refresh.
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: FAKE_USER,
  };
}

type ClaimCounter = { count: number; nextStreak: number };

async function installSupabaseMocks(page: Page, claimCounter: ClaimCounter) {
  // Block realtime websockets entirely — we don't need them and they only
  // add flakiness against the mock backend.
  await page.route("**/realtime/v1/**", (route) => route.abort());

  // Auth endpoints
  await page.route("**/auth/v1/**", async (route: Route) => {
    const url = route.request().url();
    if (url.includes("/user")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FAKE_USER) });
    }
    if (url.includes("/token")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fakeSession()) });
    }
    if (url.includes("/logout")) {
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  // REST + RPC endpoints
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

    // RPCs
    if (url.includes("/rpc/get_my_profile")) {
      return json({
        id: FAKE_USER_ID,
        username: "rewards_e2e",
        email: FAKE_USER.email,
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
      });
    }
    if (url.includes("/rpc/claim_daily_reward")) {
      claimCounter.count += 1;
      claimCounter.nextStreak += 1;
      // Hold the in-flight response briefly so the test can assert
      // the button is disabled / aria-busy while the mutation runs.
      await new Promise((r) => setTimeout(r, 400));
      return json({
        ok: true,
        shekels_awarded: 10,
        bonus: 0,
        current_streak: claimCounter.nextStreak,
        longest_streak: claimCounter.nextStreak,
      });
    }
    if (url.includes("/rpc/")) {
      return json(null);
    }

    // Tables
    if (url.includes("/daily_streaks")) {
      // After a claim, surface the new streak so the page re-renders.
      const claimed = claimCounter.count > 0;
      return json(
        claimed
          ? {
              current_streak: claimCounter.nextStreak,
              longest_streak: claimCounter.nextStreak,
              last_claimed_date: new Date().toISOString().slice(0, 10),
              last_claimed_at: new Date().toISOString(),
              last_spin_date: null,
              total_claims: claimCounter.count,
              bonus_spins: 0,
            }
          : {
              current_streak: 0,
              longest_streak: 0,
              last_claimed_date: null,
              last_claimed_at: null,
              last_spin_date: null,
              total_claims: 0,
              bonus_spins: 0,
            },
      );
    }
    if (url.includes("/spin_wheel_prizes")) {
      return json([
        { id: "p1", label: "10 Shekels", prize_type: "shekels", prize_value: 10, weight: 1, color_hex: "#D4AF37", sort_order: 1 },
        { id: "p2", label: "Try Again", prize_type: "nothing", prize_value: 0, weight: 1, color_hex: "#555555", sort_order: 2 },
      ]);
    }
    if (url.includes("/battle_tickets")) return json({ balance: 0 });
    if (url.includes("/wallets")) return json({ balance: 0, royal_pass_active: false });
    if (url.includes("/user_roles")) return json([]);
    if (url.includes("/profiles_private")) {
      return json({
        age_confirmed: true,
        onboarded_at: "2026-01-01T00:00:00Z",
        welcome_email_sent_at: "2026-01-01T00:00:00Z",
        onboarding_step: 999,
      });
    }
    if (url.includes("/notifications")) return json([]);
    // Pre-accept every required legal doc (slugs + version pulled from
    // src/lib/legalDocs.ts) so LegalConsentGate doesn't render its blocking
    // modal over /rewards.
    if (url.includes("/user_legal_acceptances")) {
      return json(currentRequiredLegalAcceptances());
    }



    // Default — empty list / empty object depending on the verb.
    if (method === "GET") return json([]);
    return json({});
  });

  // Edge functions (e.g. send-transactional-email) — swallow.
  await page.route("**/functions/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
}

async function bootRewards(page: Page, claimCounter: ClaimCounter) {
  await installSupabaseMocks(page, claimCounter);
  // Seed the session BEFORE the app boots so AuthContext finds a user immediately.
  await page.addInitScript(
    ([key, sessionJson]) => {
      try {
        window.localStorage.setItem(key as string, sessionJson as string);
      } catch {
        /* noop */
      }
    },
    [STORAGE_KEY, JSON.stringify(fakeSession())],
  );
  await page.goto("/rewards", { waitUntil: "domcontentloaded" });
  // Wait for the freshness strip to render — that's our "page hydrated" signal.
  await expect(page.getByTestId("rewards-freshness")).toBeVisible({ timeout: 15_000 });
}

test.describe("/rewards — freshness, focus refresh & notification deep link", () => {
  test("UTC rollover countdown ticks every second", async ({ page }) => {
    // A recent claim puts the CTA into its countdown state. An unclaimed
    // account correctly renders the static "Claim available now" message.
    const counter: ClaimCounter = { count: 1, nextStreak: 1 };
    await bootRewards(page, counter);

    const countdown = page.getByTestId("rewards-utc-countdown");
    const first = (await countdown.textContent())?.trim();
    expect(first).toMatch(/Next claim in \d+h \d{2}m \d{2}s|Next claim in \d+m \d{2}s/);
    // Wait a couple of ticks and confirm the seconds value changed.
    await page.waitForTimeout(2200);
    const second = (await countdown.textContent())?.trim();
    expect(second).not.toBe(first);
  });

  test("auto-refreshes data when the tab regains focus", async ({ page }) => {
    const counter: ClaimCounter = { count: 0, nextStreak: 0 };
    await bootRewards(page, counter);

    // Count daily_streaks GETs so we can prove a focus event triggered a refetch.
    let streakFetches = 0;
    page.on("request", (req) => {
      if (req.url().includes("/daily_streaks") && req.method() === "GET") streakFetches += 1;
    });

    const before = streakFetches;
    // Simulate background → foreground transition the same way the page listens for it.
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });

    await expect.poll(() => streakFetches, { timeout: 5000 }).toBeGreaterThan(before);
  });

  test("claim disables the button while in flight and reflects the new streak", async ({ page }) => {
    const counter: ClaimCounter = { count: 0, nextStreak: 0 };
    await bootRewards(page, counter);

    const btn = page.getByTestId("rewards-claim-btn");
    await expect(btn).toBeEnabled();
    await expect(btn).toHaveAttribute("data-claim-state", "ready");

    await btn.click();
    // In-flight: disabled + aria-busy true + Claiming… label.
    await expect(btn).toBeDisabled();
    await expect(btn).toHaveAttribute("aria-busy", "true");
    await expect(btn).toHaveAttribute("data-claim-state", "claiming");
    await expect(btn).toContainText(/Claiming/i);

    // Post-claim: button flips to "Claimed", streak chip shows the new value.
    await expect(btn).toHaveAttribute("data-claim-state", "claimed", { timeout: 5000 });
    await expect(btn).toBeDisabled();
    await expect(page.getByTestId("rewards-streak-current")).toHaveText("1");
    expect(counter.count).toBe(1);
  });

  test("streak_reminder notification deep link lands on /rewards with the Claim CTA highlighted", async ({ page }) => {
    const counter: ClaimCounter = { count: 0, nextStreak: 0 };
    await installSupabaseMocks(page, counter);
    await page.addInitScript(
      ([key, sessionJson]) => {
        try {
          window.localStorage.setItem(key as string, sessionJson as string);
        } catch {
          /* noop */
        }
      },
      [STORAGE_KEY, JSON.stringify(fakeSession())],
    );

    // Land on an unrelated page first, then resolve a streak_reminder
    // notification payload through the real routing helper exactly the way
    // the in-app notification click handler does. This confirms (a) the
    // helper picks /rewards for streak_reminder and (b) the app navigates
    // there and renders the claim CTA in its actionable state.
    await page.goto("/feed", { waitUntil: "domcontentloaded" });

    const target = await page.evaluate(async () => {
      const mod = await import("/src/lib/notificationRouting.ts");
      return mod.getNotificationTarget({
        type: "system",
        payload: { kind: "streak_reminder" },
      });
    });
    expect(target).toBe("/rewards");

    await page.goto(target!, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/rewards$/);

    const claim = page.getByTestId("rewards-claim-btn");
    await expect(claim).toBeVisible({ timeout: 15_000 });
    // The CTA must be actionable (not the "claimed" state) so the user
    // landing from the reminder can immediately continue their streak.
    await expect(claim).toHaveAttribute("data-claim-state", "ready");
    await expect(claim).toBeEnabled();
    await expect(claim).toContainText(/Claim/i);
  });
});
