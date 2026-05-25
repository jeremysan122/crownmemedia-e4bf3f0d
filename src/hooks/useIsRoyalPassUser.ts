import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, { value: boolean; at: number }>();
const TTL_MS = 60_000; // re-check entitlement at most once per minute

/** Check whether any user has an active Royal Pass via the server-side helper. */
export function useIsRoyalPassUser(userId: string | null | undefined): boolean {
  const [active, setActive] = useState<boolean>(() => {
    if (!userId) return false;
    const hit = cache.get(userId);
    return hit ? hit.value : false;
  });

  useEffect(() => {
    if (!userId) {
      setActive(false);
      return;
    }

    let cancelled = false;
    const load = async (force = false) => {
      const hit = cache.get(userId);
      if (!force && hit && Date.now() - hit.at < TTL_MS) {
        setActive(hit.value);
        return;
      }
      const { data, error } = await supabase.rpc("is_royal_pass_active", {
        _user_id: userId,
      });
      if (cancelled) return;
      const value = !error && !!data;
      cache.set(userId, { value, at: Date.now() });
      setActive(value);
    };

    load();
    const onFocus = () => load(true);
    const onVisible = () => { if (document.visibilityState === "visible") load(true); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);

  return active;
}
