// Phase 4: Top category/topic rankings for a user, location-scoped.
// Pulls from `category_rankings` (week period) and prefers the most specific
// scope available (city > state > country > global) per hub/topic.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Crown, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMainCategories, fetchSubcategories, type MainCategory, type Subcategory } from "@/lib/categories";

interface Row {
  rank: number;
  prev_rank: number | null;
  score: number;
  main_slug: string;
  subcategory_slug: string | null;
  scope_type: "global" | "country" | "state" | "city";
  scope_value: string;
}

const SCOPE_RANK: Record<Row["scope_type"], number> = {
  city: 0, state: 1, country: 2, global: 3,
};

export default function ProfileCategoryRankings({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [mains, setMains] = useState<MainCategory[]>([]);
  const [subs, setSubs] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMainCategories().then(setMains);
    fetchSubcategories().then(setSubs);
  }, []);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    supabase
      .from("category_rankings" as any)
      .select("rank, prev_rank, score, main_slug, subcategory_slug, scope_type, scope_value")
      .eq("user_id", userId)
      .eq("period", "week")
      .order("rank", { ascending: true })
      .limit(50)
      .then(({ data, error }) => {
        if (error) console.error("[ProfileCategoryRankings]", error.message);
        setRows((data as unknown as Row[]) || []);
        setLoading(false);
      });
  }, [userId]);

  // Pick best (most-specific scope, then best rank) per (main, sub)
  const top = useMemo(() => {
    const byKey = new Map<string, Row>();
    for (const r of rows) {
      const key = `${r.main_slug}|${r.subcategory_slug ?? ""}`;
      const existing = byKey.get(key);
      if (!existing) { byKey.set(key, r); continue; }
      const better =
        SCOPE_RANK[r.scope_type] < SCOPE_RANK[existing.scope_type] ||
        (SCOPE_RANK[r.scope_type] === SCOPE_RANK[existing.scope_type] && r.rank < existing.rank);
      if (better) byKey.set(key, r);
    }
    return Array.from(byKey.values())
      .sort((a, b) => a.rank - b.rank || SCOPE_RANK[a.scope_type] - SCOPE_RANK[b.scope_type])
      .slice(0, 5);
  }, [rows]);

  if (loading) {
    return (
      <div className="royal-card p-4 animate-pulse">
        <div className="h-3 w-32 bg-muted rounded mb-3" />
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-8 bg-muted rounded" />)}</div>
      </div>
    );
  }

  if (top.length === 0) return null;

  const mainLabel = (slug: string) => mains.find((m) => m.slug === slug)?.label ?? slug;
  const subLabel = (slug: string | null) => (slug ? subs.find((s) => s.slug === slug)?.label : null);

  return (
    <div className="royal-card p-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <Trophy size={14} className="text-primary" />
        <h3 className="font-display text-xs uppercase tracking-[0.2em] text-gold">Category Rankings</h3>
      </div>
      <ul className="space-y-1.5">
        {top.map((r) => {
          const sub = subLabel(r.subcategory_slug);
          const where = r.scope_type === "global" ? "Global" : r.scope_value || r.scope_type;
          const podium = r.rank <= 3;
          return (
            <li key={`${r.main_slug}-${r.subcategory_slug ?? "all"}-${r.scope_type}`}>
              <Link
                to={`/leaderboard/c/${r.main_slug}${r.subcategory_slug ? `?topic=${r.subcategory_slug}&` : "?"}scope=${r.scope_type}${r.scope_value ? `&scope_value=${encodeURIComponent(r.scope_value)}` : ""}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition"
              >
                <span className={`w-9 text-center text-sm font-black ${podium ? "text-amber-500" : "text-muted-foreground"}`}>
                  {podium ? <Crown className="inline" size={14} fill="currentColor" /> : null} #{r.rank}
                </span>
                <span className="text-sm font-semibold truncate flex-1">
                  {sub ? `${sub}` : mainLabel(r.main_slug)}
                  {sub && <span className="text-muted-foreground"> · {mainLabel(r.main_slug)}</span>}
                </span>
                <span className="text-[11px] text-muted-foreground capitalize whitespace-nowrap">in {where}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
