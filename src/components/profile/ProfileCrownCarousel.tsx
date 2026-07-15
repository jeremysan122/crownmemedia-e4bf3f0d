import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, ChevronLeft, ChevronRight } from "lucide-react";

interface CrownRow {
  crown_id: string;
  slug: string;
  name: string;
  rarity: string;
  collection_name: string;
  asset_url: string;
  wearable_asset_url: string | null;
  unlocked_at: string;
}

const RARITY_CLS: Record<string, string> = {
  common: "text-muted-foreground border-muted-foreground/30",
  uncommon: "text-emerald-300 border-emerald-400/40",
  rare: "text-blue-300 border-blue-400/40",
  epic: "text-purple-300 border-purple-400/40",
  legendary: "text-gold border-gold/50",
  mythic: "text-fuchsia-300 border-fuchsia-400/50",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Horizontal carousel of a user's most recently unlocked Achievement Crowns.
 * Renders the wearable crown asset above the crown's name, rarity, and time.
 */
export default function ProfileCrownCarousel({ userId }: { userId?: string | null }) {
  const [rows, setRows] = useState<CrownRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setRows([]); setLoading(false); return; }
    let cancel = false;
    (async () => {
      setLoading(true);
      const started = performance.now();
      const { data, error } = await (supabase as any)
        .from("user_achievement_crowns")
        .select("unlocked_at, achievement_crowns!inner(id, slug, name, rarity, collection_name, asset_url, wearable_asset_url)")
        .eq("user_id", userId)
        .order("unlocked_at", { ascending: false })
        .limit(24);
      const latency_ms = Math.round(performance.now() - started);
      if (cancel) return;
      const mapped: CrownRow[] = (data ?? []).map((r: any) => ({
        crown_id: r.achievement_crowns.id,
        slug: r.achievement_crowns.slug,
        name: r.achievement_crowns.name,
        rarity: r.achievement_crowns.rarity,
        collection_name: r.achievement_crowns.collection_name,
        asset_url: r.achievement_crowns.asset_url,
        wearable_asset_url: r.achievement_crowns.wearable_asset_url,
        unlocked_at: r.unlocked_at,
      }));
      setRows(mapped);
      setLoading(false);
      void trackEvent("profile_crown_carousel_load", {
        metadata: { latency_ms, count: mapped.length, ok: !error },
      });
    })();
    return () => { cancel = true; };
  }, [userId]);


  if (!userId) return null;
  if (loading) {
    return <div className="royal-card p-4 text-xs text-muted-foreground">Loading crowns…</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="royal-card p-6 text-center">
        <Trophy size={20} className="mx-auto mb-2 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">No crowns unlocked yet.</p>
      </div>
    );
  }

  const scroll = (dir: -1 | 1) => {
    const el = document.getElementById(`crown-carousel-${userId}`);
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        id={`crown-carousel-${userId}`}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {rows.map((r) => {
          const img = r.wearable_asset_url || r.asset_url;
          const cls = RARITY_CLS[r.rarity] ?? RARITY_CLS.common;
          return (
            <Link
              key={r.crown_id}
              to={`/rewards/crowns?slug=${r.slug}`}
              className={`snap-start shrink-0 w-[140px] royal-card p-3 flex flex-col items-center text-center border ${cls} hover:scale-[1.03] transition-transform`}
              title={`${r.name} · ${r.collection_name}`}
            >
              <div className="w-20 h-20 flex items-center justify-center mb-2">
                {img ? (
                  <img
                    src={img}
                    alt={r.name}
                    loading="lazy"
                    className="max-w-full max-h-full object-contain drop-shadow-[0_4px_12px_rgba(212,175,55,0.35)]"
                  />
                ) : (
                  <Trophy size={40} className="text-gold/70" />
                )}
              </div>
              <div className="text-[11px] font-medium text-foreground leading-tight line-clamp-2 min-h-[28px]">
                {r.name}
              </div>
              <div className={`text-[9px] uppercase tracking-wider mt-1 ${cls.split(" ")[0]}`}>
                {r.rarity}
              </div>
              <div className="text-[9px] text-muted-foreground/80 mt-0.5 tabular-nums">
                {timeAgo(r.unlocked_at)}
              </div>
            </Link>
          );
        })}
      </div>
      {rows.length > 3 && (
        <>
          <button
            type="button"
            aria-label="Scroll crowns left"
            onClick={() => scroll(-1)}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-background/80 backdrop-blur border border-border flex items-center justify-center hover:bg-background"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            aria-label="Scroll crowns right"
            onClick={() => scroll(1)}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-8 h-8 rounded-full bg-background/80 backdrop-blur border border-border flex items-center justify-center hover:bg-background"
          >
            <ChevronRight size={16} />
          </button>
        </>
      )}
    </div>
  );
}
