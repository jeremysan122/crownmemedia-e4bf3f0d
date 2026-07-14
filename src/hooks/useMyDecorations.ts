import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export interface OwnedBadge {
  badge_slug: string;
  name: string;
  icon_slug: string;
  rarity: string;
  equipped: boolean;
  unlocked_at: string;
}

export interface OwnedTitle {
  title_slug: string;
  text: string;
  rarity: string;
  equipped: boolean;
  unlocked_at: string;
}

/**
 * Loads the current user's owned badges and titles for the decorations picker.
 */
export function useMyDecorations() {
  const { user } = useAuth();
  const [badges, setBadges] = useState<OwnedBadge[]>([]);
  const [titles, setTitles] = useState<OwnedTitle[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setBadges([]); setTitles([]); setLoading(false); return; }
    setLoading(true);
    const [b, t] = await Promise.all([
      (supabase as any)
        .from("user_badges")
        .select("badge_slug, equipped, unlocked_at, badges!inner(name, icon_slug, rarity)")
        .eq("user_id", user.id),
      (supabase as any)
        .from("user_titles")
        .select("title_slug, equipped, unlocked_at, titles!inner(text, rarity)")
        .eq("user_id", user.id),
    ]);
    setBadges(
      (b.data ?? []).map((r: any) => ({
        badge_slug: r.badge_slug,
        equipped: r.equipped,
        unlocked_at: r.unlocked_at,
        name: r.badges?.name ?? r.badge_slug,
        icon_slug: r.badges?.icon_slug ?? "star",
        rarity: r.badges?.rarity ?? "rare",
      })),
    );
    setTitles(
      (t.data ?? []).map((r: any) => ({
        title_slug: r.title_slug,
        equipped: r.equipped,
        unlocked_at: r.unlocked_at,
        text: r.titles?.text ?? r.title_slug,
        rarity: r.titles?.rarity ?? "rare",
      })),
    );
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const equipTitle = useCallback(async (slug: string | null) => {
    const { error } = await (supabase as any).rpc("equip_title", { _slug: slug });
    if (!error) await refresh();
    return { error };
  }, [refresh]);

  const equipBadge = useCallback(async (slug: string | null) => {
    const { error } = await (supabase as any).rpc("equip_badge", { _slug: slug });
    if (!error) await refresh();
    return { error };
  }, [refresh]);

  return { badges, titles, loading, refresh, equipTitle, equipBadge };
}
