// Accessibility: after a failed create_live_battle acceptance RPC, the
// Retry button must receive focus and the dialog must remain open with no
// navigation to /live/:id.
import { test, expect } from "@playwright/test";
import { signInAsSeed, ensureAnySeedUser } from "./helpers/liveBattleSeed";

test("failed acceptance RPC focuses Retry and keeps dialog open", async ({ page }) => {
  const { user, opponent } = await ensureAnySeedUser();
  await signInAsSeed(page, user);

  await page.route("**/rest/v1/rpc/create_live_battle", (route) =>
    route.fulfill({ status: 400, body: JSON.stringify({ message: "token_mint_failed" }) })
  );

  await page.goto("/battles");
  await page.getByRole("button", { name: /go live|start live/i }).first().click();

  const dialog = page.getByTestId("create-live-battle-dialog");
  await expect(dialog).toBeVisible();

  await page.getByTestId("opponent-search-input").fill(opponent.username);
  await page.getByTestId("opponent-search-result").first().click();
  await page.getByTestId("create-battle-submit").click();

  const retry = page.getByTestId("create-battle-retry");
  await expect(retry).toBeVisible();

  // Retry receives focus for keyboard/screen-reader users.
  await expect(retry).toBeFocused();

  // Dialog stays open and URL is unchanged — no navigation to /live/:id.
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/battles$/);

  // The error region is announced as an alert.
  await expect(page.getByTestId("create-battle-error")).toHaveAttribute("role", "alert");
});
