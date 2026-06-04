// Discover — category-driven discovery surface.
// Trending hubs, top crown holders by category, featured subcategories.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, Crown, Flame, Sparkles, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMainCategories, type MainCategory } from "@/lib/categories";
import TrendingHashtags from "@/components/TrendingHashtags";

interface HubStat {
  slug: string;
  label: string;
  gradient: string | null;
  post_count_7d: number;
  champion_username: string | null;
  champion_avatar: string | null;
}

export default function Discover() {
  const { mains, loading } = useMainCategories();
  const [stats, setStats] = useState<Record<string, HubStat>>({});

  useEffect(() => {
    if (mains.length === 0) return;
    (async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      // Aggregate post counts per main_category_slug (last 7d)
      const { data: recent } = await supabase
        .from("posts")
        .select("main_category_slug")
        .gte("created_at", since)
        .eq("is_removed", false)
        .not("main_category_slug", "is", null)
        .limit(5000);
      const counts = new Map<string, number>();
      ((recent as any[]) || []).forEach((r) => {
        counts.set(r.main_category_slug, (counts.get(r.main_category_slug) ?? 0) + 1);
      });

      // Champion per hub: top crown_score post
      const championRows = await Promise.all(
        mains.map(async (m) => {
          const { data } = await supabase
            .from("posts")
            .select("profile:profiles!posts_user_id_fkey(username, profile_photo_url)")
            .eq("main_category_slug", m.slug)
            .eq("is_removed", false)
            .order("crown_score", { ascending: false })
            .limit(1);
          const champ = (data as any[])?.[0]?.profile;
          return [m.slug, champ?.username ?? null, champ?.profile_photo_url ?? null] as const;
        })
      );
      const next: Record<string, HubStat> = {};
      mains.forEach((m, i) => {
        next[m.slug] = {
          slug: m.slug,
          label: m.label,
          gradient: m.gradient,
          post_count_7d: counts.get(m.slug) ?? 0,
          champion_username: championRows[i][1],
          champion_avatar: championRows[i][2],
        };
      });
      setStats(next);
    })();
  }, [mains]);

  const sortedMains = [...mains].sort((a, b) =>
    (stats[b.slug]?.post_count_7d ?? 0) - (stats[a.slug]?.post_count_7d ?? 0)
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

      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg flex items-center gap-2"><Flame size={16} className="text-primary" />Trending Hubs</h2>
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
                <div className="absolute inset-0 bg-black/20" />
                <div className="relative">
                  <p className="text-[10px] uppercase tracking-widest opacity-80 mb-1">Hub</p>
                  <p className="font-display text-lg leading-tight mb-2">{m.label}</p>
                  <div className="flex items-center justify-between text-[11px] opacity-90">
                    <span><TrendingUp size={10} className="inline mr-1" />{stat?.post_count_7d ?? 0} posts/7d</span>
                    {stat?.champion_username && <span>👑 @{stat.champion_username}</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg mb-3 flex items-center gap-2"><Sparkles size={16} className="text-primary" />All Royal Hubs</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {mains.map((m) => (
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
                <p className="text-[11px] text-muted-foreground truncate">{m.description ?? "—"}</p>
              </div>
              <ArrowRight size={14} className="text-muted-foreground group-hover:text-primary transition" />
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
