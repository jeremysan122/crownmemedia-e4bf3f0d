// Crown Battles personal-tab pagination helpers.
//
// Pagination model
// ----------------
// Personal tabs (Active / Pending / Mine / Past) all read from the same
// underlying user-scoped query — `(challenger_id = me OR opponent_id = me)`
// ordered by `(created_at DESC, id DESC)`. We use **keyset cursor
// pagination** on that ordering, never offset, so concurrent inserts cannot
// shift a page boundary or duplicate a row.
//
// Each tab owns its own state — its own cursor, loaded raw rows, exhausted
// flag — so paginating "Mine" never disturbs "Active" / "Pending" / "Past".
// The server query is shared across tabs because the predicate that decides
// which tab a row belongs to is small and pure (`tabPredicate`), so we can
// post-filter cheaply client-side and dedup by `battle_id`.
//
// Cursor shape: `{ createdAt, id }` — the `(created_at, id)` tuple of the
// last row returned by the previous page. `nextCursor` returns `null` when
// the page is short (server exhausted).
//
// Dedup: `appendDedup` keeps the first occurrence and drops anything whose
// `id` is already present. This is what makes retries, rapid double-taps,
// overlapping pages, and back-navigation rehydration safe — applying the
// same page twice always yields the same array.

import { deriveBattleStatus, type BattleLike } from "./battlesLogic";

export type TabKey = "active" | "pending" | "mine" | "done" | "declined";
export const TAB_KEYS: ReadonlyArray<TabKey> = ["active", "pending", "mine", "done", "declined"];
export const PAGE_SIZE = 20;
export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
/** SessionStorage entries older than this are treated as stale and refetched. */
export const STATE_TTL_MS = 10 * 60 * 1000;

export interface BattleCursor {
  createdAt: string;
  id: string;
}

export function battleTimeMs(b: Pick<BattleLike, "ends_at" | "created_at">): number {
  const e = b.ends_at ? Date.parse(b.ends_at) : NaN;
  if (Number.isFinite(e) && e > 0) return e;
  return b.created_at ? Date.parse(b.created_at) : 0;
}

/**
 * Decide whether a battle belongs in a given personal tab.
 * Pure function — exhaustively unit-tested.
 */
export function tabPredicate(
  tab: TabKey,
  b: BattleLike,
  viewerId: string | null,
  nowMs: number = Date.now(),
): boolean {
  if (!viewerId) return false;
  const isMine = b.challenger_id === viewerId || b.opponent_id === viewerId;
  if (!isMine) return false;
  const ended = deriveBattleStatus(b, nowMs) === "ended";
  const age = nowMs - battleTimeMs(b);
  switch (tab) {
    case "active":
      return b.status === "active" && !ended;
    case "pending":
      return b.status === "pending";
    case "mine":
      return age <= THIRTY_DAYS_MS;
    case "done":
      return ended && age > THIRTY_DAYS_MS;
  }
}

/**
 * Append `next` onto `prev`, dropping any row whose `id` is already in
 * `prev`. Idempotent — applying the same page twice yields the same list.
 */
export function appendDedup<T extends { id: string }>(
  prev: ReadonlyArray<T>,
  next: ReadonlyArray<T>,
): { merged: T[]; dropped: number } {
  const seen = new Set<string>();
  for (const p of prev) if (p?.id) seen.add(p.id);
  const fresh: T[] = [];
  for (const n of next) {
    if (!n?.id) continue;
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    fresh.push(n);
  }
  return { merged: [...prev, ...fresh], dropped: next.length - fresh.length };
}

/**
 * Build the next keyset cursor from the last row of a returned page.
 * Returns `null` when the page is short, signalling exhaustion.
 */
export function nextCursor(
  rows: ReadonlyArray<{ id: string; created_at?: string | null }>,
  pageSize: number = PAGE_SIZE,
): BattleCursor | null {
  if (rows.length < pageSize) return null;
  const last = rows[rows.length - 1];
  if (!last?.created_at) return null;
  return { createdAt: last.created_at, id: last.id };
}

// ---------- Session-storage persistence ----------

export interface PersistedFilters {
  query: string;
  region: string;
  category: string;
  sort: string;
  hub: string;
  topic: string;
}

export interface PersistedTabState<TRow> {
  rows: TRow[];
  cursor: BattleCursor | null;
  exhausted: boolean;
}

export interface PersistedBattlesState<TRow> {
  savedAt: number;
  viewerId: string;
  tab: TabKey;
  filters: PersistedFilters;
  perTab: Record<TabKey, PersistedTabState<TRow>>;
  scrollY: number;
}

const STORAGE_KEY = "crownme:battles:v1";

export function loadPersistedState<TRow>(
  viewerId: string,
  nowMs: number = Date.now(),
): PersistedBattlesState<TRow> | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedBattlesState<TRow>;
    if (!parsed || parsed.viewerId !== viewerId) return null;
    if (nowMs - parsed.savedAt > STATE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePersistedState<TRow>(state: PersistedBattlesState<TRow>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded — best effort, ignore */
  }
}

export function clearPersistedState(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function emptyPerTab<TRow>(): Record<TabKey, PersistedTabState<TRow>> {
  return {
    active: { rows: [], cursor: null, exhausted: false },
    pending: { rows: [], cursor: null, exhausted: false },
    mine: { rows: [], cursor: null, exhausted: false },
    done: { rows: [], cursor: null, exhausted: false },
  };
}
