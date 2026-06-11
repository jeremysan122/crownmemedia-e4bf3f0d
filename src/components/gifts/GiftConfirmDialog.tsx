import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { BadgeCheck, Loader2 } from "lucide-react";
import { SHEKEL, formatShekels } from "@/lib/gifts";
import { RoyalGift } from "@/types/gifts";

export default function GiftConfirmDialog({
  open,
  onOpenChange,
  gift,
  quantity,
  recipient,
  balance,
  sending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  gift: RoyalGift | null;
  quantity: number;
  recipient: { username: string; displayName?: string; avatarUrl?: string | null; verified?: boolean } | null;
  balance: number;
  sending: boolean;
  onConfirm: () => void;
}) {
  if (!gift || !recipient) return null;
  const total = gift.shekelCost * quantity;
  const remaining = balance - total;

  return (
    <Dialog open={open} onOpenChange={(v) => !sending && onOpenChange(v)}>
      <DialogContent className="max-w-sm bg-gradient-card border border-border/70 p-0 overflow-hidden rounded-2xl">
        <VisuallyHidden>
          <DialogTitle>Confirm gift</DialogTitle>
          <DialogDescription>Review the recipient and final cost before sending.</DialogDescription>
        </VisuallyHidden>

        <div className="p-5 space-y-4">
          <div className="text-center">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Confirm gift</p>
            <p className="font-display text-xl text-gold mt-1">Send {quantity}x {gift.name}</p>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-card/60 border border-border/60">
            <div className="text-3xl shrink-0" aria-hidden>{gift.icon}</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">To</p>
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="font-semibold text-sm truncate">{recipient.displayName ?? recipient.username}</p>
                {recipient.verified && <BadgeCheck size={13} className="text-primary shrink-0" fill="currentColor" />}
              </div>
              <p className="text-xs text-muted-foreground truncate">@{recipient.username}</p>
            </div>
            {recipient.avatarUrl && (
              <img src={recipient.avatarUrl} alt="" className="size-10 rounded-full object-cover shrink-0" />
            )}
          </div>

          <div className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Cost</span>
              <span className="font-bold tabular-nums">{SHEKEL} {formatShekels(total)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Your balance</span>
              <span className="tabular-nums">{SHEKEL} {formatShekels(balance)}</span>
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t border-border/60">
              <span className="text-muted-foreground">After send</span>
              <span className={`font-bold tabular-nums ${remaining < 0 ? "text-destructive" : "text-foreground"}`}>
                {SHEKEL} {formatShekels(Math.max(0, remaining))}
              </span>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={sending}
              onClick={() => onOpenChange(false)}
              className="flex-1 h-11 rounded-full bg-background/60 border border-border/60 font-semibold text-sm hover:bg-background/80 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={sending || remaining < 0}
              onClick={onConfirm}
              className="flex-[1.4] h-11 rounded-full bg-gradient-gold text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition"
            >
              {sending ? (<><Loader2 size={14} className="animate-spin" /> Sending…</>) : `Send · ${SHEKEL} ${formatShekels(total)}`}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
