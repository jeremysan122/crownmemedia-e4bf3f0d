/**
 * E2E — CreateLiveBattleDialog failure cases.
 *
 *   1. Submit is disabled until an opponent is selected — clicking has
 *      no navigation side-effect.
 *   2. Searching for a nonsense username shows the empty-state copy.
 *
 * Both cases keep the dialog open and leave the user in `/battles`.
 */
import { test, expect } from "@playwright/test";
import { hasServiceRoleForLive } from "./helpers/liveBattleSeed";

test.describe("Live battle — Create dialog error UI", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded host A.");
  test.skip(
    !process.env.E2E_USER_A_EMAIL || !process.env.E2E_USER_A_PASSWORD,
    "Requires E2E_USER_A_EMAIL/PASSWORD for host sign-in.",
  );

  test("Submit is blocked without an opponent; missing username shows empty state", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel(/email/i).fill(process.env.E2E_USER_A_EMAIL!);
    await page.getByLabel(/password/i).fill(process.env.E2E_USER_A_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });

    await page.goto("/battles");
    await page.getByTestId("go-live-cta-hub").or(
      page.getByRole("button", { name: /go live battle|start live battle|new live battle/i }).first(),
    ).click();

    const dialog = page.getByTestId("create-live-battle-dialog");
    await expect(dialog).toBeVisible();

    // 1. Submit disabled with no opponent selected.
    const submit = page.getByTestId("create-battle-submit");
    await expect(submit).toBeDisabled();

    // 2. Search a username that definitely doesn't exist — empty state.
    const gibberish = `zz-notreal-${Date.now().toString(36)}`;
    await page.getByTestId("opponent-search-input").fill(gibberish);
    await expect(page.getByTestId("opponent-search-loading")).toBeVisible();
    await expect(page.getByTestId("opponent-search-empty")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("opponent-search-results")).toHaveCount(0);

    // Submit still disabled — nothing was picked, URL stayed on /battles.
    await expect(submit).toBeDisabled();
    expect(page.url()).toMatch(/\/battles(\/|$|\?)/);
  });
});
