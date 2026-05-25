import { useMemo } from "react";
import { Flame } from "lucide-react";
import { ROYAL_GIFTS, SHEKEL, formatShekels } from "@/lib/gifts";
import { RoyalGift } from "@/types/gifts";
import { GiftIcon } from "@/components/gifts/GiftIcon";

/** Deterministic daily gift: rotates once per day, same for everyone. */
function pickDailyGift(): RoyalGift {
  // Use mid-tier pool so the "deal" feels meaningful
  const pool = ROYAL_GIFTS.filter(
    (g) => g.category === "popular" || g.category === "premium",
  );
  const today = new Date();
  const dayKey =
    today.getUTCFullYear() * 1000 + today.getUTCMonth() * 40 + today.getUTCDate();
  return pool[dayKey % pool.length];
}

export default function DailyDealCard({ onSelect }: { onSelect: (g: RoyalGift) => void }) {
  const gift = useMemo(pickDailyGift, []);
  const original = gift.shekelCost;
  const deal = Math.round((original * 0.85) / 10) * 10; // -15%, rounded to 10

  return (
    <button
      onClick={() => onSelect(gift)}
      className="w-full royal-card p-4 flex items-center gap-4 hover:border-gold/60 transition-all text-left group active:scale-[0.99]"
    >
      <div className="relative shrink-0">
        <GiftIcon animationType={gift.animationType} tier={gift.category} size="md" />
        <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-destructive text-destructive-foreground">
          −15%
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-primary font-bold">
          <Flame size={11} /> Daily Deal
        </div>
        <p className="font-display text-base leading-tight truncate">{gift.name}</p>
        <p className="text-[11px] text-muted-foreground">Today only · resets at midnight UTC</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[10px] text-muted-foreground line-through tabular-nums">
          {SHEKEL}
          {formatShekels(original)}
        </p>
        <p className="text-base font-bold tabular-nums text-gold">
          {SHEKEL}
          {formatShekels(deal)}
        </p>
      </div>
    </button>
  );
}
