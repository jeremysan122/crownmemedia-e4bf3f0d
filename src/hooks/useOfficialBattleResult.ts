// useOfficialBattleResult
// ------------------------
// Authoritative ended-battle result fetcher backed by the
// `get_battle_official_result(battle_id)` Postgres RPC.
//
// Why a hook (and not a one-off fetch in the page):
//   - We only want to call the RPC for battles whose status is `ended`.
//   - We want a single in-flight request per battle id, so a list of cards
//     all showing the same battle (Discover preview, list card, detail
//     page) share one network round-trip.
//   - We want a tiny shared cache keyed by battle id with a short TTL so
//     back-navigation + repeat cards feel instant — and we ALWAYS bypass
//     the cache once a realtime vote/status change comes in (the page
//     already wires that and can call `invalidateOfficialResult`).
//   - The cache lives in-memory only (no persistence), so it cannot leak
//     across users or sessions.
//
// Privacy: the RPC enforces banned/suspended/deleted exclusion server-side
// and returns ONLY a small public payload (kind + winner_id + vote totals).
// No raw profile fields are returned, so caching this payload is safe.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type OfficialResult =
  | { kind: "pending" }
  | { kind: "winner"; winner_id: string; winner_votes: number; loser_votes: number }
  | { kind: "tie"; votes: number }
  | { kind: "none"; reason?: "no_votes" | "no_eligible_votes" | "participants_unavailable" | "not_found" };

type CacheEntry = { value: OfficialResult; expiresAt: number };

const TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<OfficialResult>>();

export function invalidateOfficialResult(battleId?: string): void {
  if (battleId) cache.delete(battleId);
  else cache.clear();
}

/** Test-only — clear the module-level cache + inflight maps. */
export function __resetOfficialResultForTests(): void {
  cache.clear();
  inflight.clear();
}

export function normalizeOfficialResult(raw: unknown): OfficialResult {
  if (!raw || typeof raw !== "object") return { kind: "none", reason: "not_found" };
  const r = raw as Record<string, unknown>;
  const kind = String(r.kind ?? "");
  if (kind === "pending") return { kind: "pending" };
  if (kind === "tie") return { kind: "tie", votes: Number(r.votes) || 0 };
  if (kind === "winner" && typeof r.winner_id === "string") {
    return {
      kind: "winner",
      winner_id: r.winner_id,
      winner_votes: Number(r.winner_votes) || 0,
      loser_votes: Number(r.loser_votes) || 0,
    };
  }
  const reason = typeof r.reason === "string"
    ? (["no_votes", "no_eligible_votes", "participants_unavailable", "not_found"].includes(r.reason)
        ? (r.reason as "no_votes")
        : undefined)
    : undefined;
  return { kind: "none", reason };
}

async function fetchOnce(battleId: string): Promise<OfficialResult> {
  const cached = cache.get(battleId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const existing = inflight.get(battleId);
  if (existing) return existing;
  const p = (async () => {
    const { data, error } = await supabase.rpc("get_battle_official_result", { _battle_id: battleId });
    if (error) throw error;
    const value = normalizeOfficialResult(data);
    cache.set(battleId, { value, expiresAt: Date.now() + TTL_MS });
    return value;
  })();
  inflight.set(battleId, p);
  try {
    return await p;
  } finally {
    inflight.delete(battleId);
  }
}

export interface UseOfficialBattleResult {
  result: OfficialResult | null;
  loading: boolean;
  error: boolean;
  refresh: () => void;
}

/**
 * Fetches the official ended-battle result. Returns `result=null, loading=false`
 * when disabled (e.g. the battle isn't ended yet) so callers can render a
 * "live percentages" view instead.
 */
export function useOfficialBattleResult(battleId: string, enabled: boolean): UseOfficialBattleResult {
  const [result, setResult] = useState<OfficialResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const tickRef = useRef(0);

  const run = useCallback(() => {
    if (!enabled || !battleId) {
      setResult(null);
      setError(false);
      return;
    }
    const tick = ++tickRef.current;
    setLoading(true);
    setError(false);
    fetchOnce(battleId)
      .then((v) => { if (tick === tickRef.current) setResult(v); })
      .catch(() => { if (tick === tickRef.current) setError(true); })
      .finally(() => { if (tick === tickRef.current) setLoading(false); });
  }, [battleId, enabled]);

  useEffect(() => { run(); }, [run]);

  const refresh = useCallback(() => {
    invalidateOfficialResult(battleId);
    run();
  }, [battleId, run]);

  return { result, loading, error, refresh };
}
