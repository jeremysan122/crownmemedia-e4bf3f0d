import { RoyalGift } from "@/types/gifts";
import GiftCard from "./GiftCard";
import { giftsByCategory } from "@/lib/gifts";

export default function GiftGrid({
  category,
  selectedId,
  onSelect,
  sendingGiftId,
  disabled = false,
}: {
  category: RoyalGift["category"];
  selectedId?: string;
  onSelect: (g: RoyalGift) => void;
  sendingGiftId?: string;
  disabled?: boolean;
}) {
  const gifts = giftsByCategory(category);
  return (
    <div
      className={`px-5 grid grid-cols-3 gap-2.5 pb-4 max-h-[42vh] overflow-y-auto scrollbar-none ${
        disabled ? "pointer-events-none opacity-60" : ""
      }`}
    >
      {gifts.map((g) => (
        <GiftCard
          key={g.id}
          gift={g}
          selected={selectedId === g.id}
          onSelect={onSelect}
          isSending={sendingGiftId === g.id}
        />
      ))}
    </div>
  );
}
