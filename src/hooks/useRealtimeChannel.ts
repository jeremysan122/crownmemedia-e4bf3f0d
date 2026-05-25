import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Setup = (channel: RealtimeChannel) => RealtimeChannel;

/**
 * Subscribe to a Realtime channel with automatic reconnect handling.
 * - `setup` attaches `.on(...)` handlers to the channel.
 * - `onResync` is called whenever the channel (re)subscribes successfully and
 *   on browser online/visibility events, so callers can refetch latest state.
 */
export function useRealtimeChannel(
  topic: string | null | undefined,
  setup: Setup,
  onResync?: () => void,
  deps: any[] = [],
) {
  const instanceIdRef = useRef(`rt-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`);
  const resyncRef = useRef(onResync);
  resyncRef.current = onResync;

  useEffect(() => {
    if (!topic) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let retry = 0;
    let resubscribeTimer: number | null = null;
    let resubscribeInFlight = false;
    let attempt = 0;

    const teardownCurrent = async () => {
      const current = channel;
      channel = null;
      if (current) await supabase.removeChannel(current).catch(() => {});
    };

    const subscribe = async () => {
      if (cancelled || resubscribeInFlight) return;
      resubscribeInFlight = true;
      await teardownCurrent();
      if (cancelled) {
        resubscribeInFlight = false;
        return;
      }

      // Supabase now reuses channels with the same topic. Give every hook
      // instance + reconnect attempt a unique topic so callbacks are always
      // attached before subscribe() and never appended to an already-joined channel.
      const ch = supabase.channel(`${topic}:${instanceIdRef.current}:${attempt++}`);
      setup(ch);
      ch.subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          retry = 0;
          resubscribeInFlight = false;
          resyncRef.current?.();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (resubscribeTimer !== null || resubscribeInFlight) return;
          // exponential backoff up to 15s
          const delay = Math.min(15000, 500 * 2 ** retry++);
          resubscribeTimer = window.setTimeout(() => {
            resubscribeTimer = null;
            resubscribeInFlight = false;
            subscribe();
          }, delay);
        }
      });
      channel = ch;
      resubscribeInFlight = false;
    };

    subscribe();

    const onOnline = () => {
      resyncRef.current?.();
      if (resubscribeTimer !== null) {
        window.clearTimeout(resubscribeTimer);
        resubscribeTimer = null;
      }
      retry = 0;
      subscribe();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") resyncRef.current?.();
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      if (resubscribeTimer !== null) window.clearTimeout(resubscribeTimer);
      if (channel) supabase.removeChannel(channel).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, ...deps]);
}
