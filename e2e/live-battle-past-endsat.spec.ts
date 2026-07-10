/**
 * E2E — Live battle window is closed once `ends_at` is in the past.
 *
 * Verifies the viewer arena:
 *   1. Shows the "Voting has closed" banner once the client timer hits 0.
 *   2. Disables both vote buttons (rate + window enforcement is DB-side too).
 *   3. When the row flips to `status='ended'`, the results screen replaces
 *      the arena and further vote RPCs are rejected server-side.
 */
import { test, expect } from "@playwright/test";
import {
  adminClient,
  endLiveBattle,
  hasServiceRoleForLive,
  seedLiveBattle,
  teardownLiveBattle,
} from "./helpers/liveBattleSeed";

test.describe("Live battle — past ends_at disables voting", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users A/B/C.");

  test("Timer expiry closes voting; ended flip shows results", async ({ page }) => {
    const admin = adminClient();
    const seed = await seedLiveBattle({ slug: "past-endsat", endsInSeconds: 3 });

    try {
      // Viewer C.
      await page.goto("/auth");
      await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
      await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });

      await page.goto(`/live/${seed.id}`);

      // Buttons are enabled before the window closes.
      const hostBtn = page.getByTestId("live-vote-host");
      const oppBtn = page.getByTestId("live-vote-opponent");
      await expect(hostBtn).toBeEnabled({ timeout: 8_000 });

      // Once the countdown crosses 0, the closed banner appears and
      // both vote buttons flip to disabled — no page refresh.
      await expect(
        page.getByTestId("live-battle-window-closed"),
      ).toBeVisible({ timeout: 8_000 });
      await expect(hostBtn).toBeDisabled();
      await expect(oppBtn).toBeDisabled();

      // Extra safety — a vote RPC after ends_at is rejected server-side.
      await endLiveBattle(seed.id, { at: new Date(Date.now() - 5_000) });
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

      // Flip to ended → arena is replaced by the results screen.
      await endLiveBattle(seed.id, { setEnded: true });
      await expect(page.getByTestId("live-battle-ended")).toBeVisible({ timeout: 8_000 });
    } finally {
      await teardownLiveBattle(seed.id);
    }
  });
});
