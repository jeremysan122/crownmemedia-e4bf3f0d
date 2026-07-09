/**
 * admin_user_growth_summary — role gating.
 *
 * Confirms the RPC is admin-only:
 *   - anon: blocked
 *   - normal authenticated user: blocked
 *   - moderator: blocked (per launch decision — admin-only)
 *   - admin: allowed
 *
 * Skipped unless test users are configured. Run with:
 *   bunx vitest run src/lib/__tests__/userGrowthGating.test.ts
 *
 * Optional env (each tier is independently skipped if creds missing):
 *   TEST_USER_A_EMAIL / TEST_USER_A_PASSWORD   (normal user)
 *   TEST_MODERATOR_EMAIL / TEST_MODERATOR_PASSWORD
 *   TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD
 */
import { describe, it, expect } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

const hasBase = !!(URL && ANON);
const d = hasBase ? describe : describe.skip;

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(URL!, ANON!);
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return c;
}

d("admin_user_growth_summary — role gating", () => {
  it("anon call is blocked", async () => {
    const anon = createClient(URL!, ANON!);
    const { error } = await anon.rpc("admin_user_growth_summary" as never);
    expect(error).toBeTruthy();
  });

  const NORMAL = process.env.TEST_USER_A_EMAIL && process.env.TEST_USER_A_PASSWORD;
  (NORMAL ? it : it.skip)("normal authenticated user is blocked", async () => {
    const c = await signIn(process.env.TEST_USER_A_EMAIL!, process.env.TEST_USER_A_PASSWORD!);
    const { error } = await c.rpc("admin_user_growth_summary" as never);
    expect(error).toBeTruthy();
    expect(error?.message?.toLowerCase()).toMatch(/not_authorized|permission|forbidden/);
  });

  const MOD = process.env.TEST_MODERATOR_EMAIL && process.env.TEST_MODERATOR_PASSWORD;
  (MOD ? it : it.skip)("moderator is blocked (admin-only)", async () => {
    const c = await signIn(process.env.TEST_MODERATOR_EMAIL!, process.env.TEST_MODERATOR_PASSWORD!);
    const { error } = await c.rpc("admin_user_growth_summary" as never);
    expect(error).toBeTruthy();
    expect(error?.message?.toLowerCase()).toMatch(/not_authorized/);
  });

  const ADMIN = process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD;
  (ADMIN ? it : it.skip)("admin can call it and receives a summary shape", async () => {
    const c = await signIn(process.env.TEST_ADMIN_EMAIL!, process.env.TEST_ADMIN_PASSWORD!);
    const { data, error } = await c.rpc("admin_user_growth_summary" as never);
    expect(error).toBeNull();
    const row = data as Record<string, unknown>;
    expect(row).toBeTruthy();
    expect(typeof row.total_users).toBe("number");
    expect(row.goal_users).toBe(1_000_000);
    expect(Number(row.percent_complete)).toBeLessThanOrEqual(100);
    expect(Number(row.users_remaining)).toBeGreaterThanOrEqual(0);
  });
});
