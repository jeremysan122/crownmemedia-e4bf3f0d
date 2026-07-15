// Loads the full 100-crown achievement catalog joined with the caller's
// ownership, progress, and equipped state via the `my_achievement_crowns` RPC.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { preloadCrownAssets } from "@/lib/crownPreload";

export interface CrownGalleryRow {
  crown_id: string;
  slug: string;
  name: string;
  description: string | null;
  lore: string | null;
  unlock_hint: string | null;
  rarity: string;
  tier_index: number;
  collection_slug: string;
  collection_name: string;
  asset_url: string;
  gallery_asset_url: string | null;
  wearable_asset_url: string | null;
  thumbnail_url: string | null;
  asset_version: number | null;
  image_quality_verified: boolean | null;
  requirement_logic: unknown;
  is_secret: boolean;
  sort_order: number;
  owned: boolean;
  equipped: boolean;
  unlocked_at: string | null;
  progress: number;
  target: number;
  completion_percent: number;
  last_evaluated_at: string | null;
}

export interface CrownCollection {
  slug: string;
  name: string;
  total: number;
  owned: number;
}

export interface CrownGalleryResult {
  rows: CrownGalleryRow[];
  collections: CrownCollection[];
  ownedCount: number;
  totalCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCrownGallery(): CrownGalleryResult {
  const { user } = useAuth();
  const [rows, setRows] = useState<CrownGalleryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Kick a fresh evaluation so progress bars are current on load.
      if (user?.id) {
        try {
          await (supabase as any).rpc("evaluate_user_crowns", { _user_id: user.id });
        } catch { /* non-fatal */ }
      }
      const { data, error: e } = await (supabase as any).rpc("my_achievement_crowns");
      if (e) throw e;
      const loaded = (data ?? []) as CrownGalleryRow[];
      setRows(loaded);
      // Wave 3: warm CDN cache for equipped + owned + closest-to-unlock crowns.
      try { preloadCrownAssets(loaded); } catch { /* non-fatal */ }
    } catch (e) {
      setError((e as Error).message || "Failed to load Achievement Crowns");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  const ownedCount = rows.filter((r) => r.owned).length;
  const totalCount = rows.length;
  const colMap = new Map<string, CrownCollection>();
  rows.forEach((r) => {
    const c = colMap.get(r.collection_slug) ?? {
      slug: r.collection_slug,
      name: r.collection_name,
      total: 0,
      owned: 0,
    };
    c.total += 1;
    if (r.owned) c.owned += 1;
    colMap.set(r.collection_slug, c);
  });

  return {
    rows,
    collections: Array.from(colMap.values()),
    ownedCount,
    totalCount,
    loading,
    error,
    refresh: load,
  };
}

export async function equipAchievementCrown(crownId: string | null): Promise<void> {
  const { error } = await (supabase as any).rpc("equip_achievement_crown", {
    _crown_id: crownId,
  });
  if (error) throw error;
}
