import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Crown, TrendingUp } from "lucide-react";
import type { CrownCategory } from "@/lib/crown";

export type RegionScope = "city" | "state" | "country" | "global";

interface Props {
  postId: string;
  /** Live vote breakdown so the race % matches the authoritative scoring formula. */
  votes: { crown: number; fire: number; diamond: number };
  comments: number;
  shares: number;
  battleWins: number;
  /** Fallback score if the live breakdown isn't ready yet. */
  fallbackScore: number;
  category: CrownCategory;
  city: string | null;
  state: string | null;
  country: string | null;
  /** Which region tier to compare against. Defaults to most local available. */
  scope?: RegionScope;
}

interface CrownLeader {
  user_id: string;
  post_id: string | null;
  crown_score: number;
  region_name: string;
}

// ── Module-level TTL cache ───────────────────────────────────────────────────
// Shared across all mounted RaceProgressBar instances so that multiple cards
// in the same category/region (e.g. 25 "city:Austin:fitness" posts) only fire
// ONE crown-leader query instead of 25 parallel ones. 30-second TTL; realtime
// channel updates invalidate entries immediately via setCachedLeader(key, null).
const LEADER_CACHE_TTL_MS = 30_000;
interface LeaderCacheEntry { data: CrownLeader | null; ts: number }
const leaderCache = new Map<string, LeaderCacheEntry>();

function getCachedLeader(key: string): CrownLeader | null | undefined {
  const entry = leaderCache.get(key);
  if (!entry) return undefined; // cache miss
  if (Date.now() - entry.ts > LEADER_CACHE_TTL_MS) { leaderCache.delete(key); return undefined; }
  return entry.data;
}
function setCachedLeader(key: string, data: CrownLeader | null) {
  leaderCache.set(key, { data, ts: Date.now() });
}
function invalidateCachedLeader(key: string) {
  leaderCache.delete(key);
}

function pickScope(city: string | null, state: string | null, country: string | null): RegionScope {
  if (city) return "city";
  if (state) return "state";
  if (country) return "country";
  return "global";
}

function regionName(scope: RegionScope, city: string | null, state: string | null, country: string | null): string | null {
  if (scope === "city") return city;
  if (scope === "state") return state;
  if (scope === "country") return country;
  return "Global";
}

const SCOPE_LABEL: Record<RegionScope, string> = {
  city: "City",
  state: "State",
  country: "Country",
  global: "Global",
};

/**
 * Mirrors public.recalc_post_score():
 *   base   = crown*1 + fire*0.5 + diamond*1.5
 *   score  = (base + base*comments*0.01 + shares*0.25 + battle_wins*5) * boost
 * Boost (1.5×) is applied if the post currently has an active royal_boost.
 */
export function computeWeightedScore(
  v: { crown: number; fire: number; diamond: number },
  comments: number,
  shares: number,
  battleWins: number,
  boost: number,
): number {
  const base = v.crown * 1 + v.fire * 0.5 + v.diamond * 1.5;
  const raw = base + base * (comments * 0.01) + shares * 0.25 + battleWins * 5;
  return raw * (boost || 1);
}

/**
 * Shows how close this post is to overtaking the current crown holder
 * in the selected region & category. The percent uses the same weighted
 * Crown Score math as the server (votes + comment 1% + share 0.25 + battle 5)
 * times an active royal_boost multiplier.
 */
