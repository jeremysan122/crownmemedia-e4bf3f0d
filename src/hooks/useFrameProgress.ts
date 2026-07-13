import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type { FrameRewardStats } from "@/lib/frameEligibility";

export interface FrameProgressRow {
  key: string;
  label: string;
  requirement: string;
  progress: number;
  target: number;
  unlocked: boolean;
  equipped: boolean;
}

export interface UseFrameProgress {
  rows: FrameProgressRow[];
  stats: FrameRewardStats | null;
  loading: boolean;
  refresh: () => Promise<{ awarded: string[] }>;
}

export function useFrameProgress(): UseFrameProgress {
  const { user } = useAuth();
  const [rows, setRows] = useState<FrameProgressRow[]>([]);
  const [stats, setStats] = useState<FrameRewardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const firstRun = useRef(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setRows([]); setStats(null); setLoading(false);
      return { awarded: [] as string[] };
    }
    setLoading(true);
    let awarded: string[] = [];
    const { data: awardData } = await (supabase as any).rpc("check_and_award_frames");
    if (awardData && typeof awardData === "object" && Array.isArray(awardData.awarded)) {
      awarded = awardData.awarded as string[];
      if (awardData.stats) setStats(awardData.stats as FrameRewardStats);
    }
    const { data, error } = await (supabase as any).rpc("my_frame_progress");
    if (!error && Array.isArray(data)) setRows(data as FrameProgressRow[]);
    setLoading(false);
    // Only surface awards after the initial mount so we don't spam users who
    // hit the page and legitimately had no new unlocks.
    if (firstRun.current) { firstRun.current = false; return { awarded: [] }; }
    return { awarded };
  }, [user?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { rows, stats, loading, refresh };
}

export async function equipFrame(frameKey: string | null): Promise<void> {
  const { error } = await (supabase as any).rpc("equip_frame", { _frame_key: frameKey });
  if (error) throw error;
}
