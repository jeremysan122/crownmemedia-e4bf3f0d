// Pure helpers for Crown Battles: status derivation, safety filtering,
// cursor pagination, and dedup. These are extracted so they can be
// exhaustively unit-tested without standing up the Battles page.
//
// Status mapping for the existing `battles.status` enum:
//   - "pending"   → "upcoming" (challenged, not yet accepted/started)
//   - "active"    → "live" while ends_at is in the future, "ended" if expired
//   - "completed" → "ended"
//   - "declined" / "cancelled" → "ended" (final, never accept votes)
//
// The render layer should NEVER decide "live vs ended" on its own — it must
// call `deriveBattleStatus` so a stale `status="active"` row whose `ends_at`
// has already passed is treated as Ended and refuses votes.

export type BattleStatus = "upcoming" | "live" | "ended";

export interface BattleLike {
  id: string;
  status: string;
  ends_at: string | null;
  challenger_id: string;
  opponent_id: string;
  challenger_votes: number;
  opponent_votes: number;
  winner_id?: string | null;
  is_removed?: boolean | null;
  is_hidden?: boolean | null;
  created_at?: string | null;
}

export interface ParticipantLike {
  id: string;
  is_banned?: boolean | null;
  is_suspended?: boolean | null;
  is_deleted?: boolean | null;
  moderation_status?: string | null;
}

export function deriveBattleStatus(b: BattleLike, nowMs: number = Date.now()): BattleStatus {
  if (b.status === "completed" || b.status === "declined" || b.status === "cancelled") return "ended";
  if (b.status === "pending") return "upcoming";
  if (b.status === "active") {
    if (!b.ends_at) return "live";
    const ends = Date.parse(b.ends_at);
    if (Number.isFinite(ends) && ends <= nowMs) return "ended";
    return "live";
  }
  return "ended";
}

export function canVoteOnBattle(
  b: BattleLike,
  ctx: { viewerId: string | null; alreadyVoted: boolean; nowMs?: number },
): boolean {
  if (!ctx.viewerId) return false;
  if (ctx.alreadyVoted) return false;
  if (ctx.viewerId === b.challenger_id || ctx.viewerId === b.opponent_id) return false;
  return deriveBattleStatus(b, ctx.nowMs ?? Date.now()) === "live";
}

// ---------- Accept timing ----------
//
// A pending challenge stores an intended `duration_seconds`. `ends_at` MUST
// be recomputed at accept time so any delay while the invite sat pending
// does not eat into the active battle window.
//
// Fallbacks:
//  - if duration_seconds is missing on legacy pending battles, default to
//    24 hours (86_400s).
//  - duration is clamped to the server-enforced range [15m, 72h] so a
//    stale/malformed value can never produce a zero-length or infinite battle.
export const BATTLE_DURATION_MIN_SEC = 15 * 60;
export const BATTLE_DURATION_MAX_SEC = 72 * 60 * 60;
export const BATTLE_DURATION_DEFAULT_SEC = 24 * 60 * 60;

export function computeAcceptedEndsAtMs(
  durationSeconds: number | null | undefined,
  acceptedAtMs: number,
): number {
  const raw = typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : BATTLE_DURATION_DEFAULT_SEC;
  const clamped = Math.max(BATTLE_DURATION_MIN_SEC, Math.min(BATTLE_DURATION_MAX_SEC, raw));
  return acceptedAtMs + clamped * 1000;
}

// ---------- Safety filtering ----------

export function isSafeBattleForList(
  b: BattleLike,
  ctx: { blockedIds: ReadonlySet<string> },
): boolean {
  if (!b || !b.id) return false;
  if (b.is_removed || b.is_hidden) return false;
  if (b.status === "declined" || b.status === "cancelled") return false;
  if (ctx.blockedIds.has(b.challenger_id) || ctx.blockedIds.has(b.opponent_id)) return false;
  return true;
}

function isParticipantUsable(p: ParticipantLike | null | undefined): boolean {
  if (!p) return false;
  if (p.is_banned || p.is_suspended || p.is_deleted) return false;
  if (p.moderation_status && ["removed", "rejected", "quarantined"].includes(p.moderation_status)) return false;
  return true;
}

// ---------- Authoritative winner resolution ----------

