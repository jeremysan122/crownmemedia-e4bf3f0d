/**
 * E2E — Live vote rate limit (20 votes / 60 seconds).
 *
 * The DB enforces the limit via `enforce_rate_limit('livebattle:vote',20,60)`
 * inside `public.live_battle_vote`. We fire 21 rapid RPCs from the page's
 * supabase client (same auth context the UI uses) and verify:
 *
 *   1. The first 20 succeed.
 *   2. The 21st is rejected with a `rate_limited:` error.
 *   3. After failure the UI reflects the failed chip and the vote buttons
 *      stay usable but the next attempt still surfaces the cooldown toast
 *      without a page refresh.
 */
import { test, expect } from "@playwright/test";
import {
  adminClient,
  hasServiceRoleForLive,
  seedLiveBattle,
  teardownLiveBattle,
} from "./helpers/liveBattleSeed";

test.describe("Live battle — vote rate limit", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users A/B/C.");

  test("21 votes within 60s: first 20 pass, 21st is rate-limited without refresh", async ({ page }) => {
    const admin = adminClient();
    const seed = await seedLiveBattle({ slug: "vote-ratelimit", durationSeconds: 900 });

    try {
      await page.goto("/auth");
      await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
      await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });

      await page.goto(`/live/${seed.id}`);
      await expect(page.getByTestId("live-vote-host")).toBeEnabled({ timeout: 8_000 });

      // Fire 21 votes sequentially from the app's supabase client.
      const results = await page.evaluate(async (id: string) => {
        const mod = await import("/src/integrations/supabase/client.ts");
        const { supabase } = mod as { supabase: import("@supabase/supabase-js").SupabaseClient };
        const out: Array<{ ok: boolean; error?: string }> = [];
        for (let i = 0; i < 21; i++) {
          const { error } = await supabase.rpc("live_battle_vote" as never, {
            _battle_id: id, _choice: i % 2 === 0 ? "host" : "opponent",
          } as never);
          out.push(error ? { ok: false, error: error.message } : { ok: true });
        }
        return out;
      }, seed.id);

      const ok = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok);
      expect(ok).toBe(20);
      expect(failed.length).toBe(1);
      expect(String(failed[0].error)).toMatch(/rate_limited|rate/i);

      // DB row count matches — the failed one did NOT insert.
      const { count } = await admin
        .from("live_battle_votes")
        .select("*", { count: "exact", head: true })
        .eq("battle_id", seed.id);
      expect(count).toBe(20);

      // UI is still mounted (no refresh needed). Trying to click the button
      // now shows the "failed" chip via the same handler.
      await page.getByTestId("live-vote-host").click();
      await expect(page.getByTestId("vote-failed")).toBeVisible({ timeout: 5_000 });
    } finally {
      await teardownLiveBattle(seed.id);
    }
  });
});
