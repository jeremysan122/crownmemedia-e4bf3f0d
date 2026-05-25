import { describe, it, expect } from "vitest";
import {
  scoreScenario,
  recalcOracle,
  makePost,
  makeComments,
  makeShares,
  makeBattles,
  makeBoost,
} from "./scoreScenarios";

describe("scoreScenarios fixtures", () => {
  it("is deterministic across runs (same seed → same ids/timestamps)", () => {
    const a = scoreScenario({ seed: "alpha", crowns: 3, comments: 2, shares: 1, battleWins: 1 });
    const b = scoreScenario({ seed: "alpha", crowns: 3, comments: 2, shares: 1, battleWins: 1 });
    expect(a.post.id).toBe(b.post.id);
    expect(a.post.user_id).toBe(b.post.user_id);
    expect(a.post.created_at).toBe(b.post.created_at);
    expect(a.comments.map((c) => c.id)).toEqual(b.comments.map((c) => c.id));
    expect(a.shares.map((s) => s.id)).toEqual(b.shares.map((s) => s.id));
    expect(a.battles.map((x) => x.id)).toEqual(b.battles.map((x) => x.id));
  });

  it("different seeds produce different post ids", () => {
    expect(scoreScenario({ seed: "x" }).post.id).not.toBe(scoreScenario({ seed: "y" }).post.id);
  });

  it("counts on the post match the engagement bag", () => {
    const s = scoreScenario({ seed: "counts", crowns: 4, fires: 3, diamonds: 2, comments: 7, shares: 5, battleWins: 2 });
    expect(s.post.vote_count).toBe(4 + 3 + 2);
    expect(s.post.comment_count).toBe(7);
    expect(s.post.share_count).toBe(5);
    expect(s.post.battle_wins).toBe(2);
    expect(s.comments).toHaveLength(7);
    expect(s.shares).toHaveLength(5);
    expect(s.battles).toHaveLength(2);
  });

  it("post.crown_score matches the SQL oracle", () => {
    const s = scoreScenario({ seed: "score", crowns: 12, fires: 6, diamonds: 3, comments: 25, shares: 8, battleWins: 1, boostActive: true });
    expect(s.post.crown_score).toBeCloseTo(recalcOracle(s.engagement, true), 9);
  });

  it("battle fixtures all credit the post owner as winner", () => {
    const s = scoreScenario({ seed: "wins", battleWins: 4 });
    for (const b of s.battles) {
      expect(b.status).toBe("completed");
      expect(b.winner_id).toBe(s.post.user_id);
      expect(b.challenger_post_id).toBe(s.post.id);
    }
  });

  it("active boost has a future expires_at; absent when not requested", () => {
    const on = scoreScenario({ seed: "on", boostActive: true });
    const off = scoreScenario({ seed: "off", boostActive: false });
    expect(off.boost).toBeNull();
    expect(on.boost).not.toBeNull();
    expect(on.boost!.active).toBe(true);
    expect(new Date(on.boost!.expires_at).getTime()).toBeGreaterThan(Date.now() - 365 * 24 * 3600_000);
  });

  it("low-level builders compose into a custom scenario", () => {
    const post = makePost("custom", { category: "best_style", city: "Paris" });
    const comments = makeComments("custom", post.id, 3);
    const shares = makeShares("custom", post.id, 2);
    const battles = makeBattles("custom", post, 1);
    const boost = makeBoost("custom", post, true);
    expect(comments.every((c) => c.post_id === post.id)).toBe(true);
    expect(shares.every((s) => s.post_id === post.id)).toBe(true);
    expect(battles[0].winner_id).toBe(post.user_id);
    expect(boost.post_id).toBe(post.id);
    expect(boost.active).toBe(true);
  });

  it("location passthrough drives race-scope availability", () => {
    const s = scoreScenario({ seed: "loc", city: "Tokyo", state: "Tokyo", country: "Japan" });
    expect(s.post.city).toBe("Tokyo");
    expect(s.post.state).toBe("Tokyo");
    expect(s.post.country).toBe("Japan");
  });
});
