// After a live battle ends: optimistic UI, realtime vote patches, and vote
// buttons must all be permanently frozen until the user refreshes the page.
import { test, expect } from "@playwright/test";
import { hasServiceRoleForLive, seedLiveBattle, signInAsSeed } from "./helpers/liveBattleSeed";

test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

test("post-ended vote controls stay locked and vote counts freeze", async ({ page }) => {
  const { battleId, viewer } = await seedLiveBattle({ status: "ended", host_votes: 7, opponent_votes: 4 });
  await signInAsSeed(page, viewer);
  await page.goto(`/live/${battleId}`);

  // Results screen renders — no vote buttons in the DOM.
  await expect(page.getByTestId("live-battle-ended")).toBeVisible();
  await expect(page.getByTestId("live-vote-host")).toHaveCount(0);
  await expect(page.getByTestId("live-vote-opponent")).toHaveCount(0);

  // Simulate a stray realtime UPDATE that bumps vote counts after end —
  // the leaderboard snapshot must not change until refresh.
  await page.evaluate((id) => {
    // @ts-expect-error -- test-only hook installed by LiveBattle
    window.__testSimulateRealtimeVoteBump?.(id, { host_votes: 999, opponent_votes: 999 });
  }, battleId);

  // Snapshot text still shows the frozen final counts.
  await expect(page.getByTestId("live-battle-ended")).toContainText("7");
  await expect(page.getByTestId("live-battle-ended")).toContainText("4");
});
