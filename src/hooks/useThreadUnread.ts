import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useRealtimeChannel } from "./useRealtimeChannel";

/**
 * Live unread DM counts grouped by the other participant's id.
 * Returns a record like { [otherUserId]: unreadCount }.
 */
export function useThreadUnread() {
  const { user } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});

  const recalc = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("messages")
      .select("sender_id")
      .eq("receiver_id", user.id)
      .eq("read", false)
      .limit(1000);
    const next: Record<string, number> = {};
    for (const row of (data as any[]) || []) {
      next[row.sender_id] = (next[row.sender_id] || 0) + 1;
    }
    setCounts(next);
  };

  useEffect(() => {
    if (!user) { setCounts({}); return; }
    recalc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useRealtimeChannel(
    user?.id ?? null,
    (ch) =>
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `receiver_id=eq.${user?.id}` },
        () => recalc(),
      ),
    recalc,
    [user?.id],
  );

  return counts;
}
