import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { RTStatus } from "@/components/admin/cc/ConnectionStatus";

type Setup = (channel: RealtimeChannel) => RealtimeChannel;

/**
 * Realtime channel with status tracking + exponential backoff.
 * Returns current status + retry countdown for use in a connection indicator.
 */
export function useRealtimeStatus(topic: string, setup: Setup, deps: any[] = []) {
  const [status, setStatus] = useState<RTStatus>("connecting");
  const [retryIn, setRetryIn] = useState<number | undefined>(undefined);
  const setupRef = useRef(setup);
  setupRef.current = setup;

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let retry = 0;
    let retryTimer: number | null = null;
    let countdownTimer: number | null = null;

    const teardown = async () => {
      const c = channel; channel = null;
      if (c) await supabase.removeChannel(c).catch(() => {});
    };

    const connect = async () => {
      if (cancelled) return;
      await teardown();
      if (!navigator.onLine) {
        setStatus("offline");
        return;
      }
      setStatus(retry === 0 ? "connecting" : "retrying");
      const ch = supabase.channel(`${topic}:${Date.now()}:${retry}`);
      setupRef.current(ch);
      ch.subscribe((s) => {
        if (cancelled) return;
        if (s === "SUBSCRIBED") {
          retry = 0;
          setRetryIn(undefined);
          setStatus("live");
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
          setStatus("retrying");
          if (retryTimer) return;
          const delay = Math.min(15, Math.pow(2, retry++));
          setRetryIn(delay);
          if (countdownTimer) window.clearInterval(countdownTimer);
          countdownTimer = window.setInterval(() => {
            setRetryIn((v) => (v && v > 1 ? v - 1 : undefined));
          }, 1000);
          retryTimer = window.setTimeout(() => {
            retryTimer = null;
            if (countdownTimer) { window.clearInterval(countdownTimer); countdownTimer = null; }
            connect();
          }, delay * 1000);
        }
      });
      channel = ch;
    };

    connect();
    const onOnline = () => { retry = 0; connect(); };
    const onOffline = () => setStatus("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (retryTimer) window.clearTimeout(retryTimer);
      if (countdownTimer) window.clearInterval(countdownTimer);
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, ...deps]);

  return { status, retryIn };
}
