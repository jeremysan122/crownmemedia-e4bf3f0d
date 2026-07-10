// TikTok-style floating gift popups for Live Battles.
//
// Subscribes to `live_battle_gifts` INSERTs for the current battle and
// spawns a short-lived animated card on either the LEFT (host) or RIGHT
// (opponent) side of the video area. Each popup floats up, fades out, and
// is removed after ~3.2s. Purely presentational — the RPC is what actually
// awards the gift; this component only listens.
//
// The overlay sits on top of the video with pointer-events:none so it
// never blocks host/opponent controls.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import GiftIcon from "@/components/gifts/GiftIcon";
import { motion, AnimatePresence } from "framer-motion";

interface Popup {
  id: string;
  giftId: string;
  giftName: string;
  quantity: number;
  senderId: string;
  recipientId: string;
  side: "left" | "right";
  offset: number; // 0–1 vertical jitter so bursts don't stack perfectly
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
            id: string; gift_id: string; gift_name: string; quantity: number;
            sender_id: string; recipient_id: string;
          };
          const side: "left" | "right" = row.recipient_id === hostId ? "left"
            : row.recipient_id === opponentId ? "right" : "left";
          const popup: Popup = {
            id: row.id,
            giftId: row.gift_id,
            giftName: row.gift_name,
            quantity: row.quantity,
            senderId: row.sender_id,
            recipientId: row.recipient_id,
            side,
            offset: Math.random(),
          };
          setPopups((p) => [...p.slice(-11), popup]); // cap concurrent popups
          window.setTimeout(() => {
            setPopups((p) => p.filter((x) => x.id !== popup.id));
          }, LIFETIME_MS);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [battleId, hostId, opponentId]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <AnimatePresence>
        {popups.map((p) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 0, scale: 0.6 }}
            animate={{ opacity: 1, y: -200 - p.offset * 120, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: LIFETIME_MS / 1000, ease: "easeOut" }}
            className={`absolute bottom-16 ${p.side === "left" ? "left-4" : "right-4"}
                        flex items-center gap-2 rounded-2xl px-3 py-2
                        bg-gradient-to-br from-amber-400/95 via-orange-500/95 to-rose-500/95
                        text-white shadow-[0_8px_30px_-8px_rgba(255,120,0,0.6)] backdrop-blur`}
            style={{ maxWidth: "45%" }}
          >
            <div className="w-8 h-8 rounded-full bg-white/25 flex items-center justify-center">
              <GiftIcon giftId={p.giftId} size={22} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-black leading-tight truncate">{p.giftName}</div>
              <div className="text-[10px] font-bold opacity-90">×{p.quantity}</div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
