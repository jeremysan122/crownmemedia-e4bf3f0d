import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

/** Per-thread mute state for direct messages. */
export function useDmMute(otherId: string | null | undefined) {
  const { user } = useAuth();
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user || !otherId) { setMuted(false); return; }
    const { data } = await supabase
      .from("muted_dm_threads")
      .select("id")
      .eq("user_id", user.id)
      .eq("other_user_id", otherId)
      .maybeSingle();
    setMuted(!!data);
  }, [user?.id, otherId]);

  useEffect(() => { refresh(); }, [refresh]);

  const toggle = useCallback(async () => {
    if (!user || !otherId) return;
    setLoading(true);
    if (muted) {
      await supabase
        .from("muted_dm_threads")
        .delete()
        .eq("user_id", user.id)
        .eq("other_user_id", otherId);
      setMuted(false);
    } else {
      await supabase
        .from("muted_dm_threads")
        .insert({ user_id: user.id, other_user_id: otherId });
      setMuted(true);
    }
    setLoading(false);
  }, [muted, user?.id, otherId]);

  return { muted, toggle, loading };
}
