/**
 * E2E — CreateLiveBattleDialog surfaces an explicit error and does NOT
 * navigate to /live/:id when the create RPC fails.
 *
 * We route the Supabase PostgREST call for `create_live_battle` to a
 * synthesized 400 response so the client sees a real RPC failure. The
 * dialog must:
 *   1. Stay open.
 *   2. Show the error banner (`data-testid="create-battle-error"`).
 *   3. Leave the URL on `/battles` (no push to `/live/:id`).
 *   4. Re-enable the submit button for retry.
 */
import { test, expect } from "@playwright/test";
import { hasServiceRoleForLive } from "./helpers/liveBattleSeed";

test.describe("Live battle — Create RPC failure", () => {
  test.skip(!hasServiceRoleForLive(), "Requires seeded host A + opponent B.");

  test("Forced RPC failure keeps dialog open with error and blocks navigation", async ({ page }) => {
    // Intercept the create_live_battle RPC and force it to fail.
    await page.route("**/rest/v1/rpc/create_live_battle*", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          code: "P0001",
          message: "forced_failure_for_e2e",
          details: null,
          hint: null,
        }),
      });
    });

    // Sign in as host A.
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

    // Search opponent B by their known username, then pick the first result.
    const oppUsername = process.env.E2E_USER_B_USERNAME;
    test.skip(!oppUsername, "Requires E2E_USER_B_USERNAME to seed opponent search.");
    await page.getByTestId("opponent-search-input").fill(oppUsername!);
    const result = page.getByTestId("opponent-search-result").first();
    await expect(result).toBeVisible({ timeout: 5_000 });
    await result.click();
    await expect(page.getByTestId("selected-opponent")).toBeVisible();

    // Submit — the routed RPC will 400.
    const submit = page.getByTestId("create-battle-submit");
    await expect(submit).toBeEnabled();
    await submit.click();

    // Error banner appears, dialog stays open, URL is still /battles.
    const err = page.getByTestId("create-battle-error");
    await expect(err).toBeVisible({ timeout: 8_000 });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/battles(\/|$|\?)/);

    // Submit re-enables for retry.
    await expect(submit).toBeEnabled();

    // Never navigated to /live/:id.
    expect(page.url()).not.toMatch(/\/live\//);
  });
});
