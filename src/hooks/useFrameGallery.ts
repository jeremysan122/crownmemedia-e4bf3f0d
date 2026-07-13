// Loads the full 81-frame gallery for /rewards/frames.
//
// Single source of truth: avatar_frames + avatar_frame_collections joined
// to achievement_definitions (via avatar_frame_id), plus the current user's
// ownership rows from the my_owned_avatar_frames RPC.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type { OwnedFrameRow } from "@/hooks/useMyAchievements";

export interface AvatarFrameCatalogItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  rarity: string | null;
  display_order: number;
  static_asset_url: string | null;
  animated_asset_url: string | null;
  thumbnail_asset_url: string | null;
  asset_status: string;
  is_founder_only: boolean;
  is_animated: boolean;
  collection_id: string | null;
}

export interface AvatarFrameCollection {
  id: string;
  slug: string;
  name: string;
  display_order: number;
}

export interface FrameAchievementDetails {
  id: string;
  slug: string;
  name: string;
  description: string;
  rarity: string;
  requirement_logic: unknown;
  is_secret: boolean;
}

export interface FrameGalleryItem {
  frame: AvatarFrameCatalogItem;
  collection: AvatarFrameCollection | null;
  achievement: FrameAchievementDetails | null;
  ownership: OwnedFrameRow | null;
}

export interface FrameGalleryResult {
  items: FrameGalleryItem[];
  collections: AvatarFrameCollection[];
  ownedCount: number;
  totalCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useFrameGallery(): FrameGalleryResult {
  const { user } = useAuth();
  const [items, setItems] = useState<FrameGalleryItem[]>([]);
  const [collections, setCollections] = useState<AvatarFrameCollection[]>([]);
  const [owned, setOwned] = useState<OwnedFrameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const framesQ = (supabase as any)
        .from("avatar_frames")
        .select(
          "id,slug,name,description,rarity,display_order,static_asset_url,animated_asset_url,thumbnail_asset_url,asset_status,is_founder_only,is_animated,collection_id",
        )
        .order("display_order", { ascending: true });
      const colsQ = (supabase as any)
        .from("avatar_frame_collections")
        .select("id,slug,name,display_order")
        .order("display_order", { ascending: true });
      const achQ = (supabase as any)
        .from("achievement_definitions")
        .select("id,slug,name,description,rarity,requirement_logic,is_secret,avatar_frame_id")
        .not("avatar_frame_id", "is", null);
      const ownQ = user
        ? (supabase as any).rpc("my_owned_avatar_frames")
        : Promise.resolve({ data: [], error: null });

      const [{ data: fData, error: fErr }, { data: cData, error: cErr }, { data: aData, error: aErr }, { data: oData, error: oErr }] = await Promise.all([framesQ, colsQ, achQ, ownQ]);

      if (fErr) throw fErr;
      if (cErr) throw cErr;
      if (aErr) throw aErr;
      if (oErr) throw oErr;

      const cols = (cData ?? []) as AvatarFrameCollection[];
      const frames = (fData ?? []) as AvatarFrameCatalogItem[];
      const uniqueIds = new Set(frames.map((f) => f.id));
      if (frames.length !== uniqueIds.size) {
        // eslint-disable-next-line no-console
        console.warn("[FrameGallery] duplicate frame ids detected", frames.length, uniqueIds.size);
      }
      if (frames.length !== 81) {
        // eslint-disable-next-line no-console
        console.warn(`[FrameGallery] expected 81 active frames, got ${frames.length}`);
      }
      const colMap = new Map<string, AvatarFrameCollection>();
      cols.forEach((c) => colMap.set(c.id, c));
      const achMap = new Map<string, FrameAchievementDetails>();
      ((aData ?? []) as any[]).forEach((a) => {
        if (a?.avatar_frame_id) {
          achMap.set(a.avatar_frame_id, {
            id: a.id,
            slug: a.slug,
            name: a.name,
            description: a.description,
            rarity: a.rarity,
            requirement_logic: a.requirement_logic,
            is_secret: !!a.is_secret,
          });
        }
      });
      const ownedRows = (oData ?? []) as OwnedFrameRow[];
      const ownMap = new Map<string, OwnedFrameRow>();
      ownedRows.forEach((o) => ownMap.set(o.frame_id, o));

      const merged: FrameGalleryItem[] = frames.map((f) => ({
        frame: f,
        collection: f.collection_id ? colMap.get(f.collection_id) ?? null : null,
        achievement: achMap.get(f.id) ?? null,
        ownership: ownMap.get(f.id) ?? null,
      }));

      setCollections(cols);
      setItems(merged);
      setOwned(ownedRows);
    } catch (e) {
      setError((e as Error).message || "Failed to load Royal Frames catalog");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    items,
    collections,
    ownedCount: owned.length,
    totalCount: items.length,
    loading,
    error,
    refresh: load,
  };
}
