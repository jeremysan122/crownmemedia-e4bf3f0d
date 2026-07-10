/**
 * E2E — After `ends_at` (and status='ended') the arena displays the FINAL
 * weighted leaderboard snapshot and blocks all further vote mutations,
 * both via the UI and via a direct realtime-triggered RPC — no refresh.
 *
 * Steps:
 *   1. Seed a live battle with a short window; cast a few votes so the
 *      final snapshot has non-zero host/opponent counts.
 *   2. Force `ends_at` into the past and flip `status='ended'`.
 *   3. Verify the results screen shows the exact final vote counts.
 *   4. Try to submit a vote via the page's supabase client — server must
 *      reject and no row is inserted.
 *   5. Push an admin UPDATE to the row (bumping host_votes) and confirm
 *      the ended screen still shows the SNAPSHOT — the client does not
 *      apply post-ended realtime patches as if voting were still live.
 */
import { test, expect } from "@playwright/test";
import {
  adminClient,
  endLiveBattle,
  hasServiceRoleForLive,
  seedLiveBattle,
  teardownLiveBattle,
} from "./helpers/liveBattleSeed";

test.describe("Live battle — final leaderboard snapshot after ends_at", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users A/B/C.");

  test("Ends_at freezes leaderboard and blocks new vote mutations", async ({ page }) => {
    const admin = adminClient();
    const seed = await seedLiveBattle({ slug: "ended-snapshot", durationSeconds: 900 });

    try {
      // Seed a deterministic vote tally directly (bypasses RPC rate limit).
      await admin.from("live_battles").update({
        host_votes: 7,
        opponent_votes: 4,
      }).eq("id", seed.id);

      // Sign in as viewer C.
      await page.goto("/auth");
      await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
      await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });

      await page.goto(`/live/${seed.id}`);
      await expect(page.getByTestId("live-vote-host")).toBeEnabled({ timeout: 8_000 });

      // End the battle: past ends_at + status='ended'.
      await endLiveBattle(seed.id, { at: new Date(Date.now() - 10_000), setEnded: true });

      // Results screen replaces arena.
      const ended = page.getByTestId("live-battle-ended");
      await expect(ended).toBeVisible({ timeout: 8_000 });

      // Final snapshot values are rendered — total = 11 (7 + 4).
      await expect(ended).toContainText("11 total votes");
      await expect(ended).toContainText(/Host.*7/);
      await expect(ended).toContainText(/Opponent.*4/);

      // Try a vote from the page context — server rejects, no row inserted.
      const late = await page.evaluate(async (id: string) => {
        const mod = await import("/src/integrations/supabase/client.ts");
        const { supabase } = mod as { supabase: import("@supabase/supabase-js").SupabaseClient };
        const { error } = await supabase.rpc("live_battle_vote" as never, {
          _battle_id: id, _choice: "host",
        } as never);
        return error ? { error: error.message } : { ok: true };
      }, seed.id);
      expect(late).toHaveProperty("error");
      expect(String((late as { error: string }).error)).toMatch(/not_live|ended|window/i);

      const { count } = await admin
        .from("live_battle_votes")
        .select("*", { count: "exact", head: true })
        .eq("battle_id", seed.id);
      expect(count).toBe(0);

      // Push a fake realtime patch (admin update) — the ended screen must
      // still show the SNAPSHOT tally, not the new value.
      await admin.from("live_battles").update({ host_votes: 999 }).eq("id", seed.id);
      // Give realtime a beat.
      await page.waitForTimeout(1_500);
      await expect(ended).toContainText("11 total votes");
      await expect(ended).not.toContainText("999");
    } finally {
      await teardownLiveBattle(seed.id);
    }
  });
});
