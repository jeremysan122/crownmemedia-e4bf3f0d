// Wave 3 — Realtime presence-based live viewer count.
// Uses Supabase Realtime Presence on channel `battle_presence:{id}`.
// Each subscriber tracks itself once; the count is derived from the
// aggregated presence state and updated on every sync/join/leave.
//
// This is the low-latency companion to the 15s poll in
// `useLiveBattleViewerCount` — the poll remains a fallback for viewers
// on flaky realtime connections and for historical DB truth.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useLiveBattlePresence(
  battleId: string | null | undefined,
  userId: string | null | undefined,
  enabled: boolean,
): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!battleId || !enabled) return;
    const channel = supabase.channel(`battle_presence:${battleId}`, {
      config: { presence: { key: userId ?? `anon-${crypto.randomUUID()}` } },
    });
    const recompute = () => {
      const state = channel.presenceState();
      setCount(Object.keys(state).length);
    };
    channel
      .on("presence", { event: "sync" }, recompute)
      .on("presence", { event: "join" }, recompute)
      .on("presence", { event: "leave" }, recompute)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ at: Date.now() });
        }
      });
    return () => {
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
    };
  }, [battleId, userId, enabled]);

  return count;
}
