// Pure weighted-score helpers for Crown Battles.
//
// The leaderboard shows a "weighted score" per post, which is the crowd's
// vote weight combined with head-to-head battle wins and gifted-shekel
// momentum. The server owns the authoritative aggregate on
// `posts.crown_score`, but the client uses these helpers to:
//   1. Render optimistic score deltas immediately after a vote is cast, so
//      the UI can move before realtime catches up.
//   2. Verify in tests that the weighting is strictly monotonic — more
//      votes / more gift value / a battle win must NEVER decrease the
//      displayed weighted score.
//
// The weights are intentionally simple integer constants so both client
// and server can agree on the direction of change. Tune the numbers here
// AND in the SQL aggregator when weighting rules change.

/** Weight of a single crown vote on a post. */
export const CROWN_VOTE_WEIGHT = 3;
/** Weight of a single fire vote. */
export const FIRE_VOTE_WEIGHT = 2;
/** Weight of a single diamond vote (premium reaction). */
export const DIAMOND_VOTE_WEIGHT = 5;
/** Dislike votes subtract but are floored at 0 in the final score. */
export const DISLIKE_VOTE_WEIGHT = 1;
/** Weight of a single battle vote for the winning side of a post battle. */
export const BATTLE_VOTE_WEIGHT = 4;
/** Bonus applied when a post's creator wins a completed battle. */
export const BATTLE_WIN_BONUS = 25;
/** How much every 1 shekel of received gifts contributes to the score. */
export const GIFT_SHEKEL_WEIGHT = 0.1;

export interface WeightedScoreInputs {
  crownVotes?: number;
  fireVotes?: number;
  diamondVotes?: number;
  dislikeVotes?: number;
  battleVotes?: number;
  battleWins?: number;
  giftShekels?: number;
}

function nn(n: number | undefined | null): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Compute the weighted score for a single post. Always ≥ 0. Adding more of
 * any positive input (votes, battle wins, gifts) is guaranteed to produce
 * a score that is ≥ the previous value — see `battleScore.test.ts`.
 */
export function computeWeightedScore(inputs: WeightedScoreInputs): number {
  const positive =
    nn(inputs.crownVotes) * CROWN_VOTE_WEIGHT +
    nn(inputs.fireVotes) * FIRE_VOTE_WEIGHT +
    nn(inputs.diamondVotes) * DIAMOND_VOTE_WEIGHT +
    nn(inputs.battleVotes) * BATTLE_VOTE_WEIGHT +
    nn(inputs.battleWins) * BATTLE_WIN_BONUS +
    nn(inputs.giftShekels) * GIFT_SHEKEL_WEIGHT;

  const penalty = nn(inputs.dislikeVotes) * DISLIKE_VOTE_WEIGHT;
  return Math.max(0, Math.round((positive - penalty) * 100) / 100);
}

/**
 * Optimistic delta for a single new battle vote cast on the winning side —
 * used by the vote UI to bump the visible score before the server aggregator
 * runs.
 */
export function battleVoteScoreDelta(quantity = 1): number {
  return Math.max(0, Math.floor(quantity)) * BATTLE_VOTE_WEIGHT;
}
