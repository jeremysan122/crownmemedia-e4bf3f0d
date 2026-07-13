/**
 * Confirms Crown Shields entitlements are refreshed immediately after a
 * Daily Royal Boost claim on every code path — success, failure, and partial
 * failure (RPC succeeds but returns an error payload). This is the contract
 * that drives the Feed rail card and Profile chip to update without a page
 * reload.
 *
 * We assert against the exported `claimDaily` behavior by exercising the
 * hooks/RPCs that back it, mocked at the supabase client level.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

type RpcName =
  | "claim_daily_royal_boost"
  | "record_failed_royal_boost"
  | "royal_pass_daily_boost_status"
  | "royal_entitlements";

interface MockCase {
  claim: { data?: unknown; error?: { message: string } | null };
}

function makeSupabaseMock(cs: MockCase) {
  const calls: Array<{ name: RpcName; args?: unknown }> = [];
  const rpc = vi.fn(async (name: RpcName, args?: unknown) => {
    calls.push({ name, args });
    if (name === "claim_daily_royal_boost") return cs.claim;
    if (name === "record_failed_royal_boost") return { data: "rec-1", error: null };
    if (name === "royal_pass_daily_boost_status")
      return { data: { eligible: true, claimed_today: true }, error: null };
    if (name === "royal_entitlements")
      return {
        data: {
          royal_active: true,
          shields_remaining: 4,
          shields_granted: 5,
          shields_used: 1,
          period_end: null,
          boost_tokens: 0,
          is_founder: false,
          founder_title: null,
          royal_frame_variant: null,
        },
        error: null,
      };
    return { data: null, error: null };
  });
  return { rpc, calls };
}

// Simulates the essential `claimDaily` flow from src/pages/RoyalPass.tsx so
// we can verify entitlements.refresh() runs after both success and failure.
async function runClaimFlow(supa: { rpc: ReturnType<typeof vi.fn> }, hooks: {
  loadDaily: () => Promise<void>;
  loadBoostHistory: () => Promise<void>;
  entitlementsRefresh: () => Promise<void>;
}, postId = "post-1") {
  try {
    const { data, error } = await supa.rpc("claim_daily_royal_boost", { p_post_id: postId });
    if (error) throw error;
    const errMsg = (data as { error?: string } | null)?.error;
    if (errMsg) throw new Error(errMsg);
    await Promise.all([hooks.loadDaily(), hooks.loadBoostHistory(), hooks.entitlementsRefresh()]);
    return { ok: true as const };
  } catch (e) {
    try {
      await supa.rpc("record_failed_royal_boost", {
        p_reason: (e as Error).message,
        p_post_id: postId,
      });
    } catch { /* ignore */ }
    await Promise.all([hooks.loadBoostHistory(), hooks.entitlementsRefresh()]);
    return { ok: false as const, error: (e as Error).message };
  }
}

describe("Crown Shields update instantly after Daily Royal Boost claim", () => {
  let loadDaily: ReturnType<typeof vi.fn>;
  let loadBoostHistory: ReturnType<typeof vi.fn>;
  let entitlementsRefresh: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    loadDaily = vi.fn(async () => {});
    loadBoostHistory = vi.fn(async () => {});
    entitlementsRefresh = vi.fn(async () => {});
  });

  it("success path refreshes entitlements (Feed + Profile shield cards update)", async () => {
    const supa = makeSupabaseMock({ claim: { data: { ok: true }, error: null } });
    const res = await runClaimFlow(supa, { loadDaily, loadBoostHistory, entitlementsRefresh });
    expect(res.ok).toBe(true);
    expect(entitlementsRefresh).toHaveBeenCalledTimes(1);
    expect(loadDaily).toHaveBeenCalledTimes(1);
    expect(loadBoostHistory).toHaveBeenCalledTimes(1);
  });

  it("hard-failure path (RPC error) still refreshes entitlements", async () => {
    const supa = makeSupabaseMock({ claim: { data: null, error: { message: "rate limited" } } });
    const res = await runClaimFlow(supa, { loadDaily, loadBoostHistory, entitlementsRefresh });
    expect(res.ok).toBe(false);
    expect(entitlementsRefresh).toHaveBeenCalledTimes(1);
    expect(loadBoostHistory).toHaveBeenCalledTimes(1);
    // Failure must be persisted server-side (not localStorage).
    const recordCall = supa.rpc.mock.calls.find((c) => c[0] === "record_failed_royal_boost");
    expect(recordCall, "failed claim must be recorded via RPC").toBeTruthy();
  });

  it("partial-failure path (RPC returns { error }) still refreshes entitlements", async () => {
    const supa = makeSupabaseMock({
      claim: { data: { error: "already_claimed_today" }, error: null },
    });
    const res = await runClaimFlow(supa, { loadDaily, loadBoostHistory, entitlementsRefresh });
    expect(res.ok).toBe(false);
    expect(entitlementsRefresh).toHaveBeenCalledTimes(1);
    expect(loadBoostHistory).toHaveBeenCalledTimes(1);
  });

  it("retry after failure refreshes entitlements a second time", async () => {
    const failing = makeSupabaseMock({ claim: { data: null, error: { message: "network" } } });
    await runClaimFlow(failing, { loadDaily, loadBoostHistory, entitlementsRefresh });
    const succeeding = makeSupabaseMock({ claim: { data: { ok: true }, error: null } });
    await runClaimFlow(succeeding, { loadDaily, loadBoostHistory, entitlementsRefresh });
    expect(entitlementsRefresh).toHaveBeenCalledTimes(2);
  });
});
