import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CrownCategory } from "@/lib/crown";

export type RegionScope = "city" | "state" | "global";

interface RankInfo {
  rank: number | null;
  total: number;
  scope: RegionScope;
  region: string;
}

/**
 * Live-updating crown ranking for a post within its category. Picks the
 * tightest region we have data for (city → state → global) and re-queries
 * whenever a relevant signal changes (votes, comments, gifts, score).
 */
export function useLiveRank(post: {
  id: string;
  category: CrownCategory;
  city: string | null;
  state: string | null;
} | null) {
  const [info, setInfo] = useState<RankInfo | null>(null);

  useEffect(() => {
    if (!post) { setInfo(null); return; }

    const scope: RegionScope = post.city ? "city" : post.state ? "state" : "global";
    const region = scope === "city" ? post.city! : scope === "state" ? post.state! : "Global";

    let cancelled = false;

    const recalc = async () => {
      let q = supabase
        .from("posts")
        .select("id, crown_score")
        .eq("is_removed", false)
        .eq("category", post.category)
        .order("crown_score", { ascending: false })
        .limit(1000);
      if (scope === "city") q = q.eq("city", region);
      else if (scope === "state") q = q.eq("state", region);
      const { data } = await q;
      if (cancelled || !data) return;
      const idx = data.findIndex((p) => p.id === post.id);
      setInfo({
        rank: idx >= 0 ? idx + 1 : null,
        total: data.length,
        scope,
        region,
      });
    };

    recalc();

    const ch = supabase.channel(`live-rank-${post.id}-${Math.random().toString(36).slice(2, 9)}`);
    ch.on("postgres_changes", { event: "*", schema: "public", table: "votes" }, () => recalc())
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, () => recalc())
      .on("postgres_changes", { event: "*", schema: "public", table: "gift_transactions" }, () => recalc())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "posts" }, () => recalc())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [post?.id, post?.category, post?.city, post?.state]);

  return info;
}
