/**
 * End-to-end backend tests for the Invite & Royal Pass referral logic.
 *
 * Covers:
 *   - Successful redemption awards +200 shekels to BOTH inviter and invitee
 *   - Self-invite is rejected
 *   - Double redemption returns { already_redeemed: true } and never double-pays
 *   - Empty / unknown / too-short codes are rejected
 *   - grant_pass_invite_bonus is a no-op until BOTH sides have an active pass
 *   - When both sides are active, both subscriptions get +30 days and the
 *     redemption row is marked pass_rewarded=true (idempotent on second call)
 *
 * The test creates two throwaway auth users via the service-role admin API,
 * runs all assertions, then deletes them so we never pollute production data.
 *
 * IMPORTANT: This test requires SUPABASE_SERVICE_ROLE_KEY in the env. It is
 * loaded automatically by Lovable's edge-function test runner.
 */
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")
  ?? Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")
  ?? Deno.env.get("VITE_SUPABASE_ANON_KEY")!;

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  throw new Error("Test env missing SUPABASE_URL / SERVICE_ROLE / ANON keys");
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface TestUser {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
}

async function createTestUser(label: string): Promise<TestUser> {
  const email = `invite-${label}-${crypto.randomUUID()}@test.crownme.local`;
  const password = `Test!${crypto.randomUUID().slice(0, 12)}`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: {
      username: `t_${label}_${Date.now().toString(36)}`,
      city: "Atlanta", state: "Georgia", country: "USA",
      dob: "1995-01-01",
      policies_accepted: true,
    },
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  // Ensure profile row exists (handle_new_user trigger should create it, but
  // some test envs are slow — back-fill defensively).
  await admin.from("profiles").upsert({
    id: data.user.id,
    username: `t_${label}_${data.user.id.slice(0, 6)}`,
    city: "Atlanta", state: "Georgia", country: "USA",
  }, { onConflict: "id" });

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`signIn failed: ${signInErr.message}`);
  return { id: data.user.id, email, password, client };
}

async function cleanup(userIds: string[]) {
  for (const uid of userIds) {
    try {
      await admin.from("invite_redemptions").delete().or(`inviter_id.eq.${uid},invitee_id.eq.${uid}`);
      await admin.from("invite_codes").delete().eq("user_id", uid);
      await admin.from("shekel_ledger").delete().eq("user_id", uid);
      await admin.from("notifications").delete().eq("user_id", uid);
      await admin.from("royal_pass_subscriptions").delete().eq("user_id", uid);
      await admin.from("wallets" as never).delete().eq("user_id" as never, uid as never);
      await admin.auth.admin.deleteUser(uid);
    } catch { /* best effort */ }
  }
}

async function getWalletBalance(uid: string): Promise<number> {
  const { data } = await admin.from("wallets" as never)
    .select("shekel_balance" as never).eq("user_id" as never, uid as never).maybeSingle();
  // deno-lint-ignore no-explicit-any
  return Number((data as any)?.shekel_balance ?? 0);
}

