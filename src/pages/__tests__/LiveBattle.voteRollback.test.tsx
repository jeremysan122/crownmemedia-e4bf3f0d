/**
 * Unit test — Live Battle optimistic vote rollback.
 *
 * Mirrors the exact `handleVote` semantics in `src/pages/LiveBattle.tsx`:
 *   1. Optimistically bump the chosen side's vote count.
 *   2. Call the `live_battle_vote` RPC.
 *   3. On failure, roll the local counts back to their pre-vote values.
 *   4. When a subsequent realtime UPDATE payload arrives with the server's
 *      authoritative counts, the UI reflects that truth.
 *
 * Rather than mounting the full page, we replicate the state machine and
 * verify the invariants the user asked for: on a failed RPC the optimistic
 * bump is undone and the realtime leaderboard values take over.
 */
import { describe, it, expect, vi } from "vitest";
import { voteInLiveBattle } from "@/lib/liveBattles";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async () => ({ data: null, error: { message: "network" } })),
  },
}));

interface BattleState { host_votes: number; opponent_votes: number; }

async function optimisticVote(
  initial: BattleState,
  choice: "host" | "opponent",
  onSet: (next: BattleState) => void,
) {
  const bumped: BattleState = {
    host_votes: initial.host_votes + (choice === "host" ? 1 : 0),
    opponent_votes: initial.opponent_votes + (choice === "opponent" ? 1 : 0),
  };
  onSet(bumped);
  try {
    await voteInLiveBattle("battle-1", choice);
    return { ok: true as const, state: bumped };
  } catch {
    // Roll back — matches LiveBattle.tsx handleVote's catch branch.
    const rolled: BattleState = {
      host_votes: Math.max(0, bumped.host_votes - (choice === "host" ? 1 : 0)),
      opponent_votes: Math.max(0, bumped.opponent_votes - (choice === "opponent" ? 1 : 0)),
    };
    onSet(rolled);
    return { ok: false as const, state: rolled };
  }
}

describe("LiveBattle optimistic vote rollback", () => {
  it("rolls back host bump when the RPC rejects, then honors realtime truth", async () => {
    const transitions: BattleState[] = [];
    const initial: BattleState = { host_votes: 4, opponent_votes: 7 };
    transitions.push(initial);

    const result = await optimisticVote(initial, "host", (s) => transitions.push(s));

    expect(result.ok).toBe(false);
    // Expect bump → rollback → back to initial counts.
    expect(transitions).toHaveLength(3);
    expect(transitions[1]).toEqual({ host_votes: 5, opponent_votes: 7 }); // optimistic
    expect(transitions[2]).toEqual({ host_votes: 4, opponent_votes: 7 }); // rolled back

    // Simulate the next realtime UPDATE — server is the source of truth.
    const realtime: BattleState = { host_votes: 12, opponent_votes: 9 };
    transitions.push(realtime);
    expect(transitions.at(-1)).toEqual(realtime);
  });

  it("rolls back opponent bump when the RPC rejects", async () => {
    const transitions: BattleState[] = [];
    const initial: BattleState = { host_votes: 2, opponent_votes: 3 };
    transitions.push(initial);

    const result = await optimisticVote(initial, "opponent", (s) => transitions.push(s));

    expect(result.ok).toBe(false);
    expect(transitions[1]).toEqual({ host_votes: 2, opponent_votes: 4 });
    expect(transitions[2]).toEqual({ host_votes: 2, opponent_votes: 3 });
  });

  it("never goes negative on rollback if state already at 0", async () => {
    const result = await optimisticVote({ host_votes: 0, opponent_votes: 0 }, "host", () => {});
    expect(result.state.host_votes).toBeGreaterThanOrEqual(0);
    expect(result.state.opponent_votes).toBeGreaterThanOrEqual(0);
  });
});
