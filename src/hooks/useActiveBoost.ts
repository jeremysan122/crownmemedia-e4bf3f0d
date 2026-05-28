import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns whether the given user currently has an active (non-expired) boost
 * of the requested type. Backed by the `has_active_boost` RPC so it works for
 * any profile, not just the viewer's own, without exposing the boosts table.
 */
export function useActiveBoost(userId: string | null | undefined, boostType: string) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!userId) { setActive(false); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("has_active_boost", {
        _user_id: userId,
        _boost_type: boostType,
      });
      if (cancelled) return;
      if (error) { setActive(false); return; }
      setActive(Boolean(data));
    })();
    // Re-check every minute so expirations flip off without a page reload.
    const t = setInterval(() => {
      supabase.rpc("has_active_boost", { _user_id: userId, _boost_type: boostType })
        .then(({ data }) => { if (!cancelled) setActive(Boolean(data)); });
    }, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [userId, boostType]);

  return active;
}
