import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WeeklyQuestRow {
  quest_id: string;
  slug: string;
  name: string;
  description: string;
  target: number;
  progress: number;
  completion_percent: number;
  status: "in_progress" | "completed" | string;
  rewards: Array<{ type: string; key?: string; amount?: number }> | null;
  week_start: string;
}

export function useWeeklyQuests() {
  const [rows, setRows] = useState<WeeklyQuestRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc("my_weekly_quests");
    if (error) {
      console.warn("my_weekly_quests failed", error);
      setRows([]);
    } else {
      setRows(((data ?? []) as unknown) as WeeklyQuestRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { rows, loading, refresh };
}
