import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star, Zap, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface BoostedPost {
  id: string;
  caption: string | null;
  image_url: string | null;
  user_id: string;
  spotlight_until: string | null;
  vote_boost_until: string | null;
  crown_shield_until: string | null;
  profile: { username: string | null; profile_photo_url: string | null } | null;
}

/**
 * Horizontal strip shown above the Feed surfacing posts with an active
 * Crown Spotlight or Vote Boost. Read-only, public-safe fields only.
 */
export default function SpotlightStrip() {
  const [items, setItems] = useState<BoostedPost[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const nowIso = new Date().toISOString();
      // Two parallel queries (spotlight has priority placement, then vote boost)
      const [spot, votes] = await Promise.all([
        supabase
          .from("posts")
          .select("id, caption, image_url, user_id, spotlight_until, vote_boost_until, crown_shield_until, profile:profiles!posts_user_id_fkey(username, profile_photo_url)")
          .eq("is_removed", false)
          .gt("spotlight_until", nowIso)
          .order("spotlight_until", { ascending: false })
          .limit(10),
        supabase
          .from("posts")
          .select("id, caption, image_url, user_id, spotlight_until, vote_boost_until, crown_shield_until, profile:profiles!posts_user_id_fkey(username, profile_photo_url)")
          .eq("is_removed", false)
          .gt("vote_boost_until", nowIso)
          .order("vote_boost_until", { ascending: false })
          .limit(10),
      ]);
      if (cancelled) return;
      const merged = new Map<string, BoostedPost>();
      ((spot.data as BoostedPost[]) || []).forEach((p) => merged.set(p.id, p));
      ((votes.data as BoostedPost[]) || []).forEach((p) => { if (!merged.has(p.id)) merged.set(p.id, p); });
      setItems(Array.from(merged.values()).slice(0, 15));
    })();
    return () => { cancelled = true; };
  }, []);

  if (items.length === 0) return null;

  return (
    <section aria-label="Boosted posts" className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Star size={14} className="text-gold" />
        <h2 className="text-xs font-bold uppercase tracking-wider text-gold">Royal Spotlight</h2>
      </div>
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-4 px-4">
        {items.map((p) => {
          const isSpot = p.spotlight_until && new Date(p.spotlight_until) > new Date();
          const isVote = p.vote_boost_until && new Date(p.vote_boost_until) > new Date();
          const isShield = p.crown_shield_until && new Date(p.crown_shield_until) > new Date();
          const username = p.profile?.username;
          const href = username ? `/${username}?post=${p.id}` : `/post/${p.id}`;
          return (
            <Link
              key={p.id}
              to={href}
              className="relative shrink-0 w-28 aspect-[3/4] rounded-xl overflow-hidden border border-gold/40 group"
            >
              {p.image_url ? (
                <img src={p.image_url} alt={p.caption ?? username ?? "boosted post"} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
              ) : (
                <div className="w-full h-full bg-muted" />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                <p className="text-[10px] font-bold text-white truncate">@{username ?? "user"}</p>
              </div>
              <div className="absolute top-1 left-1 flex gap-1">
                {isSpot && <span className="rounded-full bg-gold/90 text-primary-foreground p-1" title="Crown Spotlight"><Star size={8} /></span>}
                {isVote && <span className="rounded-full bg-emerald-500/90 text-white p-1" title="Vote Boost"><Zap size={8} /></span>}
                {isShield && <span className="rounded-full bg-blue-500/90 text-white p-1" title="Crown Shield"><Crown size={8} /></span>}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
