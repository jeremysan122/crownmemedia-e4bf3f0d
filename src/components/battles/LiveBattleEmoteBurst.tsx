// Wave 3 — Spectator emote bursts.
// Sends a rate-limited RPC ping to the server, then broadcasts the emote
// on channel `battle_emotes:{id}` so every viewer sees a floating burst.
// Renders animated emote sprites that rise + fade over the video stage.
// Respects prefers-reduced-motion (single fade, no rise).

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import {
  sendLiveBattleEmote, emoteErrorMessage, BattleEmoteKind,
} from "@/lib/liveBattles";
import { toast } from "@/hooks/use-toast";
import { Heart, Crown, Flame, PartyPopper, Smile } from "lucide-react";

interface EmoteBurst {
  id: string;
  kind: BattleEmoteKind;
  x: number; // 0..100 (% from left)
  createdAt: number;
}

const EMOTE_META: Record<BattleEmoteKind, { Icon: typeof Heart; className: string; label: string }> = {
  heart: { Icon: Heart, className: "text-rose-400", label: "Heart" },
  crown: { Icon: Crown, className: "text-amber-300", label: "Crown" },
  fire:  { Icon: Flame, className: "text-orange-400", label: "Fire" },
  clap:  { Icon: PartyPopper, className: "text-fuchsia-300", label: "Clap" },
  laugh: { Icon: Smile, className: "text-yellow-300", label: "Laugh" },
};

const BURST_TTL_MS = 2200;

interface Props {
  battleId: string;
  enabled: boolean;
}

export default function LiveBattleEmoteBurst({ battleId, enabled }: Props) {
  const { user } = useAuth();
  const [bursts, setBursts] = useState<EmoteBurst[]>([]);
  const cooldownRef = useRef(0);
  const reducedMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // Subscribe to broadcast channel — every viewer receives every burst.
  useEffect(() => {
    if (!battleId || !enabled) return;
    const ch = supabase
      .channel(`battle_emotes:${battleId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "emote" }, (payload) => {
        const kind = (payload.payload as { kind?: string })?.kind as BattleEmoteKind | undefined;
        if (!kind || !EMOTE_META[kind]) return;
        addBurst(kind);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [battleId, enabled]);

  const addBurst = (kind: BattleEmoteKind) => {
    const b: EmoteBurst = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      x: 35 + Math.random() * 30, // cluster near center-bottom
      createdAt: Date.now(),
    };
    setBursts((prev) => [...prev.slice(-40), b]);
    window.setTimeout(() => {
      setBursts((prev) => prev.filter((x) => x.id !== b.id));
    }, BURST_TTL_MS);
  };

  const handleTap = async (kind: BattleEmoteKind) => {
    if (!enabled) return;
    // Optimistic local burst so tap feels instant.
    addBurst(kind);
    // Client throttle: 8/s max — server also enforces 30/10s.
    const now = Date.now();
    if (now - cooldownRef.current < 125) return;
    cooldownRef.current = now;
    try {
      await sendLiveBattleEmote(battleId, kind);
      await supabase.channel(`battle_emotes:${battleId}`).send({
        type: "broadcast", event: "emote",
        payload: { kind, from: user?.id ?? null },
      });
    } catch (e) {
      const msg = emoteErrorMessage(e);
      if (msg) toast({ title: msg, variant: "destructive" });
    }
  };

  return (
    <>
      {/* Floating burst layer */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
        data-testid="emote-burst-layer"
      >
        {bursts.map((b) => {
          const { Icon, className } = EMOTE_META[b.kind];
          return (
            <span
              key={b.id}
              className={`absolute bottom-16 ${className} ${reducedMotion ? "animate-in fade-in" : "animate-emote-rise"}`}
              style={{ left: `${b.x}%` }}
            >
              <Icon className="w-7 h-7 drop-shadow-lg" fill="currentColor" />
            </span>
          );
        })}
      </div>

      {/* Tap-to-send tray — anchored bottom-right of the stage */}
      {enabled && (
        <div
          className="absolute bottom-3 right-3 flex flex-col gap-1.5 rounded-full bg-black/40 backdrop-blur px-1.5 py-2"
          data-testid="emote-tray"
        >
          {(Object.keys(EMOTE_META) as BattleEmoteKind[]).map((kind) => {
            const { Icon, className, label } = EMOTE_META[kind];
            return (
              <button
                key={kind}
                type="button"
                onClick={() => handleTap(kind)}
                aria-label={`Send ${label}`}
                className={`h-9 w-9 rounded-full flex items-center justify-center hover:bg-white/10 active:scale-90 transition ${className}`}
              >
                <Icon className="w-5 h-5" fill="currentColor" />
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
