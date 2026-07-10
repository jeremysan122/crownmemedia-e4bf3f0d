/**
 * E2E — Live battle vote window edges.
 *
 * Verifies backend rules that `live_battle_vote` enforces:
 *   1. START of window (battle just went live) → vote is accepted, row persisted.
 *   2. JUST AFTER end (`ends_at` in the past)  → vote is rejected.
 *   3. Status = 'ended'                        → vote is rejected with battle_not_live.
 *
 * Uses the deterministic seed helper so we don't drift when re-running.
 * Skipped on Lovable Cloud (no service-role key).
 */
import { test, expect } from "@playwright/test";
import {
  adminClient,
  endLiveBattle,
  hasServiceRoleForLive,
  seedLiveBattle,
  teardownLiveBattle,
} from "./helpers/liveBattleSeed";

test.describe("Live battle — vote window edges", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users A/B/C.");

  test("Vote at start is allowed; vote after ends_at / ended is blocked", async ({ page }) => {
    const admin = adminClient();
    const seed = await seedLiveBattle({ slug: "vote-window", durationSeconds: 900 });

    try {
      // Sign in as viewer C.
      await page.goto("/auth");
      await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
      await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });

      await page.goto(`/live/${seed.id}`);

      // ── 1. Vote at start of window — allowed ──
      const startVote = await page.evaluate(
        async (id: string) => {
          const mod = await import("/src/integrations/supabase/client.ts");
          const { supabase } = mod as { supabase: import("@supabase/supabase-js").SupabaseClient };
          const { error } = await supabase.rpc("live_battle_vote" as never, {
            _battle_id: id, _choice: "host",
          } as never);
          return error ? { error: error.message } : { ok: true };
        },
        seed.id,
      );
      expect(startVote).toEqual({ ok: true });

      // Confirmed chip should appear via realtime UPDATE.
      await expect(page.getByTestId("vote-confirmed")).toBeVisible({ timeout: 8_000 });

      // DB: exactly 1 vote row so far.
      let { count } = await admin
        .from("live_battle_votes")
        .select("*", { count: "exact", head: true })
        .eq("battle_id", seed.id);
      expect(count).toBe(1);

      // ── 2. Fast-forward ends_at into the past — vote should be blocked ──
      await endLiveBattle(seed.id, { at: new Date(Date.now() - 2000) });
      const lateVote = await page.evaluate(
        async (id: string) => {
          const mod = await import("/src/integrations/supabase/client.ts");
          const { supabase } = mod as { supabase: import("@supabase/supabase-js").SupabaseClient };
          const { error } = await supabase.rpc("live_battle_vote" as never, {
            _battle_id: id, _choice: "opponent",
          } as never);
          return error ? { error: error.message } : { ok: true };
        },
        seed.id,
      );
      expect(lateVote).toHaveProperty("error");
      expect(String((lateVote as { error: string }).error)).toMatch(
        /battle_ended|not_live|ended|window/i,
      );

      // Vote count unchanged.
      ({ count } = await admin
        .from("live_battle_votes")
        .select("*", { count: "exact", head: true })
        .eq("battle_id", seed.id));
      expect(count).toBe(1);

      // ── 3. Flip status to ended — vote rejected with battle_not_live ──
      await endLiveBattle(seed.id, { setEnded: true });
      const endedVote = await page.evaluate(
        async (id: string) => {
          const mod = await import("/src/integrations/supabase/client.ts");
          const { supabase } = mod as { supabase: import("@supabase/supabase-js").SupabaseClient };
          const { error } = await supabase.rpc("live_battle_vote" as never, {
            _battle_id: id, _choice: "opponent",
          } as never);
          return error ? { error: error.message } : { ok: true };
        },
        seed.id,
      );
      expect(endedVote).toHaveProperty("error");
      expect(String((endedVote as { error: string }).error)).toMatch(
        /battle_not_live|ended|not.?live/i,
      );

      // Final DB assertion — one vote total, exactly the one from step 1.
      ({ count } = await admin
        .from("live_battle_votes")
        .select("*", { count: "exact", head: true })
        .eq("battle_id", seed.id));
      expect(count).toBe(1);
    } finally {
      await teardownLiveBattle(seed.id);
    }
  });
});
