import { Pin, Sparkles } from "lucide-react";
import { RoyalGift } from "@/types/gifts";
import { findGift, SHEKEL, formatShekels } from "@/lib/gifts";
import { useGiftFavorites } from "@/hooks/useGiftFavorites";
import { GiftIcon } from "./GiftIcon";
import { fxGiftPreview } from "@/lib/giftFx";

/**
 * Quick Send rail — surfaces a sender's pinned/favorite gifts at the top
 * of the gift panel for one-tap re-sending. Hidden when no favorites exist.
 */
export default function QuickSendRail({
  onPick,
  selectedId,
}: {
  onPick: (g: RoyalGift) => void;
  selectedId?: string;
}) {
  const { favorites } = useGiftFavorites();
  const gifts = favorites.map(findGift).filter((g): g is RoyalGift => !!g);

  if (gifts.length === 0) return null;

  return (
    <div className="px-5 mb-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Pin size={12} className="text-primary" fill="currentColor" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
          Quick Send · Your Royals
        </p>
        <Sparkles size={11} className="text-gold ml-auto" />
      </div>
      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
        {gifts.map((g) => {
          const active = selectedId === g.id;
          return (
            <button
              key={g.id}
              onClick={() => {
                fxGiftPreview(g.category);
                onPick(g);
              }}
              className={`shrink-0 w-[88px] rounded-2xl p-2 flex flex-col items-center gap-1 transition-all active:scale-95 ${
                active
                  ? "bg-gradient-to-br from-[hsl(var(--accent)/0.4)] to-[hsl(var(--secondary)/0.4)] ring-2 ring-primary"
                  : "bg-card/70 border border-border/60 hover:border-primary/40"
              }`}
            >
              <GiftIcon animationType={g.animationType} tier={g.category} size="sm" />
              <span className="text-[10px] font-semibold text-center leading-tight line-clamp-1 w-full">
                {g.name}
              </span>
              <span className="text-[10px] font-bold tabular-nums">
                <span className="text-gold mr-0.5">{SHEKEL}</span>
                {formatShekels(g.shekelCost)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
