/**
 * E2E — 21 votes within 60s triggers the rate-limit cooldown; after the
 * cooldown window elapses, voting is re-enabled without a page refresh.
 *
 * The DB enforces `enforce_rate_limit('livebattle:vote', 20, 60)`. We:
 *   1. Fire 21 rapid votes — 20 succeed, 21st is rate-limited.
 *   2. Verify the UI reflects the cooldown state on next click.
 *   3. Wait past the 60s window, then vote again — the DB accepts it and
 *      the UI transitions to a confirmed state without a reload.
 */
import { test, expect } from "@playwright/test";
import {
  adminClient,
  hasServiceRoleForLive,
  seedLiveBattle,
  teardownLiveBattle,
} from "./helpers/liveBattleSeed";

// The test intentionally waits ~65s for the DB cooldown window to lapse.
test.setTimeout(180_000);

test.describe("Live battle — vote cooldown recovery", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users A/B/C.");

  test("21 votes cools down; UI re-enables voting after 60s window elapses", async ({ page }) => {
    const admin = adminClient();
    const seed = await seedLiveBattle({ slug: "vote-cooldown-recover", durationSeconds: 15 * 60 });

    try {
      await page.goto("/auth");
      await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
      await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });

      await page.goto(`/live/${seed.id}`);
      await expect(page.getByTestId("live-vote-host")).toBeEnabled({ timeout: 8_000 });

      // Burst 21 votes; capture per-call ok/error.
      const t0 = Date.now();
      const burst = await page.evaluate(async (id: string) => {
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

      expect(burst.filter((r) => r.ok).length).toBe(20);
      const failed = burst.filter((r) => !r.ok);
      expect(failed.length).toBe(1);
      expect(String(failed[0].error)).toMatch(/rate_limited|rate/i);

      // UI still mounted — clicking now surfaces the failed/cooldown chip.
      await page.getByTestId("live-vote-host").click();
      await expect(page.getByTestId("vote-failed")).toBeVisible({ timeout: 5_000 });

      const { count: midCount } = await admin
        .from("live_battle_votes")
        .select("*", { count: "exact", head: true })
        .eq("battle_id", seed.id);
      expect(midCount).toBe(20);

      // Wait for the 60s rate-limit window to fully elapse.
      const elapsed = Date.now() - t0;
      const waitMs = Math.max(0, 65_000 - elapsed);
      await page.waitForTimeout(waitMs);

      // Fire a single vote — server should accept it now.
      const after = await page.evaluate(async (id: string) => {
        const mod = await import("/src/integrations/supabase/client.ts");
        const { supabase } = mod as { supabase: import("@supabase/supabase-js").SupabaseClient };
        const { error } = await supabase.rpc("live_battle_vote" as never, {
          _battle_id: id, _choice: "host",
        } as never);
        return error ? { ok: false, error: error.message } : { ok: true };
      }, seed.id);
      expect(after.ok).toBe(true);

      const { count: postCount } = await admin
        .from("live_battle_votes")
        .select("*", { count: "exact", head: true })
        .eq("battle_id", seed.id);
      expect(postCount).toBe(21);

      // And the UI vote button remains usable — no refresh was needed.
      await expect(page.getByTestId("live-vote-host")).toBeEnabled();
    } finally {
      await teardownLiveBattle(seed.id);
    }
  });
});
