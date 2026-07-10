// Pure helpers for the LiveBattle realtime reducer. Extracted so we can
// unit-test the "freeze on ended + unsubscribe" contract without mounting
// the whole page.

export interface RealtimeLiveBattleLike {
  status: string;
  host_votes: number;
  opponent_votes: number;
}

/**
 * Once the previous row is `ended` we must ignore any further realtime
 * payloads that touch vote counts or status. The results screen is a
 * frozen snapshot until the user refreshes.
 */
export function shouldApplyLiveBattleUpdate(
  prev: RealtimeLiveBattleLike | null,
  next: RealtimeLiveBattleLike,
): boolean {
  if (!prev) return true;
  if (prev.status === "ended") return false;
  return true;
}

/** Merge a realtime UPDATE into prev, preserving frozen counts post-end. */
export function mergeLiveBattleUpdate<T extends RealtimeLiveBattleLike>(
  prev: T | null,
  next: T,
): T {
  if (!prev) return next;
  if (prev.status === "ended") {
    return { ...prev, ...next, host_votes: prev.host_votes, opponent_votes: prev.opponent_votes, status: "ended" };
  }
  return next;
}

/** True the first time we see a live→ended transition. */
export function isEndedTransition(
  prev: RealtimeLiveBattleLike | null,
  next: RealtimeLiveBattleLike,
): boolean {
  return !!prev && prev.status !== "ended" && next.status === "ended";
}
