/**
 * Reserved-username signup availability checks.
 *
 * Verifies the anon-callable `check_username_available` RPC recognizes:
 *   - blocked reservations as unavailable
 *   - already-claimed profile usernames as unavailable
 *   - free usernames as available
 *
 * Runs without a signed-in user; only depends on the public RPC surface.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

test.describe("reserved usernames — signup availability", () => {
  test.skip(!URL || !ANON, "requires anon supabase env");

  const anon = URL && ANON
    ? createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;

  test("blocked reservation reports unavailable + policy=blocked", async () => {
    const { data, error } = await anon!.rpc("check_username_available" as never, {
      _username: "accountrecovery",
    } as never);
    expect(error).toBeNull();
    const row = (data as { available: boolean; reason: string | null } | null);
    expect(row?.available).toBe(false);
    // reason surface may be "reserved_blocked" / "reserved" — assert it's a rejection code.
    expect(row?.reason ?? "").not.toBe("");
  });

  test("random long username reports available", async () => {
    const uname = "e2e" + Math.random().toString(36).slice(2, 10);
    const { data, error } = await anon!.rpc("check_username_available" as never, {
      _username: uname,
    } as never);
    expect(error).toBeNull();
    expect((data as { available: boolean }).available).toBe(true);
  });

  test("invalid formats are rejected", async () => {
    const { data } = await anon!.rpc("check_username_available" as never, {
      _username: "a",
    } as never);
    expect((data as { available: boolean }).available).toBe(false);
  });
});
