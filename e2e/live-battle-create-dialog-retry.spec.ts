// When create_live_battle fails, CreateLiveBattleDialog must:
//  - show an explicit inline error,
//  - offer a Retry button,
//  - keep the dialog open,
//  - and NOT navigate to /live/:id.
import { test, expect } from "@playwright/test";
import { signInAsSeed, ensureAnySeedUser } from "./helpers/liveBattleSeed";

test.skip(
  !process.env.E2E_USER_A_EMAIL ||
    !process.env.E2E_USER_A_PASSWORD ||
    !process.env.E2E_USER_B_EMAIL ||
    !process.env.E2E_USER_B_PASSWORD ||
    !process.env.E2E_USER_B_USERNAME,
  "Requires seeded host and opponent credentials.",
);

test("acceptance RPC failure surfaces retry and blocks navigation", async ({ page }) => {
  const { user, opponent } = await ensureAnySeedUser();
  await signInAsSeed(page, user);

  // Route create_live_battle to a hard failure.
  let calls = 0;
  await page.route("**/rest/v1/rpc/create_live_battle", (route) => {
    calls += 1;
    return route.fulfill({ status: 400, body: JSON.stringify({ message: "token_mint_failed" }) });
  });

  await page.goto("/battles");
  await page.getByRole("button", { name: /go live|start live/i }).first().click();

  const dialog = page.getByTestId("create-live-battle-dialog");
  await expect(dialog).toBeVisible();

  await page.getByTestId("opponent-search-input").fill(opponent.username);
  await page.getByTestId("opponent-search-result").first().click();
  await page.getByTestId("create-battle-submit").click();

  await expect(page.getByTestId("create-battle-error")).toBeVisible();
  await expect(page.getByTestId("create-battle-retry")).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/battles$/);

  await page.getByTestId("create-battle-retry").click();
  await expect(page.getByTestId("create-battle-error")).toBeVisible();
  await expect(page).toHaveURL(/\/battles$/);
  expect(calls).toBeGreaterThanOrEqual(2);
});
