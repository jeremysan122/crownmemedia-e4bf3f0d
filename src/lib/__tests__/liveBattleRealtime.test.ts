import { describe, it, expect, vi } from "vitest";
import {
  shouldApplyLiveBattleUpdate,
  mergeLiveBattleUpdate,
  isEndedTransition,
  type RealtimeLiveBattleLike,
} from "@/lib/liveBattleRealtime";

const row = (
  overrides: Partial<RealtimeLiveBattleLike> = {},
): RealtimeLiveBattleLike => ({
  status: "live",
  host_votes: 0,
  opponent_votes: 0,
  ...overrides,
});

describe("liveBattleRealtime", () => {
  it("applies updates while the battle is live", () => {
    const prev = row({ host_votes: 3, opponent_votes: 1 });
    const next = row({ host_votes: 5, opponent_votes: 1 });
    expect(shouldApplyLiveBattleUpdate(prev, next)).toBe(true);
    expect(mergeLiveBattleUpdate(prev, next).host_votes).toBe(5);
  });

  it("freezes votes and status once prev is ended", () => {
    const prev = row({ status: "ended", host_votes: 7, opponent_votes: 4 });
    const next = row({ status: "ended", host_votes: 999, opponent_votes: 999 });
    expect(shouldApplyLiveBattleUpdate(prev, next)).toBe(false);
    const merged = mergeLiveBattleUpdate(prev, next);
    expect(merged.host_votes).toBe(7);
    expect(merged.opponent_votes).toBe(4);
    expect(merged.status).toBe("ended");
  });

  it("detects live→ended transition exactly once", () => {
    const live = row({ status: "live", host_votes: 2, opponent_votes: 2 });
    const ended = row({ status: "ended", host_votes: 2, opponent_votes: 2 });
    expect(isEndedTransition(live, ended)).toBe(true);
    // After transition, prev.status is already ended → no further transition.
    expect(isEndedTransition(ended, ended)).toBe(false);
  });

  it("simulates unsubscribe-on-ended: no further reducer calls run", () => {
    // Simulated realtime pipeline: apply() is only invoked when the
    // subscription is still open. Once we see an ended transition, we
    // tear it down and any subsequent payloads must never reach apply.
    const apply = vi.fn();
    let open = true;
    const push = (prev: RealtimeLiveBattleLike, next: RealtimeLiveBattleLike) => {
      if (!open) return;
      apply(next);
      if (isEndedTransition(prev, next)) open = false;
    };
    const start = row({ status: "live", host_votes: 1, opponent_votes: 0 });
    const ended = row({ status: "ended", host_votes: 3, opponent_votes: 2 });
    const stray = row({ status: "ended", host_votes: 999, opponent_votes: 999 });
    push(start, ended);
    push(ended, stray);
    push(ended, stray);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenLastCalledWith(ended);
  });
});
