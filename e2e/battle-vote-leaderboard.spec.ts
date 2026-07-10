/**
 * End-to-end: cast a battle vote and verify the leaderboard reflects the new
 * weighted score.
 *
 * Flow:
 *   1. Admin (service-role) seeds an active post battle between two known
 *      creators (A = challenger, B = opponent).
 *   2. Snapshots the challenger's current leaderboard weighted score.
 *   3. User C (a neutral third party — NOT a participant) signs in and casts
 *      a vote for the challenger from /battle/:id.
 *   4. Asserts the on-screen vote count bumped for the challenger.
 *   5. Reloads the leaderboard and asserts the challenger's weighted score
 *      strictly increased vs. the pre-vote snapshot (weighting is applied
 *      server-side by the battle-vote → crown_score pipeline).
 *   6. Cleans up: deletes the seeded vote + battle row.
 *
 * Requires a service-role key + three seeded test users. On Lovable Cloud
 * that key is intentionally unavailable, so the spec is skipped with the
 * exact env vars needed to run it locally / in CI.
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

test.describe("Battle vote → leaderboard weighted score", () => {
  test.skip(
    !HAS_SERVICE_ROLE,
    [
      "Requires service-role credentials + three seeded test users, which are",
      "not available on Lovable Cloud. To run locally or in CI, export:",
      "  SUPABASE_URL=<project url>",
      "  SUPABASE_SERVICE_ROLE_KEY=<key>",
      "  E2E_USER_A_ID=<challenger uuid>",
      "  E2E_USER_B_ID=<opponent uuid>",
      "  E2E_USER_C_EMAIL=<voter@example.com>",
      "  E2E_USER_C_PASSWORD=<pw>",
      "then run: bunx playwright test e2e/battle-vote-leaderboard.spec.ts",
    ].join("\n"),
  );

  test("Voter C votes for challenger A → A's leaderboard weighted score increases", async ({ page }) => {
    const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const A = process.env.E2E_USER_A_ID!;
    const B = process.env.E2E_USER_B_ID!;

    // ── Seed an active battle A vs B (24h window) ──────────────────────────
    const endsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: battle, error: bErr } = await admin
      .from("battles")
      .insert({
        challenger_id: A,
        opponent_id: B,
        status: "active",
        ends_at: endsAt,
        challenger_votes: 0,
        opponent_votes: 0,
      })
      .select("id")
      .single();
    if (bErr || !battle) throw bErr ?? new Error("battle_seed_failed");
    const battleId = battle.id as string;

    try {
      // ── Snapshot challenger's leaderboard weighted score (server truth) ──
      const scoreBefore = await readWeightedScore(admin, A);

      // ── Voter C: sign in and cast a vote for challenger ─────────────────
      await page.goto("/auth");
      await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
      await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });

      await page.goto(`/battle/${battleId}`);
      // Vote for challenger side — first "Vote" button on the page maps to A.
      const voteBtn = page.getByRole("button", { name: /vote/i }).first();
      await voteBtn.click();
      await expect(page.getByText(/thanks|vote(d)? counted|voted/i).first()).toBeVisible({ timeout: 10_000 });

      // On-screen vote count for challenger bumps to >= 1
      await expect
        .poll(async () => {
          const { data } = await admin
            .from("battles")
            .select("challenger_votes")
            .eq("id", battleId)
            .maybeSingle();
          return (data?.challenger_votes as number) ?? 0;
        }, { timeout: 10_000 })
        .toBeGreaterThan(0);

      // ── Leaderboard reflects the new weighted score for A ───────────────
      await expect
        .poll(async () => readWeightedScore(admin, A), { timeout: 15_000 })
        .toBeGreaterThan(scoreBefore);

      // Sanity: the leaderboard UI renders A somewhere on the page.
      await page.goto("/leaderboard");
      await expect(page.getByTestId(`leaderboard-row-${A}`).or(page.locator(`[data-user-id="${A}"]`)).first())
        .toBeVisible({ timeout: 15_000 });
    } finally {
      // ── Cleanup: vote rows cascade with battle delete via FK; be explicit ─
      await admin.from("battle_votes").delete().eq("battle_id", battleId);
      await admin.from("battles").delete().eq("id", battleId);
    }
  });
});

/**
 * Read the challenger's current weighted leaderboard score from the same
 * source of truth the /leaderboard page uses. We try the ranking view first
 * (weighted, refreshed by the ranks snapshot job) and fall back to the
 * profile's crown_score, which is the aggregate the weighting feeds into.
 */
async function readWeightedScore(admin: ReturnType<typeof createClient>, userId: string): Promise<number> {
  const { data: rank } = await admin
    .from("rank_snapshots")
    .select("weighted_score,score")
    .eq("user_id", userId)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const w = (rank as { weighted_score?: number; score?: number } | null);
  if (w?.weighted_score != null) return Number(w.weighted_score);
  if (w?.score != null) return Number(w.score);

  const { data: prof } = await admin
    .from("profiles")
    .select("crown_score")
    .eq("id", userId)
    .maybeSingle();
  return Number((prof as { crown_score?: number } | null)?.crown_score ?? 0);
}
