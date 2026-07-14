import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RecentUnlockRow {
  achievement_id: string;
  slug: string;
  name: string;
  rarity: string;
  achievement_type: string;
  completed_at: string;
}

export function useRecentUnlocks(userId?: string | null, limit = 20) {
  const [rows, setRows] = useState<RecentUnlockRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setRows([]); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any).rpc("recent_achievement_unlocks", { _user_id: userId, _limit: limit });
      if (cancelled) return;
      setRows(Array.isArray(data) ? data : []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, limit]);

  return { rows, loading };
}
