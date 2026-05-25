import { Check, Loader2, Send, X } from "lucide-react";
import { SHEKEL, formatShekels } from "@/lib/gifts";
import { RoyalGift } from "@/types/gifts";

export type SendStatus = "idle" | "sending" | "sent" | "failed";

export default function GiftSendButton({
  gift,
  quantity,
  status,
  insufficient,
  onSend,
}: {
  gift?: RoyalGift;
  quantity: number;
  status: SendStatus;
  insufficient: boolean;
  onSend: () => void;
}) {
  const total = (gift?.shekelCost ?? 0) * quantity;
  const receiverEarnings = Math.floor(total * 0.5);
  const isSending = status === "sending";
  const isSent = status === "sent";
  const isFailed = status === "failed";
  const disabled = !gift || isSending;

  return (
    <div className="px-5 pb-5 pt-2 safe-bottom">
      {gift && !isSending && !isSent && !isFailed && (
        <div className="mb-2 flex items-center justify-between text-[11px] px-1">
          <span className="text-muted-foreground uppercase tracking-wider">
            Recipient earns
          </span>
          <span className="font-bold tabular-nums">
            <span className="text-gold mr-0.5">{SHEKEL}</span>
            <span className="text-foreground">{formatShekels(receiverEarnings)}</span>
            <span className="text-muted-foreground ml-1">(50%)</span>
          </span>
        </div>
      )}
      <button
        onClick={onSend}
        disabled={disabled}
        className={`w-full h-14 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
          disabled && !isSending
            ? "bg-muted text-muted-foreground"
            : isSending
            ? "bg-gradient-gold/70 text-primary-foreground"
            : isSent
            ? "bg-emerald-600 text-white"
            : isFailed
            ? "bg-destructive text-destructive-foreground"
            : insufficient
            ? "bg-gradient-crimson text-destructive-foreground"
            : "bg-gradient-gold text-primary-foreground gold-shadow"
        }`}
      >
        {!gift ? (
          <span className="text-sm uppercase tracking-wider">Pick a gift</span>
        ) : isSending ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm uppercase tracking-wider">Sending…</span>
          </>
        ) : isSent ? (
          <>
            <Check size={18} />
            <span className="text-sm uppercase tracking-wider">Sent!</span>
          </>
        ) : isFailed ? (
          <>
            <X size={18} />
            <span className="text-sm uppercase tracking-wider">Failed — tap to retry</span>
          </>
        ) : insufficient ? (
          <span className="text-sm uppercase tracking-wider">Add Shekels to send</span>
        ) : (
          <>
            <Send size={16} />
            <span className="text-sm uppercase tracking-wider">
              Send {quantity > 1 ? `${quantity}× ` : ""}{gift.name}
            </span>
            <span className="text-sm tabular-nums">·</span>
            <span className="text-sm tabular-nums">
              {SHEKEL}{formatShekels(total)}
            </span>
          </>
        )}
      </button>
    </div>
  );
}
