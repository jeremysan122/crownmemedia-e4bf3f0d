import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Send, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { SHEKEL, formatShekels } from "@/lib/gifts";

interface ReceiverProfile {
  id: string;
  username: string;
  profile_photo_url: string | null;
}

interface SentTx {
  id: string;
  gift_name: string;
  quantity: number;
  total_shekels: number;
  receiver_id: string;
  post_id: string | null;
  created_at: string;
}

function formatDate(s: string) {
  return new Date(s).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SentGiftsPanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<SentTx[]>([]);
  const [receivers, setReceivers] = useState<Record<string, ReceiverProfile>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("gift_transactions")
        .select("id, gift_name, quantity, total_shekels, receiver_id, post_id, created_at")
        .eq("sender_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      const list = (data as SentTx[]) ?? [];
      setRows(list);

      const ids = Array.from(new Set(list.map((r) => r.receiver_id)));
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, username, profile_photo_url")
          .in("id", ids);
        if (!cancelled && profs) {
          const map: Record<string, ReceiverProfile> = {};
          (profs as ReceiverProfile[]).forEach((p) => (map[p.id] = p));
          setReceivers(map);
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
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="royal-card p-8 text-center space-y-2">
        <Send className="size-8 mx-auto text-muted-foreground" />
        <p className="font-display text-base">No gifts sent yet</p>
        <p className="text-xs text-muted-foreground">
          Send a Royal Gift on any post or profile to support a creator.
        </p>
        <Link
          to="/feed"
          className="inline-block mt-3 text-xs text-gold underline hover:text-primary"
        >
          Browse the feed →
        </Link>
      </div>
    );
  }

  const total = rows.reduce((sum, r) => sum + Number(r.total_shekels || 0), 0);

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="royal-card p-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Total spent on gifts
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
          const rcv = receivers[r.receiver_id];
          return (
            <div
              key={r.id}
              className="royal-card p-3 flex items-center gap-3"
            >
              <div className="size-10 rounded-full bg-muted/40 overflow-hidden flex items-center justify-center text-xs font-bold shrink-0">
                {rcv?.profile_photo_url ? (
                  <img
                    src={rcv.profile_photo_url}
                    alt={rcv.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (rcv?.username?.[0] ?? "?").toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">
                  Sent {r.quantity > 1 ? `${r.quantity}× ` : ""}
                  {r.gift_name}
                  {rcv ? ` to ${rcv.username}` : ""}
                </p>
                <p className="text-[11px] text-muted-foreground">{formatDate(r.created_at)}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-foreground tabular-nums">
                  −{SHEKEL} {formatShekels(Number(r.total_shekels))}
                </p>
                {r.post_id && (
                  <Link
                    to={`/post/${r.post_id}`}
                    className="text-[10px] text-gold underline"
                  >
                    view post
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
