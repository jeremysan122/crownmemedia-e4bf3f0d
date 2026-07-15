// Batched rarity lookups for a set of crown IDs. Anon-safe.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CrownRarityStat {
  crown_id: string;
  owners_count: number;
  total_players: number;
  ownership_pct: number;
}

export function useCrownRarity(crownIds: string[]) {
  const key = crownIds.slice().sort().join(",");
  const [byId, setById] = useState<Record<string, CrownRarityStat>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!crownIds.length) { setById({}); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await (supabase as any).rpc("get_crown_rarity_stats", {
          _crown_ids: crownIds,
        });
        if (error) throw error;
        if (cancelled) return;
        const map: Record<string, CrownRarityStat> = {};
        for (const r of (data ?? []) as CrownRarityStat[]) map[r.crown_id] = r;
        setById(map);
      } catch {
        if (!cancelled) setById({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { byId, loading };
}

export function formatOwnership(pct: number | null | undefined): string {
  if (pct == null || Number.isNaN(pct)) return "—";
  if (pct >= 10) return `${pct.toFixed(0)}%`;
  if (pct >= 1) return `${pct.toFixed(1)}%`;
  if (pct > 0) return `${pct.toFixed(2)}%`;
  return "< 0.01%";
}
