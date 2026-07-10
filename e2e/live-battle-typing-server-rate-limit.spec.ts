// E2E: Server-side rate limiting for the typing broadcast RPC.
// Even if the client bypasses its own throttle and slams the RPC as fast as
// possible, the server must return `true` at most once per ~1500ms window
// and `false` for every request inside the same window. This exercises the
// authoritative check in public.broadcast_live_battle_typing.
import { test, expect, Page } from "@playwright/test";
import {
  seedLiveBattle, teardownLiveBattle, hasServiceRoleForLive,
} from "./helpers/liveBattleSeed";

async function signInC(page: Page) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
  await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });
}

/** Locate the auth session token stored by Supabase in localStorage. */
async function getAccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) {
        try {
          const v = JSON.parse(window.localStorage.getItem(k) ?? "null");
          return v?.access_token ?? v?.currentSession?.access_token ?? null;
        } catch { /* ignore */ }
      }
    }
    return null;
  });
  if (!token) throw new Error("no_access_token_in_localstorage");
  return token as string;
}

test.describe("Live battle typing — server-side rate limit", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");
  test.skip(
    !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY,
    "Requires SUPABASE_URL + SUPABASE_ANON_KEY for direct RPC calls.",
  );

  test("RPC returns true at most once per window regardless of client spam", async ({ page }) => {
    const seed = await seedLiveBattle({ slug: "lbc-server-typing-rl", status: "live" });
    try {
      await signInC(page);
      // Land on the battle so the session/user is warm (also more realistic).
      await page.goto(`/live/${seed.id}`);
      await expect(page.getByTestId("live-battle-comment-input")).toBeVisible({ timeout: 10_000 });

      const accessToken = await getAccessToken(page);
      const url = process.env.SUPABASE_URL!.replace(/\/$/, "");
      const anon = process.env.SUPABASE_ANON_KEY!;

      // Fire N parallel RPC calls, bypassing the client-side throttle
      // entirely. Server MUST accept at most one within the 1500ms window.
      const results = await page.evaluate(async ({ url, anon, accessToken, battleId }) => {
        const call = () =>
          fetch(`${url}/rest/v1/rpc/broadcast_live_battle_typing`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: anon,
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ _battle_id: battleId }),
          }).then(async (r) => ({ ok: r.ok, status: r.status, body: await r.text() }));
        const settled = await Promise.all(Array.from({ length: 20 }).map(call));
        return settled;
      }, { url, anon, accessToken, battleId: seed.id });

      // All calls must be HTTP 200 — throttling is expressed via the boolean
      // return value, never via an error response.
      for (const r of results) expect(r.ok).toBeTruthy();
      const parsed = results.map((r) => JSON.parse(r.body) as boolean);
      const trueCount = parsed.filter((b) => b === true).length;
      expect(trueCount).toBe(1);
      expect(parsed.filter((b) => b === false).length).toBe(19);

      // Wait for the window to elapse, then hit it again in a second burst.
      // Exactly ONE more `true` should slip through.
      await page.waitForTimeout(1700);
      const second = await page.evaluate(async ({ url, anon, accessToken, battleId }) => {
        const call = () =>
          fetch(`${url}/rest/v1/rpc/broadcast_live_battle_typing`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: anon,
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ _battle_id: battleId }),
          }).then(async (r) => ({ ok: r.ok, body: await r.text() }));
        return Promise.all(Array.from({ length: 15 }).map(call));
      }, { url, anon, accessToken, battleId: seed.id });

      const secondParsed = second.map((r) => JSON.parse(r.body) as boolean);
      expect(secondParsed.filter((b) => b === true).length).toBe(1);
    } finally {
      await teardownLiveBattle(seed.id);
    }
  });
});
