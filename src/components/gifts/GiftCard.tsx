import { Loader2, Star } from "lucide-react";
import { RoyalGift, GiftCategory } from "@/types/gifts";
import { RARITY_RING, SHEKEL, formatShekels } from "@/lib/gifts";
import { GiftIcon } from "./GiftIcon";
import { useGiftFavorites } from "@/hooks/useGiftFavorites";
import { fxGiftPreview } from "@/lib/giftFx";

const HOVER_CLASS: Record<GiftCategory, string> = {
  low: "gift-card-hover-low",
  popular: "gift-card-hover-popular",
  premium: "gift-card-hover-premium",
  legendary: "gift-card-hover-legendary",
  mythic: "gift-card-hover-mythic",
};

export default function GiftCard({
  gift,
  selected,
  onSelect,
  isSending = false,
  showFavorite = true,
}: {
  gift: RoyalGift;
  selected: boolean;
  onSelect: (g: RoyalGift) => void;
  isSending?: boolean;
  showFavorite?: boolean;
}) {
  const { isFavorite, toggle } = useGiftFavorites();
  const fav = isFavorite(gift.id);
  const isHeavy = gift.rarity === "legendary" || gift.rarity === "mythic";

  return (
    <button
      onClick={() => {
        fxGiftPreview(gift.category);
        onSelect(gift);
      }}
      disabled={isSending}
      className={`group relative rounded-2xl p-3 flex flex-col items-center gap-1.5 transition-all active:scale-95 ${
        HOVER_CLASS[gift.category]
      } ${RARITY_RING[gift.rarity]} ${
        selected
          ? "bg-gradient-to-br from-[hsl(var(--accent)/0.4)] to-[hsl(var(--secondary)/0.4)] ring-2 ring-primary purple-shadow"
          : "bg-card/70"
      } ${isSending ? "opacity-80" : ""}`}
    >
      {showFavorite && (
        <span
          role="button"
          tabIndex={0}
          aria-label={fav ? "Unpin gift" : "Pin gift"}
          onClick={(e) => {
            e.stopPropagation();
            toggle(gift.id);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              toggle(gift.id);
            }
          }}
          className={`absolute top-1.5 right-1.5 z-10 size-6 rounded-full flex items-center justify-center transition-all ${
            fav ? "bg-gradient-gold text-primary-foreground gold-shadow" : "bg-background/60 text-muted-foreground opacity-0 group-hover:opacity-100"
          }`}
        >
          <Star size={12} fill={fav ? "currentColor" : "none"} strokeWidth={2.4} />
        </span>
      )}

      {/* Sparkle orbit for legendary/mythic on hover */}
      {isHeavy && (
        <span aria-hidden className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {Array.from({ length: 4 }).map((_, i) => (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 size-1.5 rounded-full bg-[hsl(43_95%_70%)] shadow-[0_0_8px_2px_hsl(43_95%_60%/0.9)]"
              style={{
                animation: `sparkle-orbit 1.6s linear infinite`,
                animationDelay: `${i * 0.4}s`,
              }}
            />
          ))}
        </span>
      )}

      <div className="gift-card-icon">
        <GiftIcon animationType={gift.animationType} tier={gift.category} size="md" />
      </div>
      <div className="text-[11px] font-semibold text-center text-foreground leading-tight line-clamp-2 min-h-[28px]">
        {gift.name}
      </div>
      <div className="flex items-center gap-0.5 text-[11px] font-bold tabular-nums">
        <span className="text-gold">{SHEKEL}</span>
        <span className="text-foreground">{formatShekels(gift.shekelCost)}</span>
      </div>
      {gift.rarity === "legendary" && (
        <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-gradient-gold text-primary-foreground">
          Legendary
        </span>
      )}
      {gift.rarity === "mythic" && (
        <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-gradient-crimson text-destructive-foreground">
          Mythic
        </span>
      )}
      {isSending && (
        <span className="absolute inset-0 rounded-2xl bg-background/40 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-gold" />
        </span>
      )}
    </button>
  );
}
