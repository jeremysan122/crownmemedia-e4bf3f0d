import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RarityRow {
  achievement_id: string;
  slug: string;
  completed_count: number;
  active_players: number;
  rarity_pct: number;
}

/**
 * Fetches cached rarity stats for every active achievement. Refreshed by
 * `refresh_achievement_rarity()` (admin only) — clients just read the view.
 */
export function useAchievementRarity() {
  const [map, setMap] = useState<Record<string, RarityRow>>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase.rpc("achievement_rarity");
      if (cancel) return;
      const m: Record<string, RarityRow> = {};
      ((data ?? []) as RarityRow[]).forEach((r) => { m[r.achievement_id] = r; });
      setMap(m);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);
  return { map, loading };
}

export function rarityLabel(pct: number): string {
  if (pct <= 1) return "Mythic";
  if (pct <= 5) return "Legendary";
  if (pct <= 15) return "Epic";
  if (pct <= 40) return "Rare";
  return "Common";
}
