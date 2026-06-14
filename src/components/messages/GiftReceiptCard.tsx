import { useEffect, useRef, useState } from "react";
import { Crown, Gift, RotateCw, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { timeAgo } from "@/lib/crown";
import { findGift } from "@/lib/gifts";
import { GiftIcon } from "@/components/gifts/GiftIcon";
import GiftAnimationOverlay from "@/components/gifts/GiftAnimationOverlay";
import type { GiftTransactionRow } from "@/types/gifts";

interface Props {
  messageId: string;
  giftTransactionId: string;
  mine: boolean;
  viewerId: string;
  createdAt: string;
  seenAt: string | null;
  senderUsername?: string | null;
  senderAvatarUrl?: string | null;
}

/**
 * Royal "Gift received" receipt rendered inside a DM thread.
 * - Fetches the underlying gift_transactions row (RLS allows sender/receiver).
 * - On first view by recipient, calls `mark_dm_gift_seen` and plays the animation once.
 * - "Replay" button re-plays on demand.
 * - If the transaction is later refunded/reversed, surfaces the status badge.
 */
export default function GiftReceiptCard({
  messageId,
  giftTransactionId,
  mine,
  viewerId,
  createdAt,
  seenAt,
  senderUsername,
  senderAvatarUrl,
}: Props) {
  const [tx, setTx] = useState<GiftTransactionRow & { status?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [animateFor, setAnimateFor] = useState<string | null>(null);
  const markedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("gift_transactions")
      .select("id, sender_id, receiver_id, post_id, gift_id, gift_name, quantity, total_shekels, created_at, status")
      .eq("id", giftTransactionId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setTx(data as never);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [giftTransactionId]);

  // Recipient-only: mark seen + play animation once on first view.
  useEffect(() => {
    if (mine || !tx || markedRef.current) return;
    markedRef.current = true;
    if (!seenAt) {
      void supabase.rpc("mark_dm_gift_seen", { p_message_id: messageId } as never);
      setAnimateFor(tx.gift_id);
      try { (window as any).analytics?.track?.("dm_gift_animation_opened", { gift_id: tx.gift_id }); } catch {}
    }
  }, [mine, tx, seenAt, messageId]);

  const replay = () => {
    if (!tx) return;
    setAnimateFor(null);
    requestAnimationFrame(() => setAnimateFor(tx.gift_id));
  };

  if (loading) {
    return (
      <div className="max-w-[78%] rounded-2xl px-3 py-3 bg-muted/60 text-xs text-muted-foreground animate-pulse">
        Loading gift…
      </div>
    );
  }
  if (!tx) {
    return (
      <div className="max-w-[78%] rounded-2xl px-3 py-2 bg-muted/40 text-xs text-muted-foreground">
        🎁 Gift unavailable
      </div>
    );
  }

  const giftMeta = findGift(tx.gift_id);
  const icon = giftMeta?.icon ?? "🎁";
  const rarity = giftMeta?.rarity ?? "common";
  const refunded = (tx.status && tx.status !== "completed") || false;

  return (
    <>
      <div
        className={`relative max-w-[82%] rounded-2xl p-3 border ${
          refunded ? "border-destructive/40 bg-destructive/5" : "border-primary/40 bg-gradient-to-br from-primary/10 via-background to-amber-500/10"
        } shadow-[0_0_24px_-12px_hsl(var(--primary)/0.6)]`}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="size-7 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground">
            <Crown size={14} />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gold">Royal Gift {mine ? "sent" : "received"}</p>
          {refunded && (
            <span className="ml-auto text-[10px] uppercase tracking-wider text-destructive font-bold">{tx.status}</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="size-14 rounded-2xl bg-background/70 border border-border/60 flex items-center justify-center text-3xl shrink-0">
            <span aria-hidden>{icon}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base text-foreground truncate">{tx.gift_name}</p>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-bold">
                {rarity}
              </span>
              {tx.quantity > 1 && (
                <span className="text-[10px] text-muted-foreground">× {tx.quantity}</span>
              )}
              <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                <Sparkles size={10} className="text-amber-400" /> ₪{Number(tx.total_shekels).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40">
          <span className="text-[10px] text-muted-foreground">{timeAgo(createdAt)}</span>
          {!mine && (
            <button
              type="button"
              onClick={replay}
              className="inline-flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 font-semibold"
              aria-label="Replay gift animation"
            >
              <RotateCw size={11} /> Replay
            </button>
          )}
        </div>
      </div>

      {animateFor && giftMeta && (
        <GiftAnimationOverlay
          gift={giftMeta}
          quantity={tx.quantity}
          onDone={() => setAnimateFor(null)}
        />
      )}
    </>
  );
}
