import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { WifiOff, Loader2, CheckCircle2 } from "lucide-react";

type Status = "connecting" | "live" | "reconnecting" | "error";

/**
 * Inline realtime health banner for the feed. Subscribes to a lightweight
 * feed-level channel and surfaces a clear alert when the connection drops,
 * with auto-recovery via exponential backoff. Updates are deduplicated by
 * the per-PostCard channels (this banner only reports connection health),
 * so recovery never duplicates state.
 */
export default function FeedRealtimeAlert() {
  const [status, setStatus] = useState<Status>("connecting");
  const [recovered, setRecovered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let activeChannel: ReturnType<typeof supabase.channel> | null = null;
    let reconnecting = false; // single-flight guard — never queue overlapping reconnects

    const teardown = () => {
      if (activeChannel) {
        try { supabase.removeChannel(activeChannel); } catch { /* noop */ }
        activeChannel = null;
      }
    };

    const scheduleReconnect = () => {
      if (reconnecting || cancelled) return;
      reconnecting = true;
      setStatus(attempt > 4 ? "error" : "reconnecting");
      const delay = Math.min(8000, 500 * Math.pow(2, attempt++));
      timer = setTimeout(() => {
        timer = null;
        if (cancelled) return;
        teardown();
        reconnecting = false;
        subscribe();
      }, delay);
    };

    const subscribe = () => {
      if (cancelled || activeChannel) return;
      const ch = supabase.channel(`feed-health-${crypto.randomUUID()}`);
      activeChannel = ch;
      ch.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "posts" },
        () => { /* health-only; per-card channels handle UI updates */ },
      ).subscribe((s) => {
        if (cancelled) return;
        if (s === "SUBSCRIBED") {
          setStatus((prev) => {
            if (prev === "reconnecting" || prev === "error") {
              setRecovered(true);
              setTimeout(() => !cancelled && setRecovered(false), 3000);
            }
            return "live";
          });
          attempt = 0;
          reconnecting = false;
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
          scheduleReconnect();
        }
      });
    };

    subscribe();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "live" && !recovered) return null;

  if (recovered) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mx-3 lg:mx-0 mt-2 mb-1 royal-card border-emerald-500/40 bg-emerald-500/10 px-3 py-2 flex items-center gap-2 text-xs animate-fade-in"
      >
        <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
        <span className="font-semibold">Live updates restored.</span>
        <span className="text-muted-foreground">Your feed is back in realtime.</span>
      </div>
    );
  }

  if (status === "reconnecting") {
    return (
      <div
        role="alert"
        aria-live="polite"
        className="mx-3 lg:mx-0 mt-2 mb-1 royal-card border-yellow-500/40 bg-yellow-500/10 px-3 py-2 flex items-center gap-2 text-xs animate-fade-in"
      >
        <Loader2 size={14} className="text-yellow-400 shrink-0 animate-spin" />
        <span className="font-semibold">Reconnecting…</span>
        <span className="text-muted-foreground">Votes will sync automatically once we're back.</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="mx-3 lg:mx-0 mt-2 mb-1 royal-card border-destructive/50 bg-destructive/10 px-3 py-2 flex items-start gap-2 text-xs animate-fade-in"
      >
        <WifiOff size={14} className="text-destructive shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold">Realtime updates unavailable.</p>
          <p className="text-muted-foreground">
            We'll keep retrying — pull to refresh if scores look stale.
          </p>
        </div>
      </div>
    );
  }

  // connecting — quiet placeholder
  return null;
}
