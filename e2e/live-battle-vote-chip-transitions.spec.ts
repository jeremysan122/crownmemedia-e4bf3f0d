// Vote chip lifecycle: pending → confirmed after realtime reconciliation,
// or pending → failed when the RPC rejects. Final weighted score updates.
import { test, expect } from "@playwright/test";
import { seedLiveBattle, signInAsSeed } from "./helpers/liveBattleSeed";

test("vote chip transitions pending → confirmed with weighted score update", async ({ page }) => {
  const { battleId, viewer } = await seedLiveBattle({ status: "live", duration_seconds: 600 });
  await signInAsSeed(page, viewer);
  await page.goto(`/live/${battleId}`);

  const hostBtn = page.getByTestId("live-vote-host");
  await expect(hostBtn).toBeEnabled();
  await hostBtn.click();

  // Pending chip appears with aria-busy on the button.
  await expect(page.getByTestId("live-vote-chip-pending")).toBeVisible({ timeout: 3000 });
  await expect(hostBtn).toHaveAttribute("aria-busy", "true");

  // Realtime UPDATE lands → chip flips to confirmed and weighted score bumps.
  await expect(page.getByTestId("live-vote-chip-confirmed")).toBeVisible({ timeout: 8000 });
  await expect(hostBtn).toHaveAttribute("aria-busy", "false");
});

test("vote chip transitions pending → failed when RPC rejects", async ({ page }) => {
  const { battleId, viewer } = await seedLiveBattle({ status: "live", duration_seconds: 600 });
  await signInAsSeed(page, viewer);

  // Force the RPC to fail.
  await page.route("**/rest/v1/rpc/live_battle_vote", (route) =>
    route.fulfill({ status: 400, body: JSON.stringify({ message: "rate_limited:60" }) })
  );

  await page.goto(`/live/${battleId}`);
  await page.getByTestId("live-vote-opponent").click();
  await expect(page.getByTestId("live-vote-chip-failed")).toBeVisible({ timeout: 5000 });
});
