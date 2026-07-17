// After a live battle ends, vote buttons must stay permanently disabled
// (absent from the DOM) until the user refreshes — no realtime event can
// re-enable them. This spec simulates a stray "back to live" realtime
// payload via the __testSimulateRealtimeVoteBump hook and verifies the
// UI never re-mounts the vote controls.
import { test, expect } from "@playwright/test";
import { seedLiveBattle, endLiveBattle, teardownLiveBattle, hasServiceRoleForLive } from "./helpers/liveBattleSeed";

test.describe("Live battle — post-end vote controls stay locked", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("vote buttons never re-enable via stray realtime events", async ({ page }) => {
    const seed = await seedLiveBattle({ slug: "post-end-locked", durationSeconds: 900 });
    try {
      await page.goto("/auth");
      await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
      await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });

      await page.goto(`/live/${seed.id}`);
      await expect(page.getByTestId("live-vote-host")).toBeEnabled({ timeout: 8_000 });

      // End it.
      await endLiveBattle(seed.id, { at: new Date(Date.now() - 5_000), setEnded: true });
      await expect(page.getByTestId("live-battle-ended")).toBeVisible({ timeout: 8_000 });

      // Simulate a rogue realtime payload that tries to flip status back to
      // live and bump votes. The client must ignore it.
      await page.evaluate((id) => {
        // @ts-expect-error -- test-only hook installed by LiveBattle
        window.__testSimulateRealtimeVoteBump?.(id, { status: "live", host_votes: 500, opponent_votes: 500 });
      }, seed.id);
      await page.waitForTimeout(500);

      // Vote buttons still absent — the ended screen owns the arena.
      await expect(page.getByTestId("live-vote-host")).toHaveCount(0);
      await expect(page.getByTestId("live-vote-opponent")).toHaveCount(0);
      // Snapshot text unchanged (no 500).
      await expect(page.getByTestId("live-battle-ended")).not.toContainText("500");
    } finally {
      await teardownLiveBattle(seed.id);
    }
  });
});
