import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Gift, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { SHEKEL, formatShekels } from "@/lib/gifts";
import GiftDetailDialog, { GiftTxDetail } from "./GiftDetailDialog";

interface SenderProfile {
  id: string;
  username: string;
  profile_photo_url: string | null;
}

function formatDate(s: string) {
  return new Date(s).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ReceivedGiftsPanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<GiftTxDetail[]>([]);
  const [senders, setSenders] = useState<Record<string, SenderProfile>>({});
  const [loading, setLoading] = useState(true);
  const [openTx, setOpenTx] = useState<GiftTxDetail | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("gift_transactions")
        .select(
          "id, gift_name, gift_id, quantity, total_shekels, receiver_earnings_shekels, platform_fee_shekels, sender_id, post_id, created_at, status",
        )
        .eq("receiver_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      const list = (data as GiftTxDetail[]) ?? [];
      setRows(list);

      const ids = Array.from(new Set(list.map((r) => r.sender_id)));
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, username, profile_photo_url")
          .in("id", ids);
        if (!cancelled && profs) {
          const map: Record<string, SenderProfile> = {};
          (profs as SenderProfile[]).forEach((p) => (map[p.id] = p));
          setSenders(map);
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading) {
    return (
      <div className="py-10 flex items-center justify-center text-muted-foreground text-sm">
        <Loader2 size={16} className="animate-spin mr-2" /> Loading your gifts…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="royal-card p-8 text-center space-y-2">
        <Gift className="size-8 mx-auto text-muted-foreground" />
        <p className="font-display text-base">No gifts received yet</p>
        <p className="text-xs text-muted-foreground">
          When fans send you Royal Gifts, they'll show up here.
        </p>
        <Link
          to="/wallet"
          className="inline-block mt-3 text-xs text-gold underline hover:text-primary"
        >
          See full wallet history →
        </Link>
      </div>
    );
  }

  const total = rows.reduce(
    (sum, r) => sum + Number(r.receiver_earnings_shekels || 0),
    0,
  );

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="royal-card p-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Total earned from gifts
          </p>
          <p className="font-display text-2xl text-gold leading-none mt-1 tabular-nums">
            {SHEKEL} {formatShekels(total)}
          </p>
        </div>
        <Link
          to="/wallet"
          className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground hover:text-gold underline"
        >
          Wallet →
        </Link>
      </div>

      <div className="space-y-2">
        {rows.map((r) => {
          const sender = senders[r.sender_id];
          return (
            <button
              key={r.id}
              onClick={() => setOpenTx(r)}
              className="royal-card p-3 flex items-center gap-3 w-full text-left hover:border-gold/40 transition-colors active:scale-[0.99]"
            >
              <div className="size-10 rounded-full bg-muted/40 overflow-hidden flex items-center justify-center text-xs font-bold shrink-0">
                {sender?.profile_photo_url ? (
                  <img
                    src={sender.profile_photo_url}
                    alt={sender.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (sender?.username?.[0] ?? "?").toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">
                  {sender?.username ?? "Someone"} sent {r.quantity > 1 ? `${r.quantity}× ` : ""}
                  {r.gift_name}
                </p>
                <p className="text-[11px] text-muted-foreground">{formatDate(r.created_at)}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-emerald-500 tabular-nums">
                  +{SHEKEL} {formatShekels(Number(r.receiver_earnings_shekels))}
                </p>
                <p className="text-[10px] text-muted-foreground">tap for details</p>
              </div>
            </button>
          );
        })}
      </div>

      <GiftDetailDialog
        tx={openTx}
        sender={openTx ? senders[openTx.sender_id] : undefined}
        open={!!openTx}
        onOpenChange={(o) => !o && setOpenTx(null)}
      />
    </div>
  );
}
