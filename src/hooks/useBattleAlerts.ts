import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useNotificationPrefs } from "./useNotificationPrefs";
import { playNotificationSound } from "@/lib/notificationSounds";

/**
 * Subscribes to the current user's notifications and surfaces battle-related
 * events (invites, accepts/declines, winner reveals) as toasts + custom
 * sounds, with rate limiting so bursts of events don't spam the user.
 *
 * Rate limiting strategy:
 *   - At most 1 toast per BATTLE_KIND per WINDOW_MS (3s)
 *   - Within a window, additional events are coalesced into a single
 *     "+N more battle updates" summary toast at the end of the window.
 *   - Sounds debounced to once per 1.5s per kind.
 */

const TOAST_WINDOW_MS = 3000;
const SOUND_DEBOUNCE_MS = 1500;

type BattleKind = "invite" | "result";

function kindFor(type?: string | null): BattleKind | null {
  if (!type) return null;
  if (type === "battle_invite" || type === "battle_accepted" || type === "battle_declined") return "invite";
  if (type === "battle_won" || type === "battle_lost" || type === "battle_ended") return "result";
  return null;
}

export function useBattleAlerts() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { prefs } = useNotificationPrefs();

  const lastToastAt = useRef<Record<BattleKind, number>>({ invite: 0, result: 0 });
  const lastSoundAt = useRef<Record<BattleKind, number>>({ invite: 0, result: 0 });
  const queued = useRef<Record<BattleKind, any[]>>({ invite: [], result: [] });
  const flushTimers = useRef<Record<BattleKind, any>>({ invite: null, result: null });

  const flush = (kind: BattleKind) => {
    const items = queued.current[kind];
    queued.current[kind] = [];
    flushTimers.current[kind] = null;
    if (items.length === 0) return;
    const more = items.length;
    toast.message(
      kind === "invite"
        ? `+${more} more battle update${more === 1 ? "" : "s"}`
        : `+${more} more duel result${more === 1 ? "" : "s"}`,
      {
        description: "Open notifications to view all",
        action: { label: "Inbox", onClick: () => nav("/notifications") },
      },
    );
  };

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`battle-alerts-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          const n = payload.new;
          const kind = kindFor(n?.type);
          if (!kind) return;

          // Respect per-kind preference
          const enabled =
            kind === "invite" ? prefs.battle_invite_alerts : prefs.battle_winner_alerts;
          if (!enabled) return;

          const now = Date.now();

          // Sound (debounced per kind)
          if (prefs.sound_enabled && now - lastSoundAt.current[kind] > SOUND_DEBOUNCE_MS) {
            playNotificationSound(kind === "invite" ? "invite" : "winner");
            lastSoundAt.current[kind] = now;
          }

          // Toast rate limit: first event in window shows, rest coalesce
          if (now - lastToastAt.current[kind] > TOAST_WINDOW_MS) {
            lastToastAt.current[kind] = now;
            const battleId = n.payload?.battle_id;
            toast(n.title || (kind === "invite" ? "Battle update" : "Duel ended"), {
              description: n.body,
              action: battleId
                ? { label: "View", onClick: () => nav(`/battles?b=${battleId}`) }
                : undefined,
            });
          } else {
            queued.current[kind].push(n);
            if (!flushTimers.current[kind]) {
              flushTimers.current[kind] = setTimeout(() => flush(kind), TOAST_WINDOW_MS);
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      (Object.keys(flushTimers.current) as BattleKind[]).forEach((k) => {
        if (flushTimers.current[k]) clearTimeout(flushTimers.current[k]);
        flushTimers.current[k] = null;
        queued.current[k] = [];
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, prefs.battle_invite_alerts, prefs.battle_winner_alerts, prefs.sound_enabled]);
}
