/**
 * Shared post-poll bus (Batch C fallback).
 *
 * Every mounted PostCard registers its post id here. A single process-wide
 * interval (default 15s) batches a single query for the counters of every
 * currently-registered post and fans results back to per-post handlers.
 *
 * Why:
 * - PostCard must NEVER start its own setInterval (would be N intervals + N
 *   queries per feed).
 * - Realtime `votes` / `comments` are not guaranteed to be in the
 *   `supabase_realtime` publication, so we cannot rely on them for counter
 *   freshness. Posts UPDATE covers `crown_score / comment_count /
 *   share_count / repost_count / battle_wins`, and this poll is the
 *   source-of-truth fallback that fills any gap.
 * - Pauses while the tab is hidden. Stops entirely when the last card
 *   unregisters. Duplicate intervals are prevented by refcounting.
 */
import { supabase } from "@/integrations/supabase/client";

export interface PostCounters {
  crown_score?: number | null;
  comment_count?: number | null;
  share_count?: number | null;
  repost_count?: number | null;
  battle_wins?: number | null;
}

type Handler = (row: PostCounters) => void;

const handlers = new Map<string, Set<Handler>>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let intervalMs = 15_000;

async function tick() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  const ids = Array.from(handlers.keys());
  if (ids.length === 0) return;
  const { data, error } = await supabase
    .from("posts")
    .select("id, crown_score, comment_count, share_count, repost_count, battle_wins")
    .in("id", ids);
  if (error || !data) return;
  for (const row of data) {
    const set = handlers.get(row.id as string);
    if (!set) continue;
    set.forEach((h) => { try { h(row as PostCounters); } catch { /* noop */ } });
  }
}

function ensureInterval() {
  if (intervalId !== null) return; // dedupe: never more than one interval
  intervalId = setInterval(() => { void tick(); }, intervalMs);
}

function teardownInterval() {
  if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
}

export function registerVisiblePost(postId: string, handler: Handler): () => void {
  let set = handlers.get(postId);
  if (!set) { set = new Set(); handlers.set(postId, set); }
  set.add(handler);
  ensureInterval();
  return () => {
    const s = handlers.get(postId);
    if (s) {
      s.delete(handler);
      if (s.size === 0) handlers.delete(postId);
    }
    if (handlers.size === 0) teardownInterval();
  };
}

/** Test-only: override poll cadence. */
export function __setPollIntervalForTests(ms: number) {
  intervalMs = ms;
  if (intervalId !== null) { clearInterval(intervalId); intervalId = null; ensureInterval(); }
}

/** Test-only introspection. */
export function __pollStatsForTests() {
  return {
    postCount: handlers.size,
    hasInterval: intervalId !== null,
  };
}

/** Test-only reset. */
export function __resetPollBusForTests() {
  teardownInterval();
  handlers.clear();
  intervalMs = 15_000;
}
