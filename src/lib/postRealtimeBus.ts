/**
 * Shared post-level realtime bus.
 *
 * Batch C — every PostCard used to open its own Supabase channel (one per
 * card). On a 30-item feed that produced 30 channels + 30 reconnect loops.
 * This bus opens ONE process-wide channel that listens (unfiltered) to
 * `posts`, `votes`, and `comments` and fans out events to per-post
 * subscribers.
 *
 * PostCard subscribes with `subscribePost(post.id, cb)` — the returned
 * unsubscribe is refcounted, and the shared channel tears down cleanly
 * when the last subscriber leaves.
 *
 * Status is exposed via `subscribeStatus` so cards can render
 * connecting/live/reconnecting UI and drive a polling safety net
 * (`useRealtimeFallbackPoll`) when the channel isn't live.
 */
import { supabase } from "@/integrations/supabase/client";

export type BusEvent =
  | { kind: "vote"; postId: string }
  | { kind: "post"; postId: string; row: Record<string, unknown> }
  | { kind: "comment"; postId: string };

export type BusStatus = "connecting" | "live" | "reconnecting" | "error";

type Handler = (evt: BusEvent) => void;
type StatusListener = (s: BusStatus) => void;

const handlers = new Map<string, Set<Handler>>();
const statusListeners = new Set<StatusListener>();
let channel: ReturnType<typeof supabase.channel> | null = null;
let currentStatus: BusStatus = "connecting";
let refCount = 0;
let attempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function setStatus(s: BusStatus) {
  currentStatus = s;
  statusListeners.forEach((l) => { try { l(s); } catch { /* noop */ } });
}

function emit(postId: string, evt: BusEvent) {
  const set = handlers.get(postId);
  if (!set) return;
  set.forEach((h) => { try { h(evt); } catch { /* noop */ } });
}

function teardownChannel() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (channel) {
    try { supabase.removeChannel(channel); } catch { /* noop */ }
    channel = null;
  }
}

function scheduleReconnect() {
  if (reconnectTimer || refCount <= 0) return;
  const delay = Math.min(8000, 500 * Math.pow(2, attempt++));
  setStatus(attempt > 4 ? "error" : "reconnecting");
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    teardownChannel();
    if (refCount > 0) ensureChannel();
  }, delay);
}

function ensureChannel() {
  if (channel) return;
  const name = `post-shared-${(typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)}`;
  const ch = supabase.channel(name);
  ch.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "votes" },
    (payload) => {
      const row = (payload.new ?? payload.old) as { post_id?: string } | null;
      if (row?.post_id) emit(row.post_id, { kind: "vote", postId: row.post_id });
    },
  ).on(
    "postgres_changes",
    { event: "*", schema: "public", table: "posts" },
    (payload) => {
      const row = payload.new as ({ id?: string } & Record<string, unknown>) | null;
      if (row?.id) emit(row.id, { kind: "post", postId: row.id, row });
    },
  ).on(
    "postgres_changes",
    { event: "*", schema: "public", table: "comments" },
    (payload) => {
      const row = (payload.new ?? payload.old) as { post_id?: string } | null;
      if (row?.post_id) emit(row.post_id, { kind: "comment", postId: row.post_id });
    },
  ).subscribe((status) => {
    if (status === "SUBSCRIBED") {
      attempt = 0;
      setStatus("live");
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      scheduleReconnect();
    }
  });
  channel = ch;
}

export function subscribePost(postId: string, handler: Handler): () => void {
  let set = handlers.get(postId);
  if (!set) { set = new Set(); handlers.set(postId, set); }
  set.add(handler);
  refCount++;
  ensureChannel();
  return () => {
    const s = handlers.get(postId);
    if (s) {
      s.delete(handler);
      if (s.size === 0) handlers.delete(postId);
    }
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0) teardownChannel();
  };
}

export function subscribeStatus(l: StatusListener): () => void {
  statusListeners.add(l);
  l(currentStatus);
  return () => { statusListeners.delete(l); };
}

export function getStatus(): BusStatus { return currentStatus; }

/** Test-only introspection. */
export function __busStatsForTests() {
  return {
    subscribers: refCount,
    postCount: handlers.size,
    hasChannel: channel !== null,
    status: currentStatus,
  };
}

/** Test-only reset. */
export function __resetBusForTests() {
  teardownChannel();
  handlers.clear();
  statusListeners.clear();
  refCount = 0;
  attempt = 0;
  currentStatus = "connecting";
}
