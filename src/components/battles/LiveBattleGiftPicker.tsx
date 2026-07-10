// Live-battle gift picker. Opens a bottom sheet that lets a viewer pick a
// recipient (host / opponent), then a gift, then send it via the
// `send_live_battle_gift` RPC. Success triggers the realtime popup for
// every viewer (via LiveBattleGiftsOverlay).

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ROYAL_GIFTS, CATEGORY_TABS, formatShekels } from "@/lib/gifts";
import GiftIcon from "@/components/gifts/GiftIcon";
import { supabase } from "@/integrations/supabase/client";
import { makeGiftIdempotencyKey } from "@/hooks/useGiftSend";
import { friendlyMonetizationError } from "@/lib/monetizationErrors";
import { toast } from "sonner";
import type { GiftCategory, RoyalGift } from "@/types/gifts";
import { Loader2, Crown } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  battleId: string;
  hostId: string;
  hostUsername: string | null;
  opponentId: string;
  opponentUsername: string | null;
}

export default function LiveBattleGiftPicker(props: Props) {
  const { open, onOpenChange, battleId, hostId, hostUsername, opponentId, opponentUsername } = props;
  const [recipient, setRecipient] = useState<"host" | "opponent">("host");
  const [tab, setTab] = useState<GiftCategory>("popular");
  const [sending, setSending] = useState<string | null>(null);

  const recipientId = recipient === "host" ? hostId : opponentId;
  const recipientLabel = recipient === "host" ? (hostUsername ?? "Host") : (opponentUsername ?? "Opponent");
  const list = ROYAL_GIFTS.filter((g) => g.category === tab);

  async function sendGift(gift: RoyalGift) {
    if (sending) return;
    setSending(gift.id);
    const toastId = toast.loading(`Sending ${gift.name}…`);
    try {
      const { data, error } = await supabase.rpc("send_live_battle_gift" as never, {
        _battle_id: battleId,
        _gift_id: gift.id,
        _recipient_id: recipientId,
        _quantity: 1,
        _dedupe_key: makeGiftIdempotencyKey(),
      } as never);
      if (error) throw error;
      toast.success(`${gift.name} sent to @${recipientLabel}`, { id: toastId });
      void data;
    } catch (err) {
      toast.error(friendlyMonetizationError("gift_send", err), { id: toastId });
    } finally {
      setSending(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[78dvh] p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="flex items-center gap-2">
            <Crown size={16} className="text-primary" /> Send a gift
          </SheetTitle>
        </SheetHeader>

        {/* Recipient toggle */}
        <div className="px-4 grid grid-cols-2 gap-2 mb-2">
          {(["host", "opponent"] as const).map((r) => {
            const active = recipient === r;
            const label = r === "host" ? (hostUsername ?? "Host") : (opponentUsername ?? "Opponent");
            return (
              <button
                key={r}
                onClick={() => setRecipient(r)}
                className={`rounded-xl px-3 py-2.5 text-sm font-bold border transition ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border hover:border-primary/50"
                }`}
              >
                @{label}
              </button>
            );
          })}
        </div>

        {/* Category tabs */}
        <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto no-scrollbar">
          {CATEGORY_TABS.map((c) => (
            <button
              key={c.key}
              onClick={() => setTab(c.key)}
              className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wider border ${
                tab === c.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent border-border text-muted-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Gift grid */}
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {list.map((g) => {
              const isSending = sending === g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => sendGift(g)}
                  disabled={!!sending}
                  className="relative rounded-xl border border-border/60 bg-card p-2 flex flex-col items-center gap-1 hover:border-primary/60 disabled:opacity-50 transition"
                >
                  <div className="w-14 h-14 flex items-center justify-center">
                    <GiftIcon animationType={g.animationType} tier={g.category} size="md" />
                  </div>
                  <div className="text-[10px] font-bold text-center leading-tight truncate w-full">{g.name}</div>
                  <div className="text-[10px] font-black text-primary tabular-nums">
                    {formatShekels(g.priceShekels)}
                  </div>
                  {isSending && (
                    <div className="absolute inset-0 grid place-items-center rounded-xl bg-background/70 backdrop-blur-sm">
                      <Loader2 className="animate-spin text-primary" size={20} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-4 pb-4">
          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
