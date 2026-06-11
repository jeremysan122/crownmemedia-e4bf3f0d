// Short-lived in-memory cache for Discover queries.
//
// Goals:
//   - Make repeat opens / back-navigation feel instant.
//   - NEVER expose stale unsafe content: cache entries live for a short TTL
//     and are invalidated whenever moderation-relevant tables change.
//   - Cache key always includes the viewer's user_id and the full filter
//     context (window, radius, geo source, cursor) so users never see each
//     other's results.
//
// Notes:
//   - This cache is in-memory only. It does not persist across reloads, so
//     there is no risk of leaking content between sessions or users.
//   - All cached payloads are the same shape the live query returned: they
//     have already passed RLS, block/mute filtering, and the explicit
//     `is_removed=false`, `is_banned=false`, etc. checks at fetch time.
//   - For safety we tag entries with realtime invalidation channels: when
//     a relevant table changes (posts, battles, profiles, blocks) we drop
//     all matching entries instead of trying to surgically update them.

import { supabase } from "@/integrations/supabase/client";

export type DiscoverSection = "trending" | "battles" | "nearby";

const DEFAULT_TTL_MS = 60_000; // 60s — fast feel, safe-ish.

interface Entry<T> {
  value: T;
  expiresAt: number;
  section: DiscoverSection;
}

const store = new Map<string, Entry<unknown>>();

export function makeKey(section: DiscoverSection, parts: Record<string, string | number | null | undefined>): string {
  // Stable, sorted key so callers don't have to worry about field order.
  const norm = Object.keys(parts)
    .sort()
    .map((k) => `${k}=${parts[k] ?? ""}`)
    .join("&");
  return `${section}|${norm}`;
}

export function getCached<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

export function setCached<T>(key: string, section: DiscoverSection, value: T, ttlMs = DEFAULT_TTL_MS): void {
  store.set(key, { value, section, expiresAt: Date.now() + ttlMs });
}

export function invalidateSection(section: DiscoverSection): void {
  for (const [k, v] of store) if (v.section === section) store.delete(k);
}

export function invalidateAll(): void {
  store.clear();
}

// Wire realtime invalidation once per page load. Idempotent.
let wired = false;
export function wireRealtimeInvalidation(): () => void {
  if (wired) return () => {};
  wired = true;
  const channel = supabase
    .channel("discover-cache-invalidation")
    .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => invalidateSection("trending"))
    .on("postgres_changes", { event: "*", schema: "public", table: "battles" }, () => invalidateSection("battles"))
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
      invalidateSection("nearby");
      invalidateSection("trending"); // privacy/ban flips ripple here too
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "blocks" }, () => invalidateAll())
    .subscribe();
  return () => {
    wired = false;
    supabase.removeChannel(channel);
  };
}

// Test-only — clear without unsubscribing the realtime channel.
export function __resetCacheForTests(): void {
  store.clear();
}
