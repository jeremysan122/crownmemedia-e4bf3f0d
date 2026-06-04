// Discover — premium category-driven discovery surface (Phase 2).
//
// Sections:
//   1. Trending Hubs        — top 6 hubs by 7d post volume
//   2. Featured Topics      — featured subcategories across the platform
//   3. Recently Crowned     — newest crown holders
//   4. Rising Stars         — biggest 7d crown_score gainers
//   5. All Royal Hubs       — full directory
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  TrendingUp, Crown, Flame, Sparkles, ArrowRight, Star, Zap, Trophy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCategoryTree } from "@/lib/categories";
import TrendingHashtags from "@/components/TrendingHashtags";

interface HubStat {
  slug: string;
  post_count_7d: number;
  champion_username: string | null;
  champion_avatar: string | null;
  active_competitors: number;
}

interface RecentCrown {
  id: string;
  category: string;
  awarded_at: string;
  user: { username: string; profile_photo_url: string | null } | null;
}

interface RisingStar {
  user_id: string;
  username: string;
  profile_photo_url: string | null;
  gained: number;
}

export default function Discover() {
  const { mains, subs, loading } = useCategoryTree();
  const [stats, setStats] = useState<Record<string, HubStat>>({});
  const [recent, setRecent] = useState<RecentCrown[]>([]);
  const [rising, setRising] = useState<RisingStar[]>([]);

  // Featured topics (admin-flagged) across all hubs
  const featuredTopics = useMemo(
    () => subs.filter((s) => s.is_featured).slice(0, 8),
    [subs]
  );

  useEffect(() => {
    if (mains.length === 0) return;
    (async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: rows } = await supabase
        .from("posts")
        .select("main_category_slug, user_id, crown_score")
        .gte("created_at", since)
        .eq("is_removed", false)
        .not("main_category_slug", "is", null)
        .limit(5000);

      const counts = new Map<string, number>();
      const competitors = new Map<string, Set<string>>();
      ((rows as any[]) || []).forEach((r) => {
        counts.set(r.main_category_slug, (counts.get(r.main_category_slug) ?? 0) + 1);
        if (!competitors.has(r.main_category_slug)) competitors.set(r.main_category_slug, new Set());
        competitors.get(r.main_category_slug)!.add(r.user_id);
      });

      const champs = await Promise.all(
        mains.map(async (m) => {
          const { data } = await supabase
            .from("posts")
            .select("profile:profiles!posts_user_id_fkey(username, profile_photo_url)")
            .eq("main_category_slug", m.slug)
            .eq("is_removed", false)
            .order("crown_score", { ascending: false })
            .limit(1);
          const c = (data as any[])?.[0]?.profile;
          return [m.slug, c?.username ?? null, c?.profile_photo_url ?? null] as const;
        })
      );

      const next: Record<string, HubStat> = {};
      mains.forEach((m, i) => {
        next[m.slug] = {
          slug: m.slug,
          post_count_7d: counts.get(m.slug) ?? 0,
          champion_username: champs[i][1],
          champion_avatar: champs[i][2],
          active_competitors: competitors.get(m.slug)?.size ?? 0,
        };
      });
      setStats(next);
    })();
  }, [mains]);

  // Recently crowned
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("crowns")
        .select("id, category, awarded_at, user:profiles!crowns_user_id_fkey(username, profile_photo_url)")
        .eq("active", true)
        .order("awarded_at", { ascending: false })
        .limit(8);
      setRecent((data as any) || []);
    })();
  }, []);

  // Rising stars — top 7d crown_score gainers
  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("posts")
        .select("user_id, crown_score, profile:profiles!posts_user_id_fkey(username, profile_photo_url)")
        .gte("created_at", since)
        .eq("is_removed", false)
        .order("crown_score", { ascending: false })
        .limit(200);
      const map = new Map<string, RisingStar>();
      ((data as any[]) || []).forEach((p) => {
        const cur = map.get(p.user_id);
        if (cur) cur.gained += Number(p.crown_score) || 0;
        else if (p.profile)
          map.set(p.user_id, {
            user_id: p.user_id,
            username: p.profile.username,
            profile_photo_url: p.profile.profile_photo_url,
            gained: Number(p.crown_score) || 0,
          });
      });
      setRising([...map.values()].sort((a, b) => b.gained - a.gained).slice(0, 6));
    })();
  }, []);

  const sortedMains = useMemo(
    () => [...mains].sort((a, b) => (stats[b.slug]?.post_count_7d ?? 0) - (stats[a.slug]?.post_count_7d ?? 0)),
    [mains, stats]
  );

  return (
    <main className="max-w-5xl mx-auto px-4 pb-24">
      <header className="pt-6 pb-4">
        <h1 className="font-display text-3xl mb-1">Discover</h1>
        <p className="text-sm text-muted-foreground">Browse every kingdom. Crown a category.</p>
      </header>

      <section className="mb-6">
        <TrendingHashtags />
      </section>

      {/* Trending Hubs */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg flex items-center gap-2">
            <Flame size={16} className="text-primary" />Trending Hubs
          </h2>
          <Link to="#all-hubs" className="text-[11px] text-muted-foreground hover:text-primary">See all</Link>
        </div>
        {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {sortedMains.slice(0, 6).map((m) => {
            const stat = stats[m.slug];
            return (
              <Link
                key={m.id}
                to={`/c/${m.slug}`}
                className={`relative rounded-2xl overflow-hidden p-4 bg-gradient-to-br ${m.gradient ?? "from-amber-400 to-yellow-600"} text-white shadow group hover:scale-[1.02] transition`}
              >
                <div className="absolute inset-0 bg-black/25" />
                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] uppercase tracking-widest opacity-80">Hub</p>
                    {(stat?.post_count_7d ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded-full backdrop-blur">
                        <TrendingUp size={9} />Hot
                      </span>
                    )}
                  </div>
                  <p className="font-display text-lg leading-tight mb-2">{m.label}</p>
                  <div className="flex items-center justify-between text-[11px] opacity-95">
                    <span>{stat?.post_count_7d ?? 0} posts · {stat?.active_competitors ?? 0} 👥</span>
                    {stat?.champion_username && (
                      <span className="truncate max-w-[7rem]">👑 @{stat.champion_username}</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Featured Topics */}
      {featuredTopics.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display text-lg mb-3 flex items-center gap-2">
            <Star size={16} className="text-primary" />Featured Topics
          </h2>
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
            {featuredTopics.map((t) => {
              const m = mains.find((mm) => mm.id === t.main_category_id);
              return (
                <Link
                  key={t.id}
                  to={`/c/${m?.slug ?? ""}/${t.slug}`}
                  className="shrink-0 royal-card px-3 py-2 hover:border-primary/40 transition flex items-center gap-2"
                >
                  <div className={`size-7 rounded-lg bg-gradient-to-br ${m?.gradient ?? "from-amber-400 to-yellow-600"} text-white flex items-center justify-center`}>
                    <Crown size={11} fill="currentColor" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold leading-tight truncate">{t.label}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{m?.label}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Recently Crowned + Rising Stars */}
      <section className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="royal-card p-4">
          <h2 className="font-display text-base mb-3 flex items-center gap-2">
            <Trophy size={14} className="text-primary" />Recently Crowned
          </h2>
          {recent.length === 0 && <p className="text-xs text-muted-foreground">No crowns awarded yet.</p>}
          <ul className="space-y-2">
            {recent.slice(0, 5).map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <div className="size-8 rounded-full bg-muted overflow-hidden">
                  {c.user?.profile_photo_url && (
                    <img src={c.user.profile_photo_url} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold truncate">@{c.user?.username ?? "unknown"}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{c.category.replace(/_/g, " ")}</p>
                </div>
                <Crown size={12} className="text-gold shrink-0" fill="currentColor" />
              </li>
            ))}
          </ul>
        </div>

        <div className="royal-card p-4">
          <h2 className="font-display text-base mb-3 flex items-center gap-2">
            <Zap size={14} className="text-primary" />Rising Stars (7d)
          </h2>
          {rising.length === 0 && <p className="text-xs text-muted-foreground">No risers yet this week.</p>}
          <ul className="space-y-2">
            {rising.map((r, i) => (
              <li key={r.user_id} className="flex items-center gap-2">
                <span className="text-[10px] font-bold w-4 text-muted-foreground">#{i + 1}</span>
                <div className="size-8 rounded-full bg-muted overflow-hidden">
                  {r.profile_photo_url && (
                    <img src={r.profile_photo_url} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <Link to={`/profile/${r.username}`} className="min-w-0 flex-1 hover:text-primary">
                  <p className="text-xs font-bold truncate">@{r.username}</p>
                  <p className="text-[10px] text-muted-foreground">+{r.gained} crown score</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* All Royal Hubs */}
      <section id="all-hubs">
        <h2 className="font-display text-lg mb-3 flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />All Royal Hubs
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {mains.map((m) => {
            const stat = stats[m.slug];
            return (
              <Link
                key={m.id}
                to={`/c/${m.slug}`}
                className="royal-card p-3 flex items-center gap-3 hover:border-primary/40 transition group"
              >
                <div className={`size-10 rounded-xl bg-gradient-to-br ${m.gradient ?? "from-amber-400 to-yellow-600"} flex items-center justify-center text-white shadow`}>
                  <Crown size={16} fill="currentColor" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">{m.label}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {stat?.post_count_7d ?? 0} posts · {stat?.active_competitors ?? 0} competing
                  </p>
                </div>
                <ArrowRight size={14} className="text-muted-foreground group-hover:text-primary transition" />
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
