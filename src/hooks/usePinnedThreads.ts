import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useRealtimeChannel } from "./useRealtimeChannel";

/**
 * Live set of other-user-ids the current user has pinned to the top of their inbox.
 * RLS guarantees only the owner can read/insert/delete, so the data is always private.
 */
export function usePinnedThreads() {
  const { user } = useAuth();
  const [pinned, setPinned] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    if (!user) { setPinned(new Set()); return; }
    const { data } = await supabase
      .from("pinned_dm_threads")
      .select("other_user_id")
      .eq("user_id", user.id);
    setPinned(new Set(((data as any[]) || []).map((r) => r.other_user_id as string)));
  }, [user?.id]);

  useEffect(() => { reload(); }, [reload]);

  useRealtimeChannel(
    user?.id ?? null,
    (ch) =>
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pinned_dm_threads", filter: `user_id=eq.${user?.id}` },
        () => reload(),
      ),
    reload,
    [user?.id],
  );

  const pin = useCallback(async (otherId: string) => {
    if (!user) return;
    setPinned((prev) => new Set(prev).add(otherId)); // optimistic
    await supabase.from("pinned_dm_threads").insert({ user_id: user.id, other_user_id: otherId });
  }, [user?.id]);

  const unpin = useCallback(async (otherId: string) => {
    if (!user) return;
    setPinned((prev) => { const n = new Set(prev); n.delete(otherId); return n; });
    await supabase.from("pinned_dm_threads").delete()
      .eq("user_id", user.id).eq("other_user_id", otherId);
  }, [user?.id]);

  const toggle = useCallback((otherId: string) => {
    return pinned.has(otherId) ? unpin(otherId) : pin(otherId);
  }, [pinned, pin, unpin]);

  return { pinned, pin, unpin, toggle, reload };
}
