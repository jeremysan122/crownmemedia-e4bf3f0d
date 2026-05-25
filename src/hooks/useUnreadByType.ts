import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useRealtimeChannel } from "./useRealtimeChannel";

export interface UnreadByType {
  reply: number;
  mention: number;
  dm: number;
  vote: number;
  follow: number;
  other: number;
  total: number;
}

const ZERO: UnreadByType = { reply: 0, mention: 0, dm: 0, vote: 0, follow: 0, other: 0, total: 0 };

/** Live unread notification counts grouped by category, with reconnect handling. */
export function useUnreadByType() {
  const { user } = useAuth();
  const [counts, setCounts] = useState<UnreadByType>(ZERO);

  const recalc = useCallback(async () => {
    if (!user) { setCounts(ZERO); return; }
    const { data } = await supabase
      .from("notifications")
      .select("type, payload")
      .eq("user_id", user.id)
      .eq("read", false)
      .limit(1000);
    if (!data) return;
    const next: UnreadByType = { ...ZERO };
    for (const n of data as any[]) {
      const isReply = n.type === "comment" && n.payload?.reply === true;
      const isMention = n.type === "comment" && n.payload?.mention === true;
      if (isReply) next.reply++;
      else if (isMention) next.mention++;
      else if (n.type === "dm") next.dm++;
      else if (n.type === "vote") next.vote++;
      else if (n.type === "follow") next.follow++;
      else next.other++;
      next.total++;
    }
    setCounts(next);
  }, [user?.id]);

  useEffect(() => { recalc(); }, [recalc]);

  useRealtimeChannel(
    user?.id ?? null,
    (ch) =>
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user?.id}` },
        () => recalc(),
      ),
    recalc,
    [user?.id],
  );

  return counts;
}
