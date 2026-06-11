// Discover — premium category-driven discovery surface.
//
// Sections:
//   1. Search bar
//   2. Trending Hubs (with time filter)
//   3. Featured Topics
//   4. Trending Posts (top crown_score in window)
//   5. Live & Upcoming Battles
//   6. Suggested Creators to Follow
//   7. Top Gifters (this week)
//   8. Recently Crowned + Rising Stars
//   9. Royal Pass spotlight (non-members)
//  10. All Royal Hubs
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  TrendingUp, Crown, Flame, Sparkles, ArrowRight, Star, Zap, Trophy,
  Search, Swords, UserPlus, Gift, ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCategoryTree } from "@/lib/categories";
import TrendingHashtags from "@/components/TrendingHashtags";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useAuth } from "@/context/AuthContext";
import { useIsRoyalPassUser } from "@/hooks/useIsRoyalPassUser";

interface HubStat {
  slug: string;
  post_count: number;
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

interface TrendingPost {
  id: string;
  image_url: string | null;
  image_urls: string[] | null;
  video_poster_url: string | null;
  media_type: string | null;
  crown_score: number;
  caption: string | null;
  profile: { username: string; profile_photo_url: string | null } | null;
}

interface LiveBattle {
  id: string;
  ends_at: string;
  challenger_votes: number;
  opponent_votes: number;
  challenger: { username: string; profile_photo_url: string | null } | null;
  opponent: { username: string; profile_photo_url: string | null } | null;
}

interface SuggestedUser {
  id: string;
  username: string;
  profile_photo_url: string | null;
  bio: string | null;
  crown_score: number;
}

interface TopGifter {
  user_id: string;
  username: string;
  profile_photo_url: string | null;
  total: number;
}

type Window = "24h" | "7d" | "30d";
const WINDOW_HOURS: Record<Window, number> = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-secondary/40 rounded-lg ${className}`} />;
}

export default function Discover() {
  useSeoMeta({
    title: "Discover — Trending hubs, creators & battles",
    description:
      "Explore CrownMe's trending royal hubs, rising creators, live battles, top gifters and featured topics.",
  });

  const { user } = useAuth();
  const isRoyal = useIsRoyalPassUser(user?.id);
  const nav = useNavigate();
  const { mains, subs, loading } = useCategoryTree();

  const [windowSel, setWindowSel] = useState<Window>("7d");
  const [stats, setStats] = useState<Record<string, HubStat>>({});
  const [recent, setRecent] = useState<RecentCrown[]>([]);
  const [rising, setRising] = useState<RisingStar[]>([]);
  const [trendingPosts, setTrendingPosts] = useState<TrendingPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [battles, setBattles] = useState<LiveBattle[]>([]);
  const [suggested, setSuggested] = useState<SuggestedUser[]>([]);
  const [gifters, setGifters] = useState<TopGifter[]>([]);
  const [search, setSearch] = useState("");

  const featuredTopics = useMemo(
    () => subs.filter((s) => s.is_featured).slice(0, 8),
    [subs]
  );

  // Hub stats (varies with time window)
  useEffect(() => {
    if (mains.length === 0) return;
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - WINDOW_HOURS[windowSel] * 60 * 60 * 1000).toISOString();
      const { data: rows } = await supabase
        .from("posts")
        .select("main_category_slug, user_id")
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

      if (cancelled) return;
      const next: Record<string, HubStat> = {};
      mains.forEach((m, i) => {
        next[m.slug] = {
          slug: m.slug,
          post_count: counts.get(m.slug) ?? 0,
          champion_username: champs[i][1],
          champion_avatar: champs[i][2],
          active_competitors: competitors.get(m.slug)?.size ?? 0,
        };
      });
      setStats(next);
    })();
    return () => { cancelled = true; };
  }, [mains, windowSel]);

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

  // Rising stars
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

  // Trending posts (varies with window)
  useEffect(() => {
    let cancelled = false;
    setPostsLoading(true);
    (async () => {
      const since = new Date(Date.now() - WINDOW_HOURS[windowSel] * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("posts")
        .select("id, image_url, image_urls, video_poster_url, media_type, crown_score, caption, profile:profiles!posts_user_id_fkey(username, profile_photo_url)")
        .gte("created_at", since)
        .eq("is_removed", false)
        .eq("is_archived", false)
        .order("crown_score", { ascending: false })
        .limit(9);
      if (!cancelled) {
        setTrendingPosts((data as any) || []);
        setPostsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [windowSel]);

  // Live battles (upcoming/active)
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("battles")
        .select("id, ends_at, challenger_votes, opponent_votes, challenger:profiles!battles_challenger_id_fkey(username, profile_photo_url), opponent:profiles!battles_opponent_id_fkey(username, profile_photo_url)")
        .in("status", ["active", "pending"])
        .gt("ends_at", new Date().toISOString())
        .order("ends_at", { ascending: true })
        .limit(4);
      setBattles((data as any) || []);
    })();
  }, []);

  // Suggested creators (top crown_score not already followed)
  useEffect(() => {
    (async () => {
      let excludeIds: string[] = [];
      if (user) {
        const { data: f } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", user.id);
        excludeIds = ((f as any[]) || []).map((r) => r.following_id);
        excludeIds.push(user.id);
      }
      let q: any = supabase
        .from("profiles")
        .select("id, username, profile_photo_url, bio, crown_score")
        .not("username", "is", null)
        .order("crown_score", { ascending: false })
        .limit(20);
      if (excludeIds.length > 0) q = q.not("id", "in", `(${excludeIds.join(",")})`);
      const { data } = await q;
      setSuggested(((data as any[]) || []).slice(0, 6));
    })();
  }, [user]);

  // Top gifters (last 7d, by total_shekels sent)
  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("gift_transactions")
        .select("sender_id, total_shekels, sender:profiles!gift_transactions_sender_id_fkey(username, profile_photo_url)")
        .gte("created_at", since)
        .eq("status", "completed")
        .limit(500);
      const map = new Map<string, TopGifter>();
      ((data as any[]) || []).forEach((g) => {
        if (!g.sender) return;
        const cur = map.get(g.sender_id);
        const add = Number(g.total_shekels) || 0;
        if (cur) cur.total += add;
        else map.set(g.sender_id, {
          user_id: g.sender_id,
          username: g.sender.username,
          profile_photo_url: g.sender.profile_photo_url,
          total: add,
        });
      });
      setGifters([...map.values()].sort((a, b) => b.total - a.total).slice(0, 5));
    })();
  }, []);

  const sortedMains = useMemo(
    () => [...mains].sort((a, b) => (stats[b.slug]?.post_count ?? 0) - (stats[a.slug]?.post_count ?? 0)),
    [mains, stats]
  );

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    if (q.startsWith("#")) nav(`/feed?tag=${encodeURIComponent(q.slice(1))}`);
    else if (q.startsWith("@")) nav(`/profile/${encodeURIComponent(q.slice(1))}`);
    else nav(`/feed?q=${encodeURIComponent(q)}`);
  };

  const postCover = (p: TrendingPost): string | null => {
    if (p.video_poster_url) return p.video_poster_url;
    if (p.image_urls && p.image_urls.length > 0) return p.image_urls[0];
    return p.image_url ?? null;
  };

  return (
    <main className="max-w-5xl mx-auto px-4 pb-24">
      <header className="pt-6 pb-4">
        <h1 className="font-display text-3xl mb-1">Discover</h1>
        <p className="text-sm text-muted-foreground">Browse every kingdom. Crown a category.</p>
      </header>

      {/* Search */}
      <form onSubmit={onSearchSubmit} className="mb-5">
        <label className="relative block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search posts, @users or #tags…"
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-card border border-border focus:border-primary/60 outline-none text-sm"
            aria-label="Search CrownMe"
          />
        </label>
      </form>

      <section className="mb-6">
        <TrendingHashtags />
      </section>

      {/* Trending Hubs + time filter */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3 gap-3">
          <h2 className="font-display text-lg flex items-center gap-2">
            <Flame size={16} className="text-primary" />Trending Hubs
          </h2>
          <div className="flex items-center gap-1 text-[11px]">
            {(["24h", "7d", "30d"] as Window[]).map((w) => (
              <button
                key={w}
                onClick={() => setWindowSel(w)}
                className={`px-2 py-1 rounded-full border transition ${
                  windowSel === w
                    ? "bg-primary/15 border-primary/50 text-primary font-bold"
                    : "border-border text-muted-foreground hover:border-primary/30"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
        {loading && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        )}
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
                    {(stat?.post_count ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded-full backdrop-blur">
                        <TrendingUp size={9} />Hot
                      </span>
                    )}
                  </div>
                  <p className="font-display text-lg leading-tight mb-2">{m.label}</p>
                  <div className="flex items-center justify-between text-[11px] opacity-95">
                    <span>{stat?.post_count ?? 0} posts · {stat?.active_competitors ?? 0} 👥</span>
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