/**
 * Resolve the displayable winner of an ended battle, applying the same
 * safety filters used everywhere else: if the original `winner_id` belongs
 * to a now-banned/suspended/deleted/moderated user, we DO NOT show them
 * as the crown holder — we surface `none` instead. This mirrors the
 * server-side `finalize_battle_winner` RPC and gives the UI a safe
 * fallback while the server reconciles.
 *
 * Returns:
 *   - { kind: "winner", winnerId }  — show the crown
 *   - { kind: "tie" }                — show the tie state
 *   - { kind: "none" }               — no eligible winner (display "Result unavailable")
 *   - { kind: "pending" }            — battle not ended yet
 */
export type WinnerResult =
  | { kind: "winner"; winnerId: string; loserId: string; winnerVotes: number; loserVotes: number }
  | { kind: "tie"; votes: number }
  | { kind: "none" }
  | { kind: "pending" };

export function resolveBattleWinner(
  b: BattleLike,
  participants: { challenger?: ParticipantLike | null; opponent?: ParticipantLike | null },
  nowMs: number = Date.now(),
): WinnerResult {
  if (deriveBattleStatus(b, nowMs) !== "ended") return { kind: "pending" };

  const cOk = isParticipantUsable(participants.challenger);
  const oOk = isParticipantUsable(participants.opponent);

  // If neither participant is currently usable, never display a winner.
  if (!cOk && !oOk) return { kind: "none" };

  // If only one side is usable, the unsafe side cannot be displayed as winner.
  if (cOk && !oOk) {
    return b.challenger_votes > 0
      ? { kind: "winner", winnerId: b.challenger_id, loserId: b.opponent_id, winnerVotes: b.challenger_votes, loserVotes: b.opponent_votes }
      : { kind: "none" };
  }
  if (oOk && !cOk) {
    return b.opponent_votes > 0
      ? { kind: "winner", winnerId: b.opponent_id, loserId: b.challenger_id, winnerVotes: b.opponent_votes, loserVotes: b.challenger_votes }
      : { kind: "none" };
  }

  // Both usable — compute from final vote totals.
  if (b.challenger_votes === 0 && b.opponent_votes === 0) return { kind: "none" };
  if (b.challenger_votes === b.opponent_votes) return { kind: "tie", votes: b.challenger_votes };
  if (b.challenger_votes > b.opponent_votes) {
    return { kind: "winner", winnerId: b.challenger_id, loserId: b.opponent_id, winnerVotes: b.challenger_votes, loserVotes: b.opponent_votes };
  }
  return { kind: "winner", winnerId: b.opponent_id, loserId: b.challenger_id, winnerVotes: b.opponent_votes, loserVotes: b.challenger_votes };
}

export function votePercentages(b: BattleLike): { challenger: number; opponent: number } {
  const total = b.challenger_votes + b.opponent_votes;
  if (total <= 0) return { challenger: 50, opponent: 50 };
  const c = (b.challenger_votes / total) * 100;
  return { challenger: c, opponent: 100 - c };
}

// ---------- Cursor pagination ----------
//
// Ordering: Live battles first (ends_at ASC so the next-to-finish surface
// at the top), then Upcoming, then Ended. Within a status group we order
// by created_at DESC, id DESC so freshly-created rows come first and
// (created_at, id) is a stable keyset cursor.
//
// We bucket by status in the SQL layer (status filter), then within a
// bucket page through (created_at, id) so concurrent inserts can never
// shift the page boundary or duplicate a row.

export interface BattlesCursor {
  bucket: "live" | "upcoming" | "ended";
  createdAt: string;
  id: string;
}

export function nextBattlesCursor(
  rows: BattleLike[],
  bucket: BattlesCursor["bucket"],
  pageSize: number,
): BattlesCursor | null {
  if (rows.length < pageSize) return null;
  const last = rows[rows.length - 1];
  if (!last?.created_at) return null;
  return { bucket, createdAt: last.created_at, id: last.id };
}

export function mergeDedupBattles(
  prev: ReadonlyArray<BattleLike>,
  next: ReadonlyArray<BattleLike>,
): { merged: BattleLike[]; dropped: number } {
  const seen = new Set(prev.map((b) => b.id));
  const fresh = next.filter((b) => b && b.id && !seen.has(b.id));
  return { merged: [...prev, ...fresh], dropped: next.length - fresh.length };
}
