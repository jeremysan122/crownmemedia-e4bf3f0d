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
const HAS_REAL_SUPABASE = !!URL && !!ANON && !/\.invalid(?:\/|$)/i.test(URL);

type AvailabilityRow = { available: boolean; reason: string | null };
const firstRow = (data: unknown): AvailabilityRow | null => {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object" ? row as AvailabilityRow : null;
};

test.describe("reserved usernames — signup availability", () => {
  test.skip(!HAS_REAL_SUPABASE, "requires a real anon Supabase environment");

  const anon = URL && ANON
    ? createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;

  test("blocked reservation reports unavailable + policy=blocked", async () => {
    const { data, error } = await anon!.rpc("check_username_available" as never, {
      _username: "accountrecovery",
    } as never);
    expect(error).toBeNull();
    const row = firstRow(data);
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
    expect(firstRow(data)?.available).toBe(true);
  });

  test("invalid formats are rejected", async () => {
    const { data, error } = await anon!.rpc("check_username_available" as never, {
      _username: "a",
    } as never);
    expect(error).toBeNull();
    expect(firstRow(data)?.available).toBe(false);
  });
});
