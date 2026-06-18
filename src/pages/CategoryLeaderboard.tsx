// Category Leaderboard — /leaderboard/c/:mainSlug
// Phase 3: Category + Topic, location + time scoped rankings.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { Crown, ArrowUp, ArrowDown, Minus, Globe2, MapPin, Building2, Trophy, Loader2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { fetchMainCategories, fetchSubcategories, type MainCategory, type Subcategory } from "@/lib/categories";

const PAGE_SIZE = 50;

type Period = "day" | "week" | "month" | "all";
type Scope = "global" | "country" | "state" | "city";

interface Row {
  rank: number;
  prev_rank: number | null;
  user_id: string;
  score: number;
  votes: number;
  username: string;
  profile_photo_url: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  crowns_held: number;
  snapshot_at: string;
}

const PERIODS: { id: Period; label: string }[] = [
  { id: "day", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "all", label: "All Time" },
];

const SCOPE_ICON: Record<Scope, typeof Globe2> = {
  global: Globe2,
  country: Globe2,
  state: MapPin,
  city: Building2,
};

export default function CategoryLeaderboard() {
  const { mainSlug = "" } = useParams();
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();

  const topic = params.get("topic") || "";
  const scope = (params.get("scope") as Scope) || "global";
  const period = (params.get("period") as Period) || "week";

  const [mains, setMains] = useState<MainCategory[]>([]);
  const [subs, setSubs] = useState<Subcategory[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const main = useMemo(() => mains.find((m) => m.slug === mainSlug), [mains, mainSlug]);
  const topicSub = useMemo(
    () => (topic ? subs.find((s) => s.slug === topic && s.main_category_id === main?.id) : null),
    [subs, topic, main],
  );
  const hubSubs = useMemo(
    () => subs.filter((s) => s.main_category_id === main?.id),
    [subs, main],
  );

  useSeoMeta({
    title: main ? `${main.label} Leaderboard — CrownMe` : "Category Leaderboard — CrownMe",
    description: `Top creators in ${main?.label ?? "this category"}. Scoped by location and time on CrownMe.`,
  });

  // Default scope_value from profile when picking country/state/city
  const scopeValue = useMemo(() => {
    if (scope === "global") return "";
    const v =
      scope === "country" ? profile?.country :
      scope === "state"   ? profile?.state :
      scope === "city"    ? profile?.city : "";
    return (v ?? "").toLowerCase();
  }, [scope, profile]);

  useEffect(() => {
    fetchMainCategories().then(setMains);
    fetchSubcategories().then(setSubs);
  }, []);

  const fetchPage = useCallback(async (limit: number): Promise<Row[] | null> => {
    const { data, error } = await (supabase.rpc as any)("get_category_leaderboard", {
      _main_slug: mainSlug,
      _sub_slug: topic || null,
      _scope_type: scope,
      _scope_value: scopeValue,
      _period: period,
      _limit: limit,
    });
    if (error) { console.error("[leaderboard]", error.message); return null; }
    return (data as Row[]) || [];
  }, [mainSlug, topic, scope, scopeValue, period]);

  // First page on filter change
  useEffect(() => {
    if (!mainSlug) return;
    if (scope !== "global" && !scopeValue) { setRows([]); setLoading(false); setHasMore(false); return; }
    let cancelled = false;
    setLoading(true);
    setHasMore(true);
    fetchPage(PAGE_SIZE).then((data) => {
      if (cancelled) return;
      const arr = data ?? [];
      setRows(arr);
      setHasMore(arr.length === PAGE_SIZE);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [mainSlug, scope, scopeValue, fetchPage]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    // RPC has no offset param; request a larger window and slice.
    // Server-side sort is stable on (score desc, user_id) so re-fetching is safe.
    const nextLimit = rows.length + PAGE_SIZE;
    const data = await fetchPage(nextLimit);
    if (data) {
      setRows(data);
      setHasMore(data.length === nextLimit);
    }
    setLoadingMore(false);
  }, [fetchPage, rows.length, loading, loadingMore, hasMore]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMore();
    }, { rootMargin: "400px 0px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  const updateParam = (key: string, val: string) => {
    const next = new URLSearchParams(params);
    if (val) next.set(key, val); else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl p-3 pb-24">
        {/* Header */}
        <header
          className={`rounded-2xl p-5 text-white mb-4 bg-gradient-to-br ${main?.gradient ?? "from-amber-400 to-yellow-600"} shadow-xl`}
        >
          <Link to={main ? `/c/${main.slug}${topic ? `/${topic}` : ""}` : "/discover"}
                className="text-xs uppercase tracking-widest opacity-80 hover:opacity-100">
            ← {main?.label ?? "Category"}
          </Link>
          <h1 className="text-2xl font-black mt-1 flex items-center gap-2">
            <Trophy size={22} /> {topicSub ? `${topicSub.label} Leaderboard` : `${main?.label ?? ""} Leaderboard`}
          </h1>
          <p className="text-sm opacity-90 mt-1">
            {PERIODS.find((p) => p.id === period)?.label} · {scope === "global" ? "Global" : (scopeValue || "—")}
          </p>
        </header>

        {/* Topic chips */}
        {hubSubs.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3 no-scrollbar">
            <button
              onClick={() => updateParam("topic", "")}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                !topic ? "bg-foreground text-background" : "bg-muted text-foreground"
              }`}
            >
              All Topics
            </button>
            {hubSubs.map((s) => (
              <button
                key={s.id}
                onClick={() => updateParam("topic", s.slug)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                  topic === s.slug ? "bg-foreground text-background" : "bg-muted text-foreground"
                }`}
              >
                {"🏷️"} {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Period + Scope */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="flex bg-muted rounded-full p-1">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => updateParam("period", p.id)}
                className={`flex-1 text-xs font-semibold py-1.5 rounded-full transition ${
                  period === p.id ? "bg-background shadow text-foreground" : "text-muted-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex bg-muted rounded-full p-1">
            {(["global", "country", "state", "city"] as Scope[]).map((s) => {
              const Icon = SCOPE_ICON[s];
              return (
                <button
                  key={s}
                  onClick={() => updateParam("scope", s)}
                  className={`flex-1 text-xs font-semibold py-1.5 rounded-full transition flex items-center justify-center gap-1 capitalize ${
                    scope === s ? "bg-background shadow text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <Icon size={12} /> {s}
                </button>
              );
            })}
          </div>
        </div>

        {/* Rankings */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Crown className="mx-auto mb-2 opacity-40" size={36} />
            <p className="text-sm">
              {scope !== "global" && !scopeValue
                ? `Set your ${scope} in your profile to see this leaderboard.`
                : "No rankings yet — be the first to compete!"}
            </p>
            <Link to={`/upload?main=${mainSlug}${topic ? `&sub=${topic}` : ""}`}
                  className="inline-block mt-3 px-4 py-2 rounded-full text-xs font-bold bg-primary text-primary-foreground">
              + Compete
            </Link>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {rows.map((r) => {
                const delta = r.prev_rank == null ? 0 : r.prev_rank - r.rank;
                const Arrow = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
                const deltaCls =
                  delta > 0 ? "text-emerald-500" : delta < 0 ? "text-rose-500" : "text-muted-foreground";
                const podium = r.rank <= 3;
                return (
                  <li
                    key={r.user_id}
                    className={`flex items-center gap-3 p-3 rounded-xl border animate-fade-in ${
                      podium ? "bg-gradient-to-r from-amber-500/10 to-transparent border-amber-500/30" : "bg-card border-border"
                    }`}
                  >
                    <div className={`w-9 text-center font-black ${podium ? "text-amber-500" : "text-foreground"}`}>
                      {r.rank <= 3 ? <Crown className="mx-auto" size={20} /> : `#${r.rank}`}
                    </div>
                    <Link to={`/${r.username}`} className="flex items-center gap-3 flex-1 min-w-0">
                      {r.profile_photo_url ? (
                        <img src={r.profile_photo_url} alt={r.username} className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-muted" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm truncate">@{r.username}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {[r.city, r.state, r.country].filter(Boolean).join(", ") || "—"}
                          {r.crowns_held > 0 && <span className="ml-2">👑 {r.crowns_held}</span>}
                        </div>
                      </div>
                    </Link>
                    <div className="text-right">
                      <div className="text-sm font-extrabold tabular-nums">{Math.round(r.score).toLocaleString()}</div>
                      <div className={`text-[11px] flex items-center justify-end gap-0.5 ${deltaCls}`}>
                        <Arrow size={12} />
                        {delta !== 0 ? Math.abs(delta) : "—"}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div ref={sentinelRef} className="h-1" aria-hidden="true" />
            {loadingMore && (
              <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                <Loader2 size={14} className="animate-spin" /> Loading more…
              </div>
            )}
            {!hasMore && rows.length >= PAGE_SIZE && (
              <p className="text-center text-[10px] text-muted-foreground uppercase tracking-wider py-3">
                · End of leaderboard ·
              </p>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
