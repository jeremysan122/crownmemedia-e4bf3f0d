// TikTok-style floating gift popups for Live Battles.
//
// Subscribes to `live_battle_gifts` INSERTs for the current battle and
// spawns a short-lived animated card on either the LEFT (host) or RIGHT
// (opponent) side of the video area. Each popup floats up and fades out
// via pure CSS keyframes (no motion library dependency), then is removed
// after ~3.2s.
//
// The overlay sits on top of the video with pointer-events:none so it
// never blocks host/opponent controls.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import GiftIcon from "@/components/gifts/GiftIcon";
import { findGift } from "@/lib/gifts";

interface Popup {
  id: string;
  giftId: string;
  giftName: string;
  quantity: number;
  side: "left" | "right";
  offset: number;
}

interface Props {
  battleId: string;
  hostId: string;
  opponentId: string;
}

const LIFETIME_MS = 3_200;

export default function LiveBattleGiftsOverlay({ battleId, hostId, opponentId }: Props) {
  const [popups, setPopups] = useState<Popup[]>([]);

  useEffect(() => {
    if (!battleId) return;
    const ch = supabase
      .channel(`lbg-${battleId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_battle_gifts", filter: `battle_id=eq.${battleId}` },
        (payload) => {
          const row = payload.new as {
            id: string; gift_id: string; gift_name: string; quantity: number; recipient_id: string;
          };
          const side: "left" | "right" =
            row.recipient_id === hostId ? "left" :
            row.recipient_id === opponentId ? "right" : "left";
          const popup: Popup = {
            id: row.id, giftId: row.gift_id, giftName: row.gift_name,
            quantity: row.quantity, side, offset: Math.random(),
          };
          setPopups((p) => [...p.slice(-11), popup]);
          window.setTimeout(() => {
            setPopups((p) => p.filter((x) => x.id !== popup.id));
          }, LIFETIME_MS);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [battleId, hostId, opponentId]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden data-testid="live-gift-overlay">
      {popups.map((p) => {
        const meta = findGift(p.giftId);
        return (
          <div
            key={p.id}
            className={`absolute bottom-16 ${p.side === "left" ? "left-4" : "right-4"}
                        flex items-center gap-2 rounded-2xl px-3 py-2
                        bg-gradient-to-br from-amber-400/95 via-orange-500/95 to-rose-500/95
                        text-white shadow-[0_8px_30px_-8px_rgba(255,120,0,0.6)] backdrop-blur
                        animate-live-gift-pop`}
            style={{
              maxWidth: "45%",
              // Vertical jitter so bursts don't stack perfectly
              transform: `translateY(-${p.offset * 120}px)`,
            }}
          >
            <div className="w-10 h-10 rounded-full bg-white/25 flex items-center justify-center">
              {meta ? (
                <GiftIcon animationType={meta.animationType} tier={meta.category} size="sm" />
              ) : null}
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-black leading-tight truncate">{p.giftName}</div>
              <div className="text-[11px] font-bold opacity-90">×{p.quantity}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
