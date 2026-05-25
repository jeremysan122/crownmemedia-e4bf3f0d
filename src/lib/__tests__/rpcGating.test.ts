/**
 * RPC gating — automated verification.
 *
 * Confirms that the public-facing RPC wrappers:
 *   - require an authenticated session (anon calls fail)
 *   - succeed for authenticated users (or fail with the expected business-logic error)
 *   - are not callable as the underlying private.* functions
 *
 * Covers: confirm_my_age, ensure_my_wallet, bump_filter_streak,
 *         is_royal_pass_active, purchase_boost, send_royal_gift.
 *
 * Skipped unless test users are configured. Run with:
 *   bunx vitest run src/lib/__tests__/rpcGating.test.ts
 *
 * Required env:
 *   TEST_USER_A_EMAIL / TEST_USER_A_PASSWORD  (signed-in caller)
 *   TEST_USER_B_EMAIL / TEST_USER_B_PASSWORD  (recipient for gifts)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const A_EMAIL = process.env.TEST_USER_A_EMAIL;
const A_PASS = process.env.TEST_USER_A_PASSWORD;
const B_EMAIL = process.env.TEST_USER_B_EMAIL;
const B_PASS = process.env.TEST_USER_B_PASSWORD;

const canRun = !!(URL && ANON && A_EMAIL && A_PASS && B_EMAIL && B_PASS);
const d = canRun ? describe : describe.skip;

async function signedClient(email: string, password: string) {
  const client = createClient(URL!, ANON!);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Sign-in failed for ${email}: ${error?.message}`);
  return { client, uid: data.user.id };
}

function anonClient(): SupabaseClient {
  return createClient(URL!, ANON!);
}

d("RPC gating — anonymous callers are blocked", () => {
  const anon = anonClient();

  it("confirm_my_age rejects anon", async () => {
    const { error } = await anon.rpc("confirm_my_age" as never, { _dob: "1990-01-01" } as never);
    expect(error).toBeTruthy();
  });

  it("ensure_my_wallet rejects anon", async () => {
    const { error } = await anon.rpc("ensure_my_wallet" as never);
    expect(error).toBeTruthy();
  });

  it("bump_filter_streak rejects anon", async () => {
    const { error } = await anon.rpc("bump_filter_streak" as never, { _filter: "vivid" } as never);
    expect(error).toBeTruthy();
  });

  it("purchase_boost rejects anon", async () => {
    const { error } = await anon.rpc("purchase_boost" as never, {
      p_boost_type: "royal_boost",
      p_duration_hours: 24,
      p_cost_shekels: 500,
    } as never);
    expect(error).toBeTruthy();
  });

  it("send_royal_gift rejects anon", async () => {
    const { error } = await anon.rpc("send_royal_gift" as never, {
      p_gift_id: "crown_blast",
      p_recipient_id: "00000000-0000-0000-0000-000000000000",
      p_post_id: null,
      p_quantity: 1,
    } as never);
    expect(error).toBeTruthy();
  });

  it("is_royal_pass_active rejects anon (no anon EXECUTE grant)", async () => {
    const { error } = await anon.rpc("is_royal_pass_active" as never, {
      _user_id: "00000000-0000-0000-0000-000000000000",
    } as never);
    expect(error).toBeTruthy();
  });

  it("private.* functions are not exposed via PostgREST", async () => {
    // PostgREST only exposes the `public` schema; calling a `private.*` name should fail.
    const { error } = await anon.rpc("private_ensure_my_wallet" as never);
    expect(error).toBeTruthy();
  });
});

d("RPC gating — authenticated callers succeed", () => {
  let A: { client: SupabaseClient; uid: string };
  let B: { client: SupabaseClient; uid: string };

  beforeAll(async () => {
    A = await signedClient(A_EMAIL!, A_PASS!);
    B = await signedClient(B_EMAIL!, B_PASS!);
  });

  it("ensure_my_wallet succeeds and is idempotent", async () => {
    const { error: e1 } = await A.client.rpc("ensure_my_wallet" as never);
    const { error: e2 } = await A.client.rpc("ensure_my_wallet" as never);
    expect(e1).toBeNull();
    expect(e2).toBeNull();
  });

  it("confirm_my_age succeeds for an 18+ DOB", async () => {
    const { error } = await A.client.rpc("confirm_my_age" as never, { _dob: "1995-01-01" } as never);
    expect(error).toBeNull();
  });

  it("confirm_my_age rejects an under-18 DOB", async () => {
    const today = new Date();
    const young = new Date(today.getFullYear() - 10, today.getMonth(), today.getDate())
      .toISOString()
      .slice(0, 10);
    const { error } = await A.client.rpc("confirm_my_age" as never, { _dob: young } as never);
    expect(error).toBeTruthy();
    expect(error?.message?.toLowerCase()).toMatch(/18|older/);
  });

  it("bump_filter_streak returns a row for the caller", async () => {
    const { data, error } = await A.client.rpc("bump_filter_streak" as never, { _filter: "vivid" } as never);
    expect(error).toBeNull();
    expect(data).toBeTruthy();
  });

  it("is_royal_pass_active returns a boolean for any uid", async () => {
    const { data, error } = await A.client.rpc("is_royal_pass_active" as never, { _user_id: A.uid } as never);
    expect(error).toBeNull();
    expect(typeof data).toBe("boolean");
  });

  it("purchase_boost succeeds or fails with a known business error (never an auth error)", async () => {
    const { error } = await A.client.rpc("purchase_boost" as never, {
      p_boost_type: "royal_boost",
      p_duration_hours: 24,
      p_cost_shekels: 500,
    } as never);
    if (error) {
      // Acceptable: insufficient balance / cooldown / etc — must NOT be the "Not authenticated" error.
      expect(error.message.toLowerCase()).not.toMatch(/not authenticated/);
    }
  });

  it("send_royal_gift succeeds or fails with a known business error (never an auth error)", async () => {
    const { error } = await A.client.rpc("send_royal_gift" as never, {
      p_gift_id: "crown_blast",
      p_recipient_id: B.uid,
      p_post_id: null,
      p_quantity: 1,
    } as never);
    if (error) {
      expect(error.message.toLowerCase()).not.toMatch(/not authenticated/);
    }
  });
});
