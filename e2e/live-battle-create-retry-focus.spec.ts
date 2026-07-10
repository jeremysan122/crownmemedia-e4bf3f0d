// Accessibility: after a failed create_live_battle acceptance RPC, the
// Retry button must receive focus and the dialog must remain open with no
// navigation to /live/:id.
import { test, expect } from "@playwright/test";
import { adminClient, hasServiceRoleForLive } from "./helpers/liveBattleSeed";

test.describe("CreateLiveBattleDialog — Retry a11y focus", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users.");

  test("failed acceptance RPC focuses Retry and keeps dialog open", async ({ page }) => {
    // Route create_live_battle to a hard failure BEFORE user interaction.
    await page.route("**/rest/v1/rpc/create_live_battle", (route) =>
      route.fulfill({ status: 400, body: JSON.stringify({ message: "token_mint_failed" }) })
    );

    await page.goto("/auth");
    await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
    await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });

    // Look up opponent B's username so we can select them.
    const admin = adminClient();
    const { data: opp } = await admin
      .from("profiles").select("username").eq("id", process.env.E2E_USER_B_ID!).single();
    const opponentUsername = (opp as any)?.username as string;

    await page.goto("/battles");
    await page.getByRole("button", { name: /go live|start live/i }).first().click();

    const dialog = page.getByTestId("create-live-battle-dialog");
    await expect(dialog).toBeVisible();

    await page.getByTestId("opponent-search-input").fill(opponentUsername);
    await page.getByTestId("opponent-search-result").first().click();
    await page.getByTestId("create-battle-submit").click();

    const retry = page.getByTestId("create-battle-retry");
    await expect(retry).toBeVisible({ timeout: 5_000 });

    // Retry receives focus for keyboard/screen-reader users.
    await expect(retry).toBeFocused();

    // Dialog stays open and URL is unchanged — no navigation to /live/:id.
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/battles$/);

    // The error region is announced as an alert.
    await expect(page.getByTestId("create-battle-error")).toHaveAttribute("role", "alert");
  });
});
