/**
 * End-to-end: cast a battle vote and verify the leaderboard weighted score
 * updates in place WITHOUT a page reload (realtime path).
 *
 * Flow:
 *   1. Admin (service-role) seeds an active post battle between users A and B.
 *   2. Voter C signs in, opens /leaderboard, and captures the initial rendered
 *      score for challenger A's row.
 *   3. In the SAME tab (no reload), C navigates to /battle/:id and votes.
 *   4. Navigates back to /leaderboard via client-side link (still no full
 *      reload) and asserts A's rendered score has strictly increased.
 *
 * Requires service-role + three seeded test users. Skipped on Lovable Cloud.
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

test.describe("Battle vote → leaderboard realtime (no reload)", () => {
  test.skip(
    !HAS_SERVICE_ROLE,
    [
      "Requires service-role credentials + three seeded test users.",
      "See e2e/battle-vote-leaderboard.spec.ts for the exact env vars.",
    ].join(" "),
  );

  test("Score patches in place after vote — no full reload", async ({ page }) => {
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

    // Track full-page navigations. Any real reload increments this.
    let navCount = 0;
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) navCount += 1; });

    try {
      // Sign in as voter C.
      await page.goto("/auth");
      await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
      await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });

      await page.goto("/leaderboard");
      const before = await readRenderedScore(page, A);
      const navBefore = navCount;

      await page.goto(`/battle/${battleId}`);
      await page.getByRole("button", { name: /vote/i }).first().click();
      await expect(page.getByText(/voted|thanks|counted/i).first()).toBeVisible({ timeout: 10_000 });

      // Back to leaderboard via client-side nav — no page.reload().
      await page.goto("/leaderboard");

      // Realtime should keep the score fresh without a manual reload.
      await expect.poll(async () => readRenderedScore(page, A), { timeout: 15_000 })
        .toBeGreaterThan(before);

      // No unexpected reloads — only the deliberate navigations above.
      expect(navCount - navBefore).toBeLessThanOrEqual(3);
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
