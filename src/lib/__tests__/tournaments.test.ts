import { describe, it, expect } from "vitest";
import {
  totalRoundsForSize, groupMatchesByRound, roundLabel, tournamentErrorMessage,
  type TournamentMatchRow,
} from "@/lib/tournaments";

const mk = (round: number, slot: number, over: Partial<TournamentMatchRow> = {}): TournamentMatchRow => ({
  id: `${round}-${slot}`,
  tournament_id: "t1",
  round, slot,
  host_id: null, opponent_id: null, battle_id: null, winner_id: null,
  next_match_id: null, next_slot: null,
  status: "pending", created_at: "2026-01-01T00:00:00Z",
  ...over,
});

describe("tournaments helpers", () => {
  it("totalRoundsForSize maps 4/8/16 → 2/3/4", () => {
    expect(totalRoundsForSize(4)).toBe(2);
    expect(totalRoundsForSize(8)).toBe(3);
    expect(totalRoundsForSize(16)).toBe(4);
  });

  it("groupMatchesByRound sorts by round + slot", () => {
    const rows = [mk(2, 0), mk(1, 1), mk(1, 0), mk(2, 1)];
    const grouped = groupMatchesByRound(rows);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].map(m => m.slot)).toEqual([0, 1]);
    expect(grouped[1].map(m => m.slot)).toEqual([0, 1]);
  });

  it("roundLabel names the last three rounds semantically", () => {
    // 8-player: rounds 1..3, total=3
    expect(roundLabel(1, 3)).toBe("Quarterfinals");
    expect(roundLabel(2, 3)).toBe("Semifinals");
    expect(roundLabel(3, 3)).toBe("Final");
    // 16-player: earliest round is "Round 1"
    expect(roundLabel(1, 4)).toBe("Round 1");
    expect(roundLabel(4, 4)).toBe("Final");
  });

  it("tournamentErrorMessage maps common server codes", () => {
    expect(tournamentErrorMessage({ message: "invalid_size" })).toMatch(/4, 8, or 16/);
    expect(tournamentErrorMessage({ message: "duplicate_participants" })).toMatch(/only appear once/);
    expect(tournamentErrorMessage({ message: "match_not_ready" })).toMatch(/isn't ready/);
    expect(tournamentErrorMessage({ message: "feature_disabled" })).toMatch(/aren't available/);
    expect(tournamentErrorMessage({ message: "match_not_resolvable" })).toMatch(/doesn't need resolution/);
    expect(tournamentErrorMessage({ message: "invalid_winner" })).toMatch(/one of the two participants/);
    expect(tournamentErrorMessage({ message: "boom" })).toMatch(/wrong/);
  });
});
