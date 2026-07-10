// Wave 4 — Battler tools: battle-level moderation controls (comments locked,
// slow mode, keyword filters) and beauty filter settings persistence.
//
// The RPC `set_battle_moderation` is host-or-mod only and is the single
// server-side path for editing these fields; the client never writes them
// directly. Keyword matching helper is also used to defensively hide any
// stray keyword-matching comment that slips through (defense-in-depth
// alongside the RLS policy).

import { supabase } from "@/integrations/supabase/client";
import type { LiveBattleRow } from "@/lib/liveBattles";

export interface BattleModerationInput {
  commentsLocked?: boolean;
  slowModeSeconds: number;
  keywordFilters: string[];
}

export const SLOW_MODE_OPTIONS: { seconds: number; label: string }[] = [
  { seconds: 0, label: "Off" },
  { seconds: 5, label: "5s" },
  { seconds: 10, label: "10s" },
  { seconds: 30, label: "30s" },
  { seconds: 60, label: "1m" },
];

export const MAX_KEYWORDS = 32;
export const MAX_KEYWORD_LEN = 40;

/** Sanitize a keyword: trim, clamp length, drop empties. */
export function sanitizeKeyword(word: string): string {
  return word.trim().slice(0, MAX_KEYWORD_LEN);
}

/** Dedup + sanitize + cap a keyword list. */
export function sanitizeKeywordList(words: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of words) {
    const w = sanitizeKeyword(raw);
    if (!w) continue;
    const key = w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

/** Case-insensitive substring match: does `body` contain any keyword? */
export function bodyMatchesKeyword(body: string, keywords: string[]): boolean {
  if (!keywords || keywords.length === 0) return false;
  const b = body.toLowerCase();
  for (const kw of keywords) {
    const k = kw.trim().toLowerCase();
    if (k && b.includes(k)) return true;
  }
  return false;
}

/** Read the live_battles.keyword_filters JSONB column defensively as string[]. */
export function readKeywordFilters(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

export async function setBattleModeration(
  battleId: string,
  input: BattleModerationInput,
): Promise<LiveBattleRow> {
  const cleaned = sanitizeKeywordList(input.keywordFilters);
  const { data, error } = await supabase.rpc("set_battle_moderation" as never, {
    _battle_id: battleId,
    _comments_locked: input.commentsLocked ?? null,
    _slow_mode_seconds: input.slowModeSeconds,
    _keyword_filters: cleaned,
  } as never);
  if (error) throw error;
  return data as unknown as LiveBattleRow;
}

export function moderationErrorMessage(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? "").toLowerCase();
  if (msg.includes("not_authenticated")) return "Please sign in to change moderation settings.";
  if (msg.includes("not_authorized")) return "Only the host or a moderator can change these settings.";
  if (msg.includes("battle_not_found")) return "This battle is no longer available.";
  if (msg.includes("invalid_slow_mode")) return "Slow mode must be between 0 and 300 seconds.";
  return "Couldn't update moderation settings. Try again.";
}

/** Friendly reason when a comment insert is rejected by the tightened policy. */
export function commentBlockedReason(err: unknown): string | null {
  const msg = String((err as { message?: string })?.message ?? "").toLowerCase();
  if (!msg) return null;
  // The RLS violation surfaces as a policy / permission error, but we can't
  // tell WHY without a round-trip. The caller inspects local state
  // (comments_locked / slow-mode / keyword) to render the accurate reason.
  if (/policy|denied|violat/.test(msg)) return "blocked_by_policy";
  return null;
}

// ---- Beauty filter (client-only, persists per-user in localStorage) ----

export interface BeautyFilterSettings {
  enabled: boolean;
  brightness: number; // 0.5..1.5
  contrast: number;   // 0.5..1.5
  smoothing: number;  // 0..6 (px blur)
}

export const DEFAULT_BEAUTY: BeautyFilterSettings = {
  enabled: false,
  brightness: 1,
  contrast: 1,
  smoothing: 0,
};

const BEAUTY_KEY = "cm.battle.beauty.v1";

export function loadBeautySettings(): BeautyFilterSettings {
  if (typeof window === "undefined") return DEFAULT_BEAUTY;
  try {
    const raw = window.localStorage.getItem(BEAUTY_KEY);
    if (!raw) return DEFAULT_BEAUTY;
    const parsed = JSON.parse(raw) as Partial<BeautyFilterSettings>;
    return {
      enabled: !!parsed.enabled,
      brightness: clamp(parsed.brightness ?? 1, 0.5, 1.5),
      contrast: clamp(parsed.contrast ?? 1, 0.5, 1.5),
      smoothing: clamp(parsed.smoothing ?? 0, 0, 6),
    };
  } catch {
    return DEFAULT_BEAUTY;
  }
}

export function saveBeautySettings(s: BeautyFilterSettings) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(BEAUTY_KEY, JSON.stringify(s)); } catch { /* quota */ }
}

export function beautyCssFilter(s: BeautyFilterSettings): string {
  if (!s.enabled) return "none";
  return `brightness(${s.brightness}) contrast(${s.contrast}) blur(${s.smoothing}px) saturate(1.05)`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
}
