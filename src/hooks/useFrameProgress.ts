import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export interface FrameProgressRow {
  key: string;
  label: string;
  requirement: string;
  progress: number;
  target: number;
  unlocked: boolean;
  equipped: boolean;
}

export function useFrameProgress() {
  const { user } = useAuth();
  const [rows, setRows] = useState<FrameProgressRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setRows([]); setLoading(false); return; }
    setLoading(true);
    // Award anything newly earned first, then read progress.
    await (supabase as any).rpc("check_and_award_frames");
    const { data, error } = await (supabase as any).rpc("my_frame_progress");
    if (!error && Array.isArray(data)) setRows(data as FrameProgressRow[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { rows, loading, refresh };
}

export async function equipFrame(frameKey: string | null): Promise<void> {
  const { error } = await (supabase as any).rpc("equip_frame", { _frame_key: frameKey });
  if (error) throw error;
}
