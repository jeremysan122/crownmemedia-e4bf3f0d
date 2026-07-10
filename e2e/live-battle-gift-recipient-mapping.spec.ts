/**
 * E2E — Live battle gift popups map to the correct side (host vs opponent)
 * and preserve the gift category across MULTIPLE consecutive events.
 *
 * Sends: low→opponent, low→host, mid→opponent, mid→host, and asserts each
 * popup renders with the expected data-recipient / data-side / data-category
 * attributes and stays consistent as new popups arrive.
 *
 * Requires service-role + seeded users A/B/C. Skipped on Lovable Cloud.
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

interface GiftPlan {
  giftId: string;
  category: "low" | "mid" | "high" | "elite";
  recipient: "host" | "opponent";
  side: "left" | "right";
}

// Ordered plan — same order the popups should render in.
const PLAN: GiftPlan[] = [
  { giftId: "flower_daisy", category: "low",  recipient: "opponent", side: "right" },
  { giftId: "flower_daisy", category: "low",  recipient: "host",     side: "left"  },
  { giftId: "flower_daisy", category: "low",  recipient: "opponent", side: "right" },
  { giftId: "flower_daisy", category: "low",  recipient: "host",     side: "left"  },
];

test.describe("Live battle gifts — recipient + category mapping across events", () => {
  test.skip(!HAS_SERVICE_ROLE, "Requires service-role + seeded users A/B/C.");

  test("Consecutive gift popups show the right side and category", async ({ page }) => {
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
        room_name: `e2e-giftmap-${now}`,
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
      { user_id: C, shekel_balance: 500_000 },
      { onConflict: "user_id" },
    );

    try {
      await page.goto("/auth");
      await page.getByLabel(/email/i).fill(process.env.E2E_USER_C_EMAIL!);
      await page.getByLabel(/password/i).fill(process.env.E2E_USER_C_PASSWORD!);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL(/\/(feed|scrolls|me|battles)/, { timeout: 15_000 });

      await page.goto(`/live/${battleId}`);
      await expect(page.getByTestId("live-gift-overlay")).toBeVisible({ timeout: 15_000 });

      for (const step of PLAN) {
        const recipientId = step.recipient === "host" ? A : B;
        const res = await page.evaluate(
          async (args: { battleId: string; giftId: string; recipientId: string }) => {
            const mod = await import("/src/integrations/supabase/client.ts");
            const { supabase } = mod as { supabase: import("@supabase/supabase-js").SupabaseClient };
            const { error } = await supabase.rpc("send_live_battle_gift" as never, {
              _battle_id: args.battleId,
              _gift_id: args.giftId,
              _recipient_id: args.recipientId,
              _quantity: 1,
              _dedupe_key: crypto.randomUUID(),
            } as never);
            return error ? { error: error.message } : { ok: true };
          },
          { battleId, giftId: step.giftId, recipientId },
        );
        expect(res).toEqual({ ok: true });

        // The freshest popup on that side should match this step.
        const sidePopup = page
          .locator(`[data-testid="live-gift-popup"][data-side="${step.side}"]`)
          .last();
        await expect(sidePopup).toBeVisible({ timeout: 8_000 });
        await expect(sidePopup).toHaveAttribute("data-recipient", step.recipient);
        await expect(sidePopup).toHaveAttribute("data-side", step.side);
        await expect(sidePopup).toHaveAttribute("data-gift-category", step.category);
        await expect(sidePopup).toHaveAttribute("data-gift-id", step.giftId);
      }

      // Verify DB parity — one row per gift, each on the correct recipient.
      const { data: rows } = await admin
        .from("live_battle_gifts")
        .select("recipient_id, gift_id")
        .eq("battle_id", battleId)
        .order("created_at", { ascending: true });
      expect(rows).toHaveLength(PLAN.length);
      rows?.forEach((r, i) => {
        const expected = PLAN[i].recipient === "host" ? A : B;
        expect(r.recipient_id).toBe(expected);
        expect(r.gift_id).toBe(PLAN[i].giftId);
      });
    } finally {
      await admin.from("live_battle_gifts").delete().eq("battle_id", battleId);
      await admin.from("live_battles").delete().eq("id", battleId);
    }
  });
});
