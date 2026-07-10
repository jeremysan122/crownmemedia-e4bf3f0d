/**
 * End-to-end: viewer sends a live-battle gift and the TikTok-style popup
 * renders on screen immediately with the correct recipient side and gift
 * category. Uses realtime — no page reload.
 *
 * We send a specific low-tier gift (`flower_daisy`) to the OPPONENT so the
 * spec can assert both the side (right / opponent) and the category tag
 * (`low`) baked into the popup's data-* attributes by LiveBattleGiftsOverlay.
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

test.describe("Live battle gift → popup recipient + category", () => {
  test.skip(!HAS_SERVICE_ROLE, "Requires service-role + seeded users A/B/C.");

  test("Popup shows correct recipient (opponent) and gift category (low)", async ({ page }) => {
    const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const A = process.env.E2E_USER_A_ID!;
    const B = process.env.E2E_USER_B_ID!;
    const C = process.env.E2E_USER_C_ID!;

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

    await admin.from("wallets").upsert(
      { user_id: C, shekel_balance: 10_000 },
      { onConflict: "user_id" },
    );

    try {
      // Sign in as viewer C.
      await page.goto("/auth");
      await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
      await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });

      // Open the live battle so LiveBattleGiftsOverlay subscribes to inserts.
      await page.goto(`/live/${battleId}`);
      await expect(page.getByTestId("live-gift-overlay")).toBeVisible({ timeout: 15_000 });

      // Send a specific low-tier gift to the OPPONENT via the RPC, so both
      // the recipient side and the gift category are known values.
      const rpcResult = await page.evaluate(
        async (args: { battleId: string; recipientId: string }) => {
          const mod = await import("/src/integrations/supabase/client.ts");
          const { supabase } = mod as { supabase: import("@supabase/supabase-js").SupabaseClient };
          const { error } = await supabase.rpc("send_live_battle_gift" as never, {
            _battle_id: args.battleId,
            _gift_id: "flower_daisy",
            _recipient_id: args.recipientId,
            _quantity: 1,
            _dedupe_key: crypto.randomUUID(),
          } as never);
          return error ? { error: error.message } : { ok: true };
        },
        { battleId, recipientId: B },
      );
      expect(rpcResult).toEqual({ ok: true });

      // The popup should appear within a few seconds from realtime INSERT.
      const popup = page.getByTestId("live-gift-popup").first();
      await expect(popup).toBeVisible({ timeout: 8_000 });

      // ── Assertions the user asked for: recipient side + gift category ──
      await expect(popup).toHaveAttribute("data-recipient", "opponent");
      await expect(popup).toHaveAttribute("data-side", "right");
      await expect(popup).toHaveAttribute("data-gift-category", "low");
      await expect(popup).toHaveAttribute("data-gift-id", "flower_daisy");
      // Popup shows the gift name copy on screen.
      await expect(popup).toContainText(/daisy/i);
    } finally {
      await admin.from("live_battle_gifts").delete().eq("battle_id", battleId);
      await admin.from("live_battles").delete().eq("id", battleId);
    }
  });
});
