import { describe, it, expect, beforeEach } from "vitest";
import { normalizeOfficialResult, __resetOfficialResultForTests } from "@/hooks/useOfficialBattleResult";

describe("normalizeOfficialResult", () => {
  beforeEach(() => __resetOfficialResultForTests());

  it("passes through pending", () => {
    expect(normalizeOfficialResult({ kind: "pending" })).toEqual({ kind: "pending" });
  });
  it("normalizes a winner payload", () => {
    expect(
      normalizeOfficialResult({ kind: "winner", winner_id: "u1", winner_votes: 7, loser_votes: 3 }),
    ).toEqual({ kind: "winner", winner_id: "u1", winner_votes: 7, loser_votes: 3 });
  });
  it("normalizes a tie payload", () => {
    expect(normalizeOfficialResult({ kind: "tie", votes: 5 })).toEqual({ kind: "tie", votes: 5 });
  });
  it("normalizes a no-winner payload, preserving known reasons", () => {
    expect(normalizeOfficialResult({ kind: "none", reason: "participants_unavailable" })).toEqual({
      kind: "none",
      reason: "participants_unavailable",
    });
    expect(normalizeOfficialResult({ kind: "none", reason: "no_votes" })).toEqual({
      kind: "none",
      reason: "no_votes",
    });
  });
  it("drops unknown reasons (defence-in-depth against future RPC values)", () => {
    expect(normalizeOfficialResult({ kind: "none", reason: "sneaky" })).toEqual({ kind: "none" });
  });
  it("defaults to none/not_found for malformed payloads", () => {
    expect(normalizeOfficialResult(null)).toEqual({ kind: "none", reason: "not_found" });
    expect(normalizeOfficialResult("garbage")).toEqual({ kind: "none", reason: "not_found" });
    expect(normalizeOfficialResult({ kind: "winner" })).toEqual({ kind: "none" }); // missing winner_id
  });
  it("rejects banned/unsafe winner_id formats (only strings allowed)", () => {
    expect(normalizeOfficialResult({ kind: "winner", winner_id: 123 })).toEqual({ kind: "none" });
  });
});
