import { Plus, Wallet } from "lucide-react";
import { SHEKEL, formatShekels } from "@/lib/gifts";

export default function GiftWalletBar({
  balance,
  onAdd,
}: {
  balance: number;
  onAdd: () => void;
}) {
  return (
    <div className="mx-5 mb-3 flex items-center justify-between rounded-2xl bg-gradient-card border border-border/60 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <div className="size-9 rounded-xl bg-gradient-gold flex items-center justify-center text-primary-foreground">
          <Wallet size={16} />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Wallet</p>
          <p className="font-bold tabular-nums text-foreground leading-none mt-0.5">
            <span className="text-gold mr-1">{SHEKEL}</span>
            {formatShekels(balance)}
          </p>
        </div>
      </div>
      <button
        onClick={onAdd}
        className="flex items-center gap-1 px-3 py-2 rounded-full bg-gradient-gold text-primary-foreground text-xs font-bold gold-shadow active:scale-95 transition-transform"
      >
        <Plus size={14} strokeWidth={3} />
        Add Shekels
      </button>
    </div>
  );
}
