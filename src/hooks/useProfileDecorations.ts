import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ProfileDecorations {
  title_slug: string | null;
  title_text: string | null;
  title_rarity: string | null;
  badge_slug: string | null;
  badge_name: string | null;
  badge_icon: string | null;
  badge_rarity: string | null;
}

/**
 * Loads a target user's currently equipped title and badge for public rendering.
 */
export function useProfileDecorations(userId?: string | null) {
  const [data, setData] = useState<ProfileDecorations | null>(null);

  useEffect(() => {
    if (!userId) { setData(null); return; }
    let cancelled = false;
    (async () => {
      const { data: rows } = await (supabase as any).rpc("profile_decorations", { _user_id: userId });
      if (cancelled) return;
      const first = Array.isArray(rows) ? rows[0] : rows;
      setData(first ?? null);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return data;
}