Deno.test({
  name: "invite system: signup bonus, self-invite, double-redeem, +30d Pass bonus",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const inviter = await createTestUser("inv");
    const invitee = await createTestUser("vee");
    const created = [inviter.id, invitee.id];

    try {
      // 1. Inviter mints their code
      const { data: code, error: codeErr } = await inviter.client.rpc("get_or_create_my_invite_code");
      assertEquals(codeErr, null, `code error: ${codeErr?.message}`);
      assertExists(code);
      assert(typeof code === "string" && code.length >= 6);

      // 2. Self-invite must be rejected
      const self = await inviter.client.rpc("redeem_invite_code", { _code: code });
      assert(self.error, "self-invite should error");
      assert(/yourself/i.test(self.error?.message ?? ""), `unexpected msg: ${self.error?.message}`);

      // 3. Unknown code must be rejected
      const bad = await invitee.client.rpc("redeem_invite_code", { _code: "ZZZZZZZZ" });
      assert(bad.error, "unknown code should error");
      assert(/not found/i.test(bad.error?.message ?? ""));

      // 4. Too-short code must be rejected
      const tiny = await invitee.client.rpc("redeem_invite_code", { _code: "AB" });
      assert(tiny.error, "short code should error");

      // 5. Successful redemption — both wallets get +200
      const inviterBefore = await getWalletBalance(inviter.id);
      const inviteeBefore = await getWalletBalance(invitee.id);
      const ok = await invitee.client.rpc("redeem_invite_code", { _code: code });
      assertEquals(ok.error, null, `redeem error: ${ok.error?.message}`);
      // deno-lint-ignore no-explicit-any
      const okData = ok.data as any;
      assertEquals(okData?.ok, true);
      assertEquals(Number(okData?.shekels_awarded), 200);

      const inviterAfter = await getWalletBalance(inviter.id);
      const inviteeAfter = await getWalletBalance(invitee.id);
      assertEquals(inviterAfter - inviterBefore, 200, "inviter should get +200");
      assertEquals(inviteeAfter - inviteeBefore, 200, "invitee should get +200");

      // 6. Double redemption returns already_redeemed and does NOT pay again
      const dup = await invitee.client.rpc("redeem_invite_code", { _code: code });
      assertEquals(dup.error, null);
      // deno-lint-ignore no-explicit-any
      assertEquals((dup.data as any)?.already_redeemed, true);
      const inviteeAfter2 = await getWalletBalance(invitee.id);
      assertEquals(inviteeAfter2, inviteeAfter, "no double-pay on duplicate redeem");

      // 7. Pass bonus: insert active subscriptions for BOTH and call helper.
      const periodEnd = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
      await admin.from("royal_pass_subscriptions").insert([
        { user_id: inviter.id, status: "active", current_period_end: periodEnd, stripe_subscription_id: `sub_test_${inviter.id}` },
        { user_id: invitee.id, status: "active", current_period_end: periodEnd, stripe_subscription_id: `sub_test_${invitee.id}` },
      ]);

      // grant_pass_invite_bonus is service-role only — call via admin client
      const grant1 = await admin.rpc("grant_pass_invite_bonus", { _user_id: invitee.id });
      assertEquals(grant1.error, null, `grant err: ${grant1.error?.message}`);

      const { data: redRow } = await admin.from("invite_redemptions")
        .select("pass_rewarded").eq("invitee_id", invitee.id).maybeSingle();
      assertEquals(redRow?.pass_rewarded, true, "redemption should be marked pass_rewarded");

      // Both subscriptions should be extended by ~30 days
      const { data: subs } = await admin.from("royal_pass_subscriptions")
        .select("user_id, current_period_end").in("user_id", [inviter.id, invitee.id]);
      assert(subs && subs.length === 2);
      const baseMs = new Date(periodEnd).getTime();
      const expectedMs = baseMs + 30 * 24 * 3600 * 1000;
      for (const s of subs) {
        const got = new Date(s.current_period_end as string).getTime();
        // allow 5s clock drift either way
        assert(Math.abs(got - expectedMs) < 5_000, `expected +30d, got ${got - baseMs}ms`);
      }

      // 8. Idempotency — calling grant a second time must not re-extend
      const before2 = (await admin.from("royal_pass_subscriptions")
        .select("current_period_end").eq("user_id", invitee.id).maybeSingle()).data?.current_period_end as string;
      await admin.rpc("grant_pass_invite_bonus", { _user_id: invitee.id });
      const after2 = (await admin.from("royal_pass_subscriptions")
        .select("current_period_end").eq("user_id", invitee.id).maybeSingle()).data?.current_period_end as string;
      assertEquals(before2, after2, "grant_pass_invite_bonus must be idempotent");
    } finally {
      await cleanup(created);
    }
  },
});

Deno.test({
  name: "invite system: pass bonus blocked when only one side has active Pass",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const inviter = await createTestUser("inv2");
    const invitee = await createTestUser("vee2");
    const created = [inviter.id, invitee.id];

    try {
      const { data: code } = await inviter.client.rpc("get_or_create_my_invite_code");
      await invitee.client.rpc("redeem_invite_code", { _code: code });

      // Only invitee subscribes
      await admin.from("royal_pass_subscriptions").insert({
        user_id: invitee.id, status: "active",
        current_period_end: new Date(Date.now() + 7 * 86400_000).toISOString(),
        stripe_subscription_id: `sub_solo_${invitee.id}`,
      });

      const r = await admin.rpc("grant_pass_invite_bonus", { _user_id: invitee.id });
      assertEquals(r.error, null);
      const { data: row } = await admin.from("invite_redemptions")
        .select("pass_rewarded").eq("invitee_id", invitee.id).maybeSingle();
      assertEquals(row?.pass_rewarded, false, "must NOT mark pass_rewarded when only one side active");
    } finally {
      await cleanup(created);
    }
  },
});
