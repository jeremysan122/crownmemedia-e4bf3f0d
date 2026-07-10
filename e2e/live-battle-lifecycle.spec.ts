/**
 * E2E: Live Battle full lifecycle.
 *
 * Flow (driven by two browser contexts + a service-role admin client that
 * seeds the initial pending row and force-ends the battle at the finale
 * so we don't require real LiveKit media in a headless browser):
 *
 *   1. Admin seeds a `pending` live_battles row (host=A, opponent=B).
 *   2. User B lands on /battles, sees the "You've been challenged" invite,
 *      clicks Accept → status flips to `live`, routes to /live/:id.
 *   3. User A opens /live/:id and lands on the live view.
 *   4. Admin force-ends the battle (bypasses LiveKit teardown).
 *   5. Both viewers' rooms auto-transition to the ended/results screen.
 *
 * Skipped unless service-role + two seeded users are exported — the same
 * pattern as e2e/scrolls-repost-undo.spec.ts.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const HAS = !!(
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.VITE_SUPABASE_URL &&
  process.env.E2E_USER_A_EMAIL &&
  process.env.E2E_USER_A_PASSWORD &&
  process.env.E2E_USER_B_EMAIL &&
  process.env.E2E_USER_B_PASSWORD
);

let admin: SupabaseClient | null = null;
function adminClient(): SupabaseClient {
  if (admin) return admin;
  admin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return admin;
}

async function findUserIdByEmail(email: string): Promise<string> {
  const cli = adminClient();
  let page = 1;
  // paginate — same pattern as e2e/seed.ts
  while (true) {
    const { data, error } = await cli.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit.id;
    if (data.users.length < 200) throw new Error(`User not found: ${email}`);
    page += 1;
  }
}

async function signIn(page: Page, email: string, pw: string) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(pw);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(feed|scrolls|me|onboarding)/, { timeout: 15_000 });
}

test.describe("Live Battle — full lifecycle", () => {
  test.skip(
    !HAS,
    [
      "Requires service-role + two seeded users (not available on Lovable Cloud).",
      "To run locally or in CI, export:",
      "  SUPABASE_SERVICE_ROLE_KEY=<key>",
      "  VITE_SUPABASE_URL=<url>",
      "  E2E_USER_A_EMAIL=<host@example.com>   E2E_USER_A_PASSWORD=<pw>",
      "  E2E_USER_B_EMAIL=<opp@example.com>    E2E_USER_B_PASSWORD=<pw>",
      "then run: bunx playwright test e2e/live-battle-lifecycle.spec.ts",
    ].join("\n"),
  );

  test("invite → accept → live → force-end → results, on both sides", async ({ browser }) => {
    const cli = adminClient();
    const hostId = await findUserIdByEmail(process.env.E2E_USER_A_EMAIL!);
    const oppId = await findUserIdByEmail(process.env.E2E_USER_B_EMAIL!);

    // Ensure the live-battles feature flag is on for this run.
    await cli.from("feature_flags").upsert(
      { key: "live_battles_enabled", enabled: true },
      { onConflict: "key" },
    );

    // Seed a pending battle directly (INSERT on live_battles is revoked
    // for authenticated but allowed for service_role).
    const roomName = `e2e_live_${Date.now()}`;
    const { data: seeded, error: seedErr } = await cli
      .from("live_battles")
      .insert({
        host_id: hostId,
        opponent_id: oppId,
        room_name: roomName,
        status: "pending",
        duration_seconds: 180,
        host_votes: 0,
        opponent_votes: 0,
      })
      .select("id")
      .single();
    if (seedErr) throw seedErr;
    const battleId = seeded.id as string;

    try {
      // ── Opponent (B) accepts the invite from the hub ────────────────────
      const bCtx = await browser.newContext();
      const bPage = await bCtx.newPage();
      await signIn(bPage, process.env.E2E_USER_B_EMAIL!, process.env.E2E_USER_B_PASSWORD!);
      await bPage.goto("/battles");

      await expect(bPage.getByText(/You've been challenged/i)).toBeVisible();
      await bPage.getByRole("button", { name: /^Accept/i }).click();
      await bPage.waitForURL(new RegExp(`/live/${battleId}`), { timeout: 15_000 });

      // Server should have flipped status to 'live'
      const { data: afterAccept } = await cli
        .from("live_battles")
        .select("status")
        .eq("id", battleId)
        .maybeSingle();
      expect(afterAccept?.status).toBe("live");

      // ── Host (A) opens the live view ────────────────────────────────────
      const aCtx = await browser.newContext();
      const aPage = await aCtx.newPage();
      await signIn(aPage, process.env.E2E_USER_A_EMAIL!, process.env.E2E_USER_A_PASSWORD!);
      await aPage.goto(`/live/${battleId}`);
      // Page renders (LiveKit token mint may fail in headless — that's OK,
      // we just want the room shell to be present, not the media surface).
      await expect(aPage.locator("body")).toContainText(/live/i);

      // ── Admin force-end (bypasses LiveKit teardown) ─────────────────────
      await cli
        .from("live_battles")
        .update({
          status: "ended",
          ends_at: new Date().toISOString(),
          ended_reason: "e2e_force_end",
          winner_id: hostId,
          host_votes: 3,
          opponent_votes: 1,
        })
        .eq("id", battleId);

      // Both browsers should transition to the ended/results state via the
      // realtime channel the LiveBattle page subscribes to.
      await expect(aPage.getByText(/ended|winner|results/i).first())
        .toBeVisible({ timeout: 15_000 });
      await expect(bPage.getByText(/ended|winner|results/i).first())
        .toBeVisible({ timeout: 15_000 });

      // No raw backend errors leaked on either side.
      for (const p of [aPage, bPage]) {
        const body = (await p.locator("body").innerText()).toLowerCase();
        expect(body).not.toContain("pgrst");
        expect(body).not.toContain("permission denied");
      }

      await aCtx.close();
      await bCtx.close();
    } finally {
      // Cleanup — never leave dangling test rows.
      await cli.from("live_battles").delete().eq("id", battleId);
    }
  });
});
