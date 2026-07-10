/**
 * E2E — Post battles enforce one vote per user. Casts a vote, then attempts
 * to vote again and asserts the second attempt is rejected and the
 * leaderboard row for challenger A does not change further.
 *
 * Requires service-role + seeded users A/B/C. Skipped on Lovable Cloud.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const HAS_SERVICE_ROLE =
  !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !!process.env.SUPABASE_URL &&
  !!process.env.E2E_USER_A_ID &&
  !!process.env.E2E_USER_B_ID &&
  !!process.env.E2E_USER_C_EMAIL &&
  !!process.env.E2E_USER_C_PASSWORD;

test.describe("Post battle — second vote blocked", () => {
  test.skip(!HAS_SERVICE_ROLE, "Requires service-role + seeded users A/B/C.");

  test("Second vote is blocked; leaderboard score does not change again", async ({ page }) => {
    const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const A = process.env.E2E_USER_A_ID!;
    const B = process.env.E2E_USER_B_ID!;

    const endsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: battle, error: bErr } = await admin
      .from("battles")
      .insert({ challenger_id: A, opponent_id: B, status: "active", ends_at: endsAt })
      .select("id")
      .single();
    if (bErr || !battle) throw bErr ?? new Error("battle_seed_failed");
    const battleId = battle.id as string;

    try {
      await page.goto("/auth");
      await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
      await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });

      await page.goto(`/battle/${battleId}`);
      await page.getByRole("button", { name: /vote/i }).first().click();
      await expect(page.getByText(/voted|thanks|counted/i).first()).toBeVisible({ timeout: 10_000 });

      await page.goto("/leaderboard");
      const afterFirst = await readRenderedScore(page, A);

      // Second attempt — should be blocked (already_voted).
      await page.goto(`/battle/${battleId}`);
      const secondAttempt = await page.evaluate(
        async (args: { battleId: string }) => {
          const mod = await import("/src/integrations/supabase/client.ts");
          const { supabase } = mod as { supabase: import("@supabase/supabase-js").SupabaseClient };
          const { error } = await supabase.rpc("cast_battle_vote" as never, {
            _battle_id: args.battleId, _choice: "challenger",
          } as never);
          return error ? { error: error.message } : { ok: true };
        },
        { battleId },
      );
      expect(secondAttempt).toHaveProperty("error");
      expect(String((secondAttempt as { error: string }).error)).toMatch(/already|duplicate|voted/i);

      // Leaderboard must not have gained additional score from a blocked vote.
      await page.goto("/leaderboard");
      const afterSecond = await readRenderedScore(page, A);
      expect(afterSecond).toBe(afterFirst);

      // DB-level assertion: exactly one row in battle_votes for this voter.
      const { count } = await admin
        .from("battle_votes")
        .select("*", { count: "exact", head: true })
        .eq("battle_id", battleId);
      expect(count).toBe(1);
    } finally {
      await admin.from("battle_votes").delete().eq("battle_id", battleId);
      await admin.from("battles").delete().eq("id", battleId);
    }
  });
});

async function readRenderedScore(page: Page, userId: string): Promise<number> {
  const row = page.getByTestId(`leaderboard-row-${userId}`).or(page.locator(`[data-user-id="${userId}"]`)).first();
  if (!(await row.count())) return 0;
  const txt = (await row.innerText()).replace(/,/g, "");
  const m = txt.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}
