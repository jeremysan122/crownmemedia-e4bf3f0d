import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

/**
 * Live set of `other_user_id`s the current user has muted in DMs.
 * Subscribes to `muted_dm_threads` so badges stay in sync across devices.
 */
export function useMutedThreads() {
  const { user } = useAuth();
  const [muted, setMuted] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!user) { setMuted(new Set()); return; }
    const { data } = await supabase
      .from("muted_dm_threads")
      .select("other_user_id")
      .eq("user_id", user.id);
    setMuted(new Set((data as any[] || []).map((r) => r.other_user_id)));
  }, [user?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`muted-dm-shell-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "muted_dm_threads", filter: `user_id=eq.${user.id}` },
        () => refresh(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, refresh]);

  return muted;
}
