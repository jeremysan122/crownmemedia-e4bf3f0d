import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
const insertMock = vi.fn();
const fromMock = vi.fn(() => ({ insert: insertMock }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
    from: (t: string) => fromMock(t),
    rpc: (name: string, args?: unknown) => rpcMock(name, args),
    functions: { invoke: vi.fn() },
  },
}));

beforeEach(() => {
  rpcMock.mockReset();
  insertMock.mockReset();
  fromMock.mockClear();
});

describe("Live Battles source contract", () => {
  it("createLiveBattle uses RPC (never direct INSERT)", async () => {
    rpcMock.mockResolvedValueOnce({ data: { id: "b1", host_id: "u1" }, error: null });
    const { createLiveBattle } = await import("@/lib/liveBattles");
    const row = await createLiveBattle("opp1", 300);
    expect(rpcMock).toHaveBeenCalledWith("create_live_battle", {
      _opponent_id: "opp1", _duration_seconds: 300,
    });
    expect(fromMock).not.toHaveBeenCalledWith("live_battles");
    expect(row.id).toBe("b1");
  });

  it("voteInLiveBattle uses RPC (never direct INSERT)", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    const { voteInLiveBattle } = await import("@/lib/liveBattles");
    await voteInLiveBattle("b1", "host");
    expect(rpcMock).toHaveBeenCalledWith("live_battle_vote", { _battle_id: "b1", _choice: "host" });
    expect(fromMock).not.toHaveBeenCalledWith("live_battle_votes");
  });

  it("reportLiveBattle uses RPC (never direct INSERT)", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    const { reportLiveBattle } = await import("@/lib/liveBattles");
    await reportLiveBattle("b1", "abuse");
    expect(rpcMock).toHaveBeenCalledWith("live_battle_report", { _battle_id: "b1", _reason: "abuse" });
    expect(fromMock).not.toHaveBeenCalledWith("live_battle_reports");
  });

  it("surfaces raw server error codes so friendly mapping can run", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "already_voted" } });
    const { voteInLiveBattle, liveBattleErrorMessage } = await import("@/lib/liveBattles");
    await expect(voteInLiveBattle("b1", "host")).rejects.toMatchObject({ message: "already_voted" });
    expect(liveBattleErrorMessage({ message: "already_voted" }, "x")).toMatch(/already voted/i);
  });
});
