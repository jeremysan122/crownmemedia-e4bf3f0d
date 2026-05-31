import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Gift, ArrowDownCircle, Clock, Hash, Coins } from "lucide-react";
import { Link } from "react-router-dom";
import { SHEKEL, formatShekels } from "@/lib/gifts";

export interface GiftTxDetail {
  id: string;
  gift_name: string;
  gift_id: string;
  quantity: number;
  total_shekels: number;
  receiver_earnings_shekels: number;
  platform_fee_shekels: number;
  sender_id: string;
  post_id: string | null;
  created_at: string;
  status: string;
}

interface SenderInfo {
  username?: string;
  profile_photo_url?: string | null;
}

interface Props {
  tx: GiftTxDetail | null;
  sender?: SenderInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatFull(s: string) {
  return new Date(s).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function GiftDetailDialog({ tx, sender, open, onOpenChange }: Props) {
  if (!tx) return null;
  const unit = Number(tx.total_shekels) / Math.max(1, tx.quantity);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-gold">
            <Gift size={18} /> Gift Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Sender */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="size-12 rounded-full bg-muted/40 overflow-hidden flex items-center justify-center text-sm font-bold">
              {sender?.profile_photo_url ? (
                <img
                  src={sender.profile_photo_url}
                  alt={sender.username ?? ""}
                  className="w-full h-full object-cover"
                />
              ) : (
                (sender?.username?.[0] ?? "?").toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">From</p>
              {sender?.username ? (
                <Link
                  to={`/u/${sender.username}`}
                  onClick={() => onOpenChange(false)}
                  className="text-sm font-bold text-foreground hover:text-gold truncate block"
                >
                  @{sender.username}
                </Link>
              ) : (
                <p className="text-sm font-bold truncate">Unknown sender</p>
              )}
            </div>
          </div>

          {/* Gift line */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Gift size={14} /> Gift
              </span>
              <span className="font-bold">{tx.gift_name}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Hash size={14} /> Quantity
              </span>
              <span className="font-bold tabular-nums">{tx.quantity}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Coins size={14} /> Unit cost
              </span>
              <span className="font-bold tabular-nums">
                {SHEKEL} {formatShekels(unit)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Coins size={14} /> Sender paid
              </span>
              <span className="font-bold tabular-nums">
                {SHEKEL} {formatShekels(Number(tx.total_shekels))}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                Platform fee
              </span>
              <span className="text-muted-foreground tabular-nums">
                {SHEKEL} {formatShekels(Number(tx.platform_fee_shekels))}
              </span>
            </div>
            <div className="flex items-center justify-between text-base pt-2 border-t border-border/50">
              <span className="flex items-center gap-2 text-emerald-500 font-bold">
                <ArrowDownCircle size={16} /> You earned
              </span>
              <span className="font-bold text-emerald-500 tabular-nums">
                +{SHEKEL} {formatShekels(Number(tx.receiver_earnings_shekels))}
              </span>
            </div>
          </div>

          {/* Meta */}
          <div className="pt-2 border-t border-border/50 space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Clock size={12} /> {formatFull(tx.created_at)}
            </div>
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-emerald-500" /> Status: {tx.status}
            </div>
            <div className="font-mono text-[10px] opacity-60 break-all">tx: {tx.id}</div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {tx.post_id && (
              <Link
                to={`/post/${tx.post_id}`}
                onClick={() => onOpenChange(false)}
                className="flex-1 h-9 rounded-full bg-muted/40 border border-border text-xs font-bold uppercase tracking-wider flex items-center justify-center hover:bg-muted/60"
              >
                View post
              </Link>
            )}
            <Link
              to="/wallet"
              onClick={() => onOpenChange(false)}
              className="flex-1 h-9 rounded-full bg-gradient-gold text-primary-foreground text-xs font-bold uppercase tracking-wider flex items-center justify-center gold-shadow"
            >
              Wallet history
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
