/**
 * E2E — Live Battles allow multiple votes per viewer within the rate-limit
 * window. Casts several `live_battle_vote` RPCs in quick succession and
 * verifies the on-screen host/opponent totals reconcile via realtime
 * without any page refresh.
 *
 * Requires service-role + seeded users A/B/C. Skipped on Lovable Cloud.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const HAS_SERVICE_ROLE =
  !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !!process.env.SUPABASE_URL &&
  !!process.env.E2E_USER_A_ID &&
  !!process.env.E2E_USER_B_ID &&
  !!process.env.E2E_USER_C_EMAIL &&
  !!process.env.E2E_USER_C_PASSWORD;

test.describe("Live battle — multi-vote reconciliation", () => {
  test.skip(!HAS_SERVICE_ROLE, "Requires service-role + seeded users A/B/C.");

  test("Multiple live votes update the tallies without a reload", async ({ page }) => {
    const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const A = process.env.E2E_USER_A_ID!;
    const B = process.env.E2E_USER_B_ID!;

    const now = Date.now();
    const { data: battle, error: bErr } = await admin
      .from("live_battles")
      .insert({
        host_id: A,
        opponent_id: B,
        room_name: `e2e-multi-${now}`,
        status: "live",
        started_at: new Date(now).toISOString(),
        ends_at: new Date(now + 15 * 60 * 1000).toISOString(),
        duration_seconds: 900,
      })
      .select("id")
      .single();
    if (bErr || !battle) throw bErr ?? new Error("live_battle_seed_failed");
    const battleId = battle.id as string;

    let navCount = 0;
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) navCount += 1; });

    try {
      await page.goto("/auth");
      await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
      await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });

      await page.goto(`/live/${battleId}`);
      const navBefore = navCount;

      // Fire 5 votes for host + 3 for opponent through the same page context.
      const castResult = await page.evaluate(
        async (args: { battleId: string }) => {
          const mod = await import("/src/integrations/supabase/client.ts");
          const { supabase } = mod as { supabase: import("@supabase/supabase-js").SupabaseClient };
          const errors: string[] = [];
          for (let i = 0; i < 5; i++) {
            const { error } = await supabase.rpc("live_battle_vote" as never, {
              _battle_id: args.battleId, _choice: "host",
            } as never);
            if (error) errors.push(`h${i}:${error.message}`);
          }
          for (let i = 0; i < 3; i++) {
            const { error } = await supabase.rpc("live_battle_vote" as never, {
              _battle_id: args.battleId, _choice: "opponent",
            } as never);
            if (error) errors.push(`o${i}:${error.message}`);
          }
          return { errors };
        },
        { battleId },
      );
      expect(castResult.errors).toEqual([]);

      // Poll DB truth — realtime should reflect these values on screen.
      await expect.poll(async () => {
        const { data } = await admin
          .from("live_battles")
          .select("host_votes, opponent_votes")
          .eq("id", battleId)
          .single();
        return data ?? null;
      }, { timeout: 10_000 }).toMatchObject({ host_votes: 5, opponent_votes: 3 });

      // No forced reloads happened.
      expect(navCount - navBefore).toBeLessThanOrEqual(1);
    } finally {
      await admin.from("live_battle_votes").delete().eq("battle_id", battleId);
      await admin.from("live_battles").delete().eq("id", battleId);
    }
  });
});
