// Pure helpers for Discover cursor pagination + safety filtering.
//
// These are extracted so they can be exhaustively unit-tested without
// spinning up the full Discover page. The live page uses the same logic
// inline; this module is the canonical reference and is what the test
// suite exercises to prove the invariants:
//
//   - cursors are stable keyset cursors (no offsets) so concurrent inserts
//     can't shift the page boundary and cause duplicates or skipped rows;
//   - merging an appended page into the existing list dedupes by id;
//   - safety filtering removes unsafe / hidden / blocked / private /
//     moderated content BEFORE it ever reaches the rendered list, and
//     BEFORE it can be written to the short-lived cache.
//
// Privacy: nothing here logs or returns sensitive fields (coords, raw
// captions, emails, etc.). Callers are expected to project only the
// columns Discover renders.

export interface TrendingPostLike {
  id: string;
  user_id: string;
  crown_score: number | null;
  is_removed?: boolean | null;
  is_archived?: boolean | null;
  is_hidden?: boolean | null;
  moderation_status?: string | null;
}

export interface BattleLike {
  id: string;
  challenger_id: string;
  opponent_id: string;
  ends_at: string;
  status?: string | null;
  is_removed?: boolean | null;
  is_hidden?: boolean | null;
}

export interface NearbyProfileLike {
  id: string;
  is_private?: boolean | null;
  is_banned?: boolean | null;
  is_suspended?: boolean | null;
  discoverable?: boolean | null;
}

export type PostsCursor = { score: number; id: string } | null;
export type BattlesCursor = { endsAt: string; id: string } | null;

// ---------- Safety ----------

/** True when a trending post is safe to surface in Discover for the viewer. */
export function isSafeTrendingPost(
  row: TrendingPostLike,
  ctx: { blockedIds: ReadonlySet<string>; viewerId: string | null },
): boolean {
  if (!row || !row.id || !row.user_id) return false;
  if (row.is_removed) return false;
  if (row.is_archived) return false;
  if (row.is_hidden) return false;
  if (row.moderation_status && ["removed", "rejected", "quarantined"].includes(row.moderation_status)) return false;
  if (ctx.blockedIds.has(row.user_id)) return false;
  return true;
}

export function isSafeBattle(
  row: BattleLike,
  ctx: { blockedIds: ReadonlySet<string>; nowMs?: number },
): boolean {
  if (!row || !row.id) return false;
  if (row.is_removed || row.is_hidden) return false;
  if (row.status && !["active", "pending"].includes(row.status)) return false;
  const ends = Date.parse(row.ends_at);
  if (!Number.isFinite(ends) || ends <= (ctx.nowMs ?? Date.now())) return false;
  if (ctx.blockedIds.has(row.challenger_id) || ctx.blockedIds.has(row.opponent_id)) return false;
  return true;
}

export function isSafeNearbyProfile(
  row: NearbyProfileLike,
  ctx: { blockedIds: ReadonlySet<string>; viewerId: string | null },
): boolean {
  if (!row || !row.id) return false;
  if (row.id === ctx.viewerId) return false;
  if (row.is_banned || row.is_suspended || row.is_private) return false;
  if (row.discoverable === false) return false;
  if (ctx.blockedIds.has(row.id)) return false;
  return true;
}

// ---------- Cursors ----------

export function nextPostsCursor(rows: TrendingPostLike[], pageSize: number): PostsCursor {
  if (rows.length < pageSize) return null;
  const last = rows[rows.length - 1];
  return last ? { score: Number(last.crown_score) || 0, id: String(last.id) } : null;
}

export function nextBattlesCursor(rows: BattleLike[], pageSize: number): BattlesCursor {
  if (rows.length < pageSize) return null;
  const last = rows[rows.length - 1];
  return last ? { endsAt: String(last.ends_at), id: String(last.id) } : null;
}

// ---------- Merge / dedup ----------

/** Merge an appended page into the existing list, dedup'ing by id and
 *  preserving order. Returns the merged list and the number of duplicates
 *  that were dropped (callers can fire `discover_duplicate_prevented`). */
export function mergeDedupById<T extends { id: string }>(
  prev: ReadonlyArray<T>,
  next: ReadonlyArray<T>,
): { merged: T[]; dropped: number } {
  const seen = new Set(prev.map((x) => x.id));
  const fresh = next.filter((x) => x && x.id && !seen.has(x.id));
  return { merged: [...prev, ...fresh], dropped: next.length - fresh.length };
}
