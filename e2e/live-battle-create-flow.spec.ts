/**
 * E2E — Full Create/Start Live Battle flow.
 *
 * Signs in as host (user A), opens the Create Live Battle dialog from the
 * Battles hub, picks opponent (user B) by username, submits, and verifies:
 *   1. Immediate navigation to `/live/:battleId`.
 *   2. A `pending` live_battles row exists in the DB with host=A opponent=B.
 *   3. The pending screen shows the "Waiting for opponent" copy for the host.
 *
 * Then flips the battle to `live` via admin (simulating opponent accept) and
 * verifies the arena renders the live header + running countdown timer.
 */
import { test, expect } from "@playwright/test";
import {
  adminClient,
  hasServiceRoleForLive,
  teardownLiveBattle,
} from "./helpers/liveBattleSeed";

test.describe("Live battle — create + start flow", () => {
  test.skip(!hasServiceRoleForLive(), "Requires service-role + seeded users A/B.");
  test.skip(
    !process.env.E2E_USER_A_EMAIL || !process.env.E2E_USER_A_PASSWORD,
    "Requires E2E_USER_A_EMAIL/PASSWORD for host sign-in.",
  );

  test("Host creates a live battle and enters the arena when it goes live", async ({ page }) => {
    const admin = adminClient();
    const A = process.env.E2E_USER_A_ID!;
    const B = process.env.E2E_USER_B_ID!;

    // Look up B's username so we can search for them in the dialog.
    const { data: opponent } = await admin
      .from("profiles").select("username").eq("id", B).maybeSingle();
    const opponentUsername = (opponent?.username as string | undefined) ?? "";
    test.skip(!opponentUsername, "Opponent B has no username to search for.");

    let createdBattleId: string | null = null;
    try {
      await page.goto("/auth");
      await page.getByLabel(/email/i).fill(process.env.E2E_USER_A_EMAIL!);
      await page.getByLabel(/password/i).fill(process.env.E2E_USER_A_PASSWORD!);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });

      // Open the hub and start the create dialog.
      await page.goto("/battles");
      await page.getByTestId("go-live-cta-hub").or(
        page.getByRole("button", { name: /go live battle|start live battle|new live battle/i }).first(),
      ).click();

      // Search + pick opponent.
      const search = page.getByPlaceholder(/search by username/i);
      await search.fill(opponentUsername);
      await page.getByRole("button", { name: new RegExp(`@?${opponentUsername}`, "i") }).click();

      // Submit — dialog should navigate to /live/:id.
      await page.getByRole("button", { name: /start battle/i }).click();
      await page.waitForURL(/\/live\/[0-9a-f-]{36}/, { timeout: 10_000 });

      const url = new URL(page.url());
      createdBattleId = url.pathname.split("/").pop() || null;
      expect(createdBattleId).toBeTruthy();

      // DB row exists with correct participants + pending status.
      const { data: row } = await admin
        .from("live_battles")
        .select("id, host_id, opponent_id, status")
        .eq("id", createdBattleId!)
        .maybeSingle();
      expect(row).toBeTruthy();
      expect(row!.host_id).toBe(A);
      expect(row!.opponent_id).toBe(B);
      expect(row!.status).toBe("pending");

      // Host sees "Waiting for opponent" copy on the pending screen.
      await expect(
        page.getByText(/waiting for opponent|invite pending/i),
      ).toBeVisible({ timeout: 8_000 });

      // Simulate opponent accepting: flip to live with a countdown window.
      const now = Date.now();
      await admin.from("live_battles").update({
        status: "live",
        started_at: new Date(now).toISOString(),
        ends_at: new Date(now + 5 * 60 * 1000).toISOString(),
      }).eq("id", createdBattleId!);

      // The arena header appears — LIVE badge + a MM:SS timer.
      await expect(page.getByText(/^LIVE$/)).toBeVisible({ timeout: 10_000 });
      await expect(page.locator("text=/^\\d+:\\d{2}$/").first()).toBeVisible({ timeout: 10_000 });
    } finally {
      if (createdBattleId) await teardownLiveBattle(createdBattleId);
    }
  });
});
