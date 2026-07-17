// After a live battle ends, no realtime event — including late-arriving
// UPDATEs — can:
//   - change the vote chip UI,
//   - change the leaderboard vote counts, or
//   - re-enable the vote buttons.
// A full page refresh is the only way to observe new backend state.
import { test, expect } from "@playwright/test";
import {
  adminClient, seedLiveBattle, endLiveBattle, teardownLiveBattle, hasServiceRoleForLive,
} from "./helpers/liveBattleSeed";

test.describe("Live battle — post-end chip and leaderboard permanently frozen", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("stray realtime UPDATEs can't move chips, scores, or re-enable votes", async ({ page }) => {
    const admin = adminClient();
    const seed = await seedLiveBattle({ slug: "post-end-frozen", durationSeconds: 900 });
    try {
      await admin.from("live_battles").update({ host_votes: 9, opponent_votes: 4 }).eq("id", seed.id);

      await page.goto("/auth");
      await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
      await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });

      await page.goto(`/live/${seed.id}`);
      await expect(page.getByTestId("live-vote-host")).toBeEnabled({ timeout: 8_000 });

      // End the battle.
      await endLiveBattle(seed.id, { at: new Date(Date.now() - 2_000), setEnded: true });
      const ended = page.getByTestId("live-battle-ended");
      await expect(ended).toBeVisible({ timeout: 8_000 });
      await expect(ended).toContainText("9");
      await expect(ended).toContainText("4");

      // Simulate a stray realtime payload that tries to flip status back
      // to live AND bump both counts. The client must ignore it.
      await page.evaluate((id) => {
        // @ts-expect-error -- test-only hook installed by LiveBattle
        window.__testSimulateRealtimeVoteBump?.(id, {
          status: "live", host_votes: 777, opponent_votes: 888,
        });
      }, seed.id);
      await page.waitForTimeout(600);

      // Vote controls and chip announcer stay unmounted.
      await expect(page.getByTestId("live-vote-host")).toHaveCount(0);
      await expect(page.getByTestId("live-vote-opponent")).toHaveCount(0);
      await expect(page.getByTestId("vote-chip-announcer")).toHaveCount(0);

      // Frozen leaderboard snapshot — no 777/888 anywhere.
      await expect(ended).not.toContainText("777");
      await expect(ended).not.toContainText("888");
      await expect(ended).toContainText("9");
      await expect(ended).toContainText("4");

      // Server-side change too — no realtime propagation is honored.
      await admin.from("live_battles").update({ host_votes: 555 }).eq("id", seed.id);
      await page.waitForTimeout(800);
      await expect(ended).not.toContainText("555");
      await expect(page.getByTestId("live-vote-host")).toHaveCount(0);
    } finally {
      await teardownLiveBattle(seed.id);
    }
  });
});
