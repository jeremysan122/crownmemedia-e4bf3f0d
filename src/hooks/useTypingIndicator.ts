import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Per-thread DM typing indicator over Realtime broadcast.
 *
 * Uses the deterministic pair topic `dm-typing:<sortedA>__<sortedB>` so the
 * channel is scoped to exactly the two participants (RLS on realtime.messages
 * enforces that the caller's auth.uid() must appear in the topic name).
 *
 * Each broadcast carries the conversation pair in its payload, and listeners
 * verify both `from` and `to` before showing typing — guaranteeing the
 * indicator never bleeds into another conversation.
 */
export function useTypingIndicator(myId: string | null | undefined, otherId: string | null | undefined) {
  const [otherTyping, setOtherTyping] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastSentRef = useRef(0);

  // Reset whenever the active thread changes so a stale "typing" never
  // carries over from the previous conversation.
  useEffect(() => {
    setOtherTyping(false);
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
  }, [myId, otherId]);

  useEffect(() => {
    if (!myId || !otherId) return;
    const pair = myId < otherId ? `${myId}__${otherId}` : `${otherId}__${myId}`;
    const topic = `dm-typing:${pair}`;

    // Defensive: if a previous mount (StrictMode double-invoke or fast
    // remount) left a cached channel for this topic, remove it before
    // creating a fresh one. Otherwise calling .on() after the cached
    // channel's subscribe() throws:
    //   "cannot add `postgres_changes` callbacks ... after subscribe()".
    for (const existing of supabase.getChannels()) {
      if (existing.topic === `realtime:${topic}` || existing.topic === topic) {
        supabase.removeChannel(existing).catch(() => {});
      }
    }

    const ch = supabase.channel(topic, { config: { broadcast: { self: false } } });

    ch.on("broadcast", { event: "typing" }, (payload) => {
      const p = payload.payload || {};
      // Strict pair check — ignore anything that isn't from the other
      // participant addressed to me in this exact thread.
      if (p.from !== otherId || p.to !== myId) return;
      setOtherTyping(true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setOtherTyping(false), 3500);
    });

    ch.subscribe();
    channelRef.current = ch;

    return () => {
      if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
      supabase.removeChannel(ch).catch(() => {});
      channelRef.current = null;
      setOtherTyping(false);
    };
  }, [myId, otherId]);

  const ping = useCallback(() => {
    if (!channelRef.current || !myId || !otherId) return;
    const now = Date.now();
    if (now - lastSentRef.current < 1500) return; // throttle
    lastSentRef.current = now;
    channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { from: myId, to: otherId },
    });
  }, [myId, otherId]);

  return { otherTyping, ping };
}
