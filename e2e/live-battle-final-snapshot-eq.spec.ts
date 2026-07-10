// The final weighted leaderboard score must update exactly once at end
// and then equal the backend snapshot after reopening /live/:id.
import { test, expect } from "@playwright/test";
import {
  adminClient, seedLiveBattle, endLiveBattle, teardownLiveBattle, hasServiceRoleForLive,
} from "./helpers/liveBattleSeed";

test.describe("Live battle — final leaderboard equals backend snapshot", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("final score updates once on end and matches backend on reopen", async ({ page }) => {
    const admin = adminClient();
    const seed = await seedLiveBattle({ slug: "final-snapshot-eq", durationSeconds: 900 });
    try {
      await admin.from("live_battles").update({ host_votes: 11, opponent_votes: 6 }).eq("id", seed.id);

      await page.goto("/auth");
      await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
      await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });

      await page.goto(`/live/${seed.id}`);
      await expect(page.getByTestId("live-vote-host")).toBeEnabled({ timeout: 8_000 });

      // Count how many times the ended snapshot node re-renders with
      // different content — should be exactly once (initial mount at end).
      await endLiveBattle(seed.id, { at: new Date(Date.now() - 5_000), setEnded: true });
      const ended = page.getByTestId("live-battle-ended");
      await expect(ended).toBeVisible({ timeout: 8_000 });
      await expect(ended).toContainText("11");
      await expect(ended).toContainText("6");

      // Push a rogue backend update — snapshot must not change.
      await admin.from("live_battles").update({ host_votes: 42 }).eq("id", seed.id);
      await page.waitForTimeout(1_200);
      await expect(ended).toContainText("11");
      await expect(ended).not.toContainText("42");

      // Reopen the page — client reloads from backend. The backend row
      // has host_votes=42 now (rogue update above), so reopening must
      // show the true backend snapshot.
      await page.goto("/battles");
      await page.goto(`/live/${seed.id}`);
      await expect(page.getByTestId("live-battle-ended")).toContainText("42", { timeout: 8_000 });
      await expect(page.getByTestId("live-battle-ended")).toContainText("6");
    } finally {
      await teardownLiveBattle(seed.id);
    }
  });
});
