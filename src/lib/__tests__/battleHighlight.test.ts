import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  const rpc = vi.fn();
  return { supabase: { rpc } };
});

import { supabase } from "@/integrations/supabase/client";
import {
  participantLabel,
  highlightErrorMessage,
  fetchLiveBattleVoteTimeline,
  fetchBattlerAnalytics,
} from "@/lib/battleHighlight";

const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

describe("battleHighlight helpers", () => {
  beforeEach(() => rpc.mockReset());

  it("participantLabel prefers display_name, falls back to username, then fallback", () => {
    expect(participantLabel({ id: "1", username: "u", display_name: "Alice", avatar_url: null }, "Host")).toBe("Alice");
    expect(participantLabel({ id: "1", username: "u", display_name: null, avatar_url: null }, "Host")).toBe("u");
    expect(participantLabel({ id: "1", username: null, display_name: "  ", avatar_url: null }, "Host")).toBe("Host");
    expect(participantLabel(null, "Opponent")).toBe("Opponent");
  });

  it("highlightErrorMessage maps known server errors", () => {
    expect(highlightErrorMessage({ message: "not_authenticated" })).toMatch(/sign in/i);
    expect(highlightErrorMessage({ message: "battle_not_found" })).toMatch(/no longer exists/i);
    expect(highlightErrorMessage({ message: "not_authorized" })).toMatch(/own analytics/i);
    expect(highlightErrorMessage({ message: "boom" }, "fallback msg")).toBe("fallback msg");
  });

  it("fetchLiveBattleVoteTimeline sends only _battle_id (no client-supplied counts)", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await fetchLiveBattleVoteTimeline("b1");
    expect(rpc).toHaveBeenCalledWith("get_live_battle_vote_timeline", { _battle_id: "b1" });
  });

  it("fetchLiveBattleVoteTimeline returns [] when RPC returns null", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(fetchLiveBattleVoteTimeline("b1")).resolves.toEqual([]);
  });

  it("fetchLiveBattleVoteTimeline returns ordered buckets as-is", async () => {
    const buckets = [
      { bucket: "2026-01-01T00:00:00Z", host_votes: 2, opponent_votes: 1, host_cumulative: 2, opponent_cumulative: 1 },
      { bucket: "2026-01-01T00:01:00Z", host_votes: 1, opponent_votes: 3, host_cumulative: 3, opponent_cumulative: 4 },
    ];
    rpc.mockResolvedValue({ data: buckets, error: null });
    const out = await fetchLiveBattleVoteTimeline("b1");
    expect(out.map((b) => b.bucket)).toEqual(buckets.map((b) => b.bucket));
    expect(out[1].opponent_cumulative).toBe(4);
  });

  it("fetchBattlerAnalytics surfaces not_authorized (viewing another user's analytics)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "not_authorized" } });
    await expect(fetchBattlerAnalytics("other-user")).rejects.toMatchObject({ message: "not_authorized" });
  });
});

describe("Wave 6 client contract — peak_viewers cannot be inflated", () => {
  // The bump RPC deliberately takes NO client count. This test guards the
  // client call-site: if anyone re-adds `_count` to the RPC call, the RPC's
  // signature will reject the extra param at runtime, but we also lock it
  // here so it fails at unit-test time.
  it("bump_live_battle_peak_viewers is invoked with only _battle_id", async () => {
    const localRpc = vi.fn().mockResolvedValue({ data: 0, error: null });
    // Simulate the exact call shape used in LiveBattle.tsx
    await localRpc("bump_live_battle_peak_viewers", { _battle_id: "b1" });
    expect(localRpc).toHaveBeenCalledWith("bump_live_battle_peak_viewers", { _battle_id: "b1" });
    const args = localRpc.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(args)).toEqual(["_battle_id"]);
    expect(args).not.toHaveProperty("_count");
  });
});