      {/* Trending Posts */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg flex items-center gap-2">
            <TrendingUp size={16} className="text-primary" />Trending Posts
            <span className="text-[10px] text-muted-foreground font-normal normal-case">last {windowSel}</span>
          </h2>
          <Link to="/feed" className="text-[11px] text-muted-foreground hover:text-primary">See feed</Link>
        </div>
        {postsLoading ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-square" />)}
          </div>
        ) : trendingPosts.length === 0 ? (
          <p className="text-xs text-muted-foreground">No trending posts yet in this window.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {trendingPosts.map((p) => {
              const cover = postCover(p);
              return (
                <Link
                  key={p.id}
                  to={`/post/${p.id}`}
                  className="relative aspect-square rounded-xl overflow-hidden bg-muted group"
                >
                  {cover && (
                    <img src={cover} alt={p.caption ?? "Trending post"} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <div className="absolute bottom-1 left-1.5 right-1.5 flex items-center justify-between text-white">
                    <span className="text-[10px] font-bold truncate">@{p.profile?.username ?? "?"}</span>
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-black/40 px-1.5 py-0.5 rounded-full">
                      <Crown size={9} fill="currentColor" className="text-gold" />{p.crown_score}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Live Battles */}
      {battles.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg flex items-center gap-2">
              <Swords size={16} className="text-primary" />Live Battles
            </h2>
            <Link to="/battles" className="text-[11px] text-muted-foreground hover:text-primary">All battles</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {battles.map((b) => {
              const total = (b.challenger_votes ?? 0) + (b.opponent_votes ?? 0);
              const cPct = total > 0 ? Math.round(((b.challenger_votes ?? 0) / total) * 100) : 50;
              return (
                <Link key={b.id} to={`/battles?b=${b.id}`} className="royal-card p-3 hover:border-primary/40 transition">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="size-8 rounded-full bg-muted overflow-hidden shrink-0">
                        {b.challenger?.profile_photo_url && <img src={b.challenger.profile_photo_url} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <span className="text-xs font-bold truncate">@{b.challenger?.username ?? "?"}</span>
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-primary font-bold">VS</span>
                    <div className="flex items-center gap-2 min-w-0 justify-end">
                      <span className="text-xs font-bold truncate">@{b.opponent?.username ?? "?"}</span>
                      <div className="size-8 rounded-full bg-muted overflow-hidden shrink-0">
                        {b.opponent?.profile_photo_url && <img src={b.opponent.profile_photo_url} alt="" className="w-full h-full object-cover" />}
                      </div>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary/50 overflow-hidden flex">
                    <div className="bg-primary" style={{ width: `${cPct}%` }} />
                    <div className="bg-accent flex-1" />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">{total} votes · ends {new Date(b.ends_at).toLocaleString()}</p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Suggested Creators */}
      {suggested.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display text-lg mb-3 flex items-center gap-2">
            <UserPlus size={16} className="text-primary" />Suggested Creators
          </h2>
          <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1">
            {suggested.map((s) => (
              <Link
                key={s.id}
                to={`/profile/${s.username}`}
                className="shrink-0 w-36 royal-card p-3 text-center hover:border-primary/40 transition"
              >
                <div className="size-14 rounded-full bg-muted overflow-hidden mx-auto mb-2">
                  {s.profile_photo_url && <img src={s.profile_photo_url} alt="" className="w-full h-full object-cover" />}
                </div>
                <p className="text-xs font-bold truncate">@{s.username}</p>
                <p className="text-[10px] text-muted-foreground truncate">{s.bio || `${s.crown_score} crown score`}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Top Gifters + Recently Crowned + Rising Stars */}
      <section className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="royal-card p-4">
          <h2 className="font-display text-base mb-3 flex items-center gap-2">
            <Gift size={14} className="text-primary" />Top Gifters (7d)
          </h2>
          {gifters.length === 0 && <p className="text-xs text-muted-foreground">No gifters yet this week.</p>}
          <ul className="space-y-2">
            {gifters.map((g, i) => (
              <li key={g.user_id} className="flex items-center gap-2">
                <span className="text-[10px] font-bold w-4 text-muted-foreground">#{i + 1}</span>
                <div className="size-8 rounded-full bg-muted overflow-hidden">
                  {g.profile_photo_url && <img src={g.profile_photo_url} alt="" className="w-full h-full object-cover" />}
                </div>
                <Link to={`/profile/${g.username}`} className="min-w-0 flex-1 hover:text-primary">
                  <p className="text-xs font-bold truncate">@{g.username}</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">{g.total.toLocaleString()} ₪</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>

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

      {/* Royal Pass spotlight — only for non-members */}
      {user && !isRoyal && (
        <section className="mb-8">
          <Link
            to="/royal-pass"
            className="block relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-amber-500 via-yellow-600 to-amber-700 text-white shadow group hover:scale-[1.01] transition"
          >
            <div className="absolute inset-0 bg-black/15" />
            <div className="relative flex items-center gap-4">
              <ShieldCheck size={32} className="shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-display text-lg">Unlock Royal Pass</p>
                <p className="text-xs opacity-90">Boosts, vote multipliers, custom flair & priority support.</p>
              </div>
              <ArrowRight size={18} className="shrink-0 group-hover:translate-x-1 transition" />
            </div>
          </Link>
        </section>
      )}

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
                    {stat?.post_count ?? 0} posts · {stat?.active_competitors ?? 0} competing
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
