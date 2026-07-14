import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export interface AchievementRewardRow {
  checkpoint: number;
  reward_type: "badge" | "title" | "frame_preview" | "frame_permanent" | string;
  reward_id: string | null;
  granted_at: string;
  expires_at: string | null;
  is_revoked: boolean;
}

export interface AchievementGates {
  account_age_days: number;
  required_account_age_days: number;
  qualified_active_days: number;
  required_qualified_active_days: number;
  distinct_active_weeks: number;
  required_distinct_active_weeks: number;
  gates_ok: boolean;
}

export interface AchievementRow {
  achievement_id: string;
  slug: string;
  name: string;
  description: string;
  collection_id: string | null;
  collection_slug: string | null;
  rarity: string;
  is_founder_only: boolean;
  is_secret: boolean;
  avatar_frame_id: string | null;
  requirement_logic: Record<string, unknown>;
  checkpoint_rewards: unknown[];
  progress: Record<string, number>;
  completion_percent: number;
  highest_checkpoint: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  rewards: AchievementRewardRow[];
  gates: AchievementGates;
  starts_at: string | null;
  ends_at: string | null;
}

export function useMyAchievements() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AchievementRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("my_achievements");
    if (!error && Array.isArray(data)) setRows(data as AchievementRow[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { rows, loading, refresh };
}

export interface OwnedFrameRow {
  frame_id: string;
  slug: string;
  name: string;
  collection_slug: string | null;
  asset_url: string | null;
  is_permanent: boolean;
  expires_at: string | null;
  achievement_id: string | null;
  granted_at: string;
  equipped: boolean;
}

export function useMyOwnedFrames() {
  const { user } = useAuth();
  const [rows, setRows] = useState<OwnedFrameRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("my_owned_avatar_frames");
    if (!error && Array.isArray(data)) setRows(data as OwnedFrameRow[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { rows, loading, refresh };
}

export async function equipAvatarFrame(frameId: string | null): Promise<void> {
  const { error } = await (supabase as any).rpc("equip_avatar_frame", { _frame_id: frameId });
  if (error) throw error;
}
