import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { findGift } from "@/lib/gifts";
import { GiftIcon } from "./GiftIcon";

interface FeedItem {
  id: string;
  sender_id: string;
  gift_id: string;
  gift_name: string;
  quantity: number;
  created_at: string;
  sender_username?: string;
}

export default function GiftLiveFeed({ postId }: { postId?: string }) {
  const [items, setItems] = useState<FeedItem[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      let q = supabase
        .from("gift_transactions_public" as any)
        .select("id, sender_id, gift_id, gift_name, quantity, created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      if (postId) q = q.eq("post_id", postId);
      const { data } = (await q) as { data: FeedItem[] | null };
      if (!active || !data) return;
      // fetch usernames
      const senderIds = [...new Set(data.map((d) => d.sender_id))];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", senderIds);
      const map = new Map((profs ?? []).map((p) => [p.id, p.username]));
      setItems(data.map((d) => ({ ...d, sender_username: map.get(d.sender_id) })));
    };
    load();

    // gift_transactions is no longer published to Realtime (financial data isolation),
    // so use a lightweight 15s polling fallback to keep the feed live.
    const interval = window.setInterval(load, 15000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [postId]);

  if (items.length === 0) return null;

  return (
    <div className="px-5 mb-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Live gifts</p>
      <div className="flex gap-2 overflow-x-auto scrollbar-none">
        {items.map((it) => {
          const g = findGift(it.gift_id);
          return (
            <div
              key={it.id}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-card/70 border border-border/60 text-[11px] whitespace-nowrap animate-fade-in"
            >
              {g ? (
                <GiftIcon animationType={g.animationType} tier={g.category} size="xs" animated={false} />
              ) : (
                <GiftIcon animationType="royal_token" tier="low" size="xs" animated={false} />
              )}
              <span className="text-muted-foreground">@{it.sender_username ?? "user"}</span>
              <span className="text-gold font-bold">×{it.quantity}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
