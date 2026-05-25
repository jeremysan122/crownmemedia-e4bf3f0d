import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type { FilterId } from "@/lib/filters";

export interface FilterStreak {
  filter: string;
  current_streak: number;
  longest_streak: number;
  last_vote_date: string;
}

/**
 * Tracks the current user's per-filter daily voting streaks.
 * `bump(filter)` should be called once after a successful vote on a post that
 * has that filter applied — server-side it updates the streak idempotently
 * (only one bump per day, regardless of how many times the user calls).
 */
export function useFilterStreaks() {
  const { user } = useAuth();
  // Use the stable user id primitive so callbacks aren't recreated on every
  // User object property change (e.g. last_sign_in_at refresh).
  const userId = user?.id;
  const [streaks, setStreaks] = useState<Record<string, FilterStreak>>({});

  const refresh = useCallback(async () => {
    if (!userId) { setStreaks({}); return; }
    const { data } = await supabase
      .from("filter_streaks")
      .select("filter, current_streak, longest_streak, last_vote_date")
      .eq("user_id", userId);
    const map: Record<string, FilterStreak> = {};
    (data ?? []).forEach((r) => { map[r.filter] = r as FilterStreak; });
    setStreaks(map);
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  const bump = useCallback(async (filter: FilterId | null | undefined) => {
    if (!userId || !filter || filter === "none") return;
    const { data, error } = await supabase.rpc("bump_filter_streak", { _filter: filter });
    if (error) return;
    if (data) {
      const row = (Array.isArray(data) ? data[0] : data) as FilterStreak;
      if (row) setStreaks((s) => ({ ...s, [row.filter]: row }));
    }
  }, [userId]);

  return { streaks, bump, refresh };
}
