/**
 * End-to-end: viewer sends a gift while a live battle is running and the
 * TikTok-style popup appears on screen immediately (realtime overlay).
 *
 * Flow:
 *   1. Admin seeds a `live_battles` row in `live` status with host A vs
 *      opponent B and enough wallet balance on voter C to send a cheap gift.
 *   2. Voter C signs in, opens /live/:id, opens the gift picker and taps
 *      the cheapest gift → RPC send_live_battle_gift.
 *   3. Asserts the floating popup (data-testid=live-gift-popup) shows up on
 *      screen within a few seconds without a page reload.
 *
 * Skipped on Lovable Cloud (no service-role key available).
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const HAS_SERVICE_ROLE =
  !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !!process.env.SUPABASE_URL &&
  !!process.env.E2E_USER_A_ID &&
  !!process.env.E2E_USER_B_ID &&
  !!process.env.E2E_USER_C_EMAIL &&
  !!process.env.E2E_USER_C_PASSWORD &&
  !!process.env.E2E_USER_C_ID;

test.describe("Live battle gift → popup appears in realtime", () => {
  test.skip(!HAS_SERVICE_ROLE, "Requires service-role + seeded users A/B/C.");

  test("Viewer C sends gift, popup renders on screen", async ({ page }) => {
    const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const A = process.env.E2E_USER_A_ID!;
    const B = process.env.E2E_USER_B_ID!;
    const C = process.env.E2E_USER_C_ID!;

    // Seed a live battle in `live` status.
    const now = Date.now();
    const { data: battle, error: bErr } = await admin
      .from("live_battles")
      .insert({
        host_id: A,
        opponent_id: B,
        room_name: `e2e-${now}`,
        status: "live",
        started_at: new Date(now).toISOString(),
        ends_at: new Date(now + 15 * 60 * 1000).toISOString(),
        duration_seconds: 900,
      })
      .select("id")
      .single();
    if (bErr || !battle) throw bErr ?? new Error("live_battle_seed_failed");
    const battleId = battle.id as string;

    // Ensure voter C has wallet balance for at least the cheapest gift.
    await admin.from("wallets").upsert(
      { user_id: C, shekel_balance: 10_000 },
      { onConflict: "user_id" },
    );

    try {
      // Sign in as voter C.
      await page.goto("/auth");
      await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
      await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });

      await page.goto(`/live/${battleId}`);
      await expect(page.getByRole("button", { name: /send gift/i })).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: /send gift/i }).click();

      // First gift in the picker grid = cheapest of the active category.
      const firstGift = page.locator('[role="dialog"] button', { hasText: /\d/ }).first();
      await firstGift.click();

      // Overlay popup should render within 5s from the realtime INSERT.
      await expect(page.getByTestId("live-gift-popup").first()).toBeVisible({ timeout: 8_000 });
    } finally {
      await admin.from("live_battle_gifts").delete().eq("battle_id", battleId);
      await admin.from("live_battles").delete().eq("id", battleId);
    }
  });
});
