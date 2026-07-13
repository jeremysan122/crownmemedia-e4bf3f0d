import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import {
  emitAchievementEvent,
  recordQualifiedActiveDay,
  AchievementEvents,
} from "../emit";

beforeEach(() => {
  rpc.mockReset();
});

describe("emitAchievementEvent", () => {
  it("passes source table+id to the RPC for idempotency", async () => {
    rpc.mockResolvedValue({ data: "evt-1", error: null });
    const res = await emitAchievementEvent({
      userId: "u1",
      eventType: "battle_won",
      sourceTable: "battles",
      sourceId: "b-42",
      delta: { qualified_battle_wins: 1 },
    });
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      "emit_achievement_event",
      expect.objectContaining({
        _user_id: "u1",
        _event_type: "battle_won",
        _source_table: "battles",
        _source_id: "b-42",
        _delta: { qualified_battle_wins: 1 },
      }),
    );
  });

  it("returns ok:false without throwing when the RPC errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await emitAchievementEvent({ userId: "u", eventType: "x" });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("boom");
  });

  it("recordQualifiedActiveDay swallows failures", async () => {
    rpc.mockRejectedValue(new Error("net"));
    await expect(
      recordQualifiedActiveDay({ userId: "u", eventType: "battle_won" }),
    ).resolves.toBeUndefined();
  });

  it("convenience helpers set canonical delta keys", async () => {
    rpc.mockResolvedValue({ data: "id", error: null });
    await AchievementEvents.voteReceived("u", "v1");
    expect(rpc.mock.calls[0][1]).toMatchObject({
      _event_type: "vote_received",
      _source_table: "votes",
      _source_id: "v1",
      _delta: { qualified_votes_received: 1 },
    });
  });
});