export default function RaceProgressBar({
  postId, votes, comments, shares, battleWins, fallbackScore,
  category, city, state, country, scope,
}: Props) {
  const effectiveScope = scope ?? pickScope(city, state, country);
  const region = regionName(effectiveScope, city, state, country);
  const [leader, setLeader] = useState<CrownLeader | null>(null);
  const [loading, setLoading] = useState(true);
  const [boost, setBoost] = useState(1);

  // Detect active royal_boost so the % matches what the trigger computes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("boosts")
        .select("id, expires_at")
        .eq("post_id", postId)
        .eq("boost_type", "royal_boost")
        .eq("active", true)
        .limit(1);
      if (cancelled) return;
      const live = (data ?? []).some((b: { expires_at: string | null }) =>
        !b.expires_at || new Date(b.expires_at).getTime() > Date.now()
      );
      setBoost(live ? 1.5 : 1);
    })();
    const ch = supabase
      .channel(`race-boost-${postId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "boosts", filter: `post_id=eq.${postId}` }, () => {
        // re-check active boost on any change
        supabase
          .from("boosts").select("id, expires_at")
          .eq("post_id", postId).eq("boost_type", "royal_boost").eq("active", true)
          .then(({ data }) => {
            if (cancelled) return;
            const live = (data ?? []).some((b: { expires_at: string | null }) =>
              !b.expires_at || new Date(b.expires_at).getTime() > Date.now()
            );
            setBoost(live ? 1.5 : 1);
          });
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [postId]);

  useEffect(() => {
    if (!region) { setLoading(false); return; }
    let cancelled = false;
    const cacheKey = `${effectiveScope}:${region}:${category}`;

    // Serve from cache immediately if available (avoids N+1 on feed load).
    const cached = getCachedLeader(cacheKey);
    if (cached !== undefined) {
      setLeader(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const fetchLeader = async () => {
      const { data } = await supabase
        .from("crowns")
        .select("user_id, post_id, crown_score, region_name")
        .eq("active", true)
        .eq("region_type", effectiveScope)
        .eq("region_name", region)
        .eq("category", category)
        .order("crown_score", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        const result = (data as CrownLeader) ?? null;
        setCachedLeader(cacheKey, result);
        setLeader(result);
        setLoading(false);
      }
    };

    fetchLeader();

    // Channel name must be unique per subscriber instance — Supabase v2 throws
    // "cannot add postgres_changes callbacks" when re-binding an already-subscribed channel.
    const ch = supabase
      .channel(`race-leader-${effectiveScope}-${region}-${category}-${postId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crowns", filter: `region_type=eq.${effectiveScope}` },
        () => {
          // Invalidate the cache entry so the next render triggers a fresh fetch.
          invalidateCachedLeader(cacheKey);
          fetchLeader();
        },
      ).subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [postId, region, effectiveScope, category]);

  // Authoritative weighted score; falls back to the prop if live counts haven't loaded.
  const weighted = useMemo(() => {
    const w = computeWeightedScore(votes, comments, shares, battleWins, boost);
    return w > 0 ? w : fallbackScore;
  }, [votes, comments, shares, battleWins, boost, fallbackScore]);

  const status = useMemo(() => {
    if (!region) return { kind: "none" as const };
    if (loading) return { kind: "loading" as const };
    if (!leader || leader.crown_score <= 0) {
      return { kind: "open" as const };
    }
    if (leader.post_id === postId || weighted >= leader.crown_score) {
      return { kind: "holder" as const, leaderScore: leader.crown_score };
    }
    const gap = Math.max(0, leader.crown_score - weighted);
    const pct = Math.min(99, Math.max(1, Math.round((weighted / leader.crown_score) * 100)));
    return { kind: "racing" as const, pct, gap, leaderScore: leader.crown_score };
  }, [region, loading, leader, postId, weighted]);

  if (!region) return null;
  if (status.kind === "loading") {
    return (
      <div className="px-3 pt-2 pb-1">
        <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden animate-pulse" />
      </div>
    );
  }

  const boostBadge = boost > 1 ? <span className="text-[9px] text-amber-300 font-bold">·1.5×</span> : null;

  return (
    <div className="px-3 pt-2 pb-1 space-y-1">
      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider">
        <span className="flex items-center gap-1 text-muted-foreground">
          <TrendingUp size={10} className="text-primary" />
          {SCOPE_LABEL[effectiveScope]} race · {region} {boostBadge}
        </span>
        {status.kind === "holder" && (
          <span className="flex items-center gap-1 text-amber-300 font-bold">
            <Crown size={10} fill="currentColor" /> Holder
          </span>
        )}
        {status.kind === "open" && (
          <span className="text-emerald-300 font-bold">Open crown</span>
        )}
        {status.kind === "racing" && (
          <span className="text-foreground/80 font-bold tabular-nums">{status.pct}%</span>
        )}
      </div>

      <div
        className="h-1.5 rounded-full bg-muted/40 overflow-hidden relative"
        role="progressbar"
        aria-label={`Race progress in ${region}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={status.kind === "racing" ? status.pct : status.kind === "holder" ? 100 : 0}
      >
        <div
          className={
            status.kind === "holder"
              ? "h-full bg-gradient-to-r from-amber-400 to-yellow-500 shadow-[0_0_12px_hsl(43_95%_60%/0.6)]"
              : status.kind === "open"
                ? "h-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                : "h-full bg-gradient-to-r from-primary/70 to-primary"
          }
          style={{
            width:
              status.kind === "holder" ? "100%"
              : status.kind === "open" ? "100%"
              : `${status.pct}%`,
            transition: "width 600ms ease-out",
          }}
        />
      </div>

      {status.kind === "racing" && (
        <p className="text-[10px] text-muted-foreground tabular-nums">
          {status.gap.toFixed(1)} pts behind the holder
        </p>
      )}
    </div>
  );
}
