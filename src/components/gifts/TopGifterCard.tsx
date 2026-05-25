import { useEffect, useState } from "react";
import { Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SHEKEL, formatShekels } from "@/lib/gifts";

export default function TopGifterCard({ recipientId }: { recipientId: string }) {
  const [top, setTop] = useState<{ username: string; total: number } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = (await supabase
        .from("gift_transactions_public" as any)
        .select("sender_id, total_shekels")
        .eq("receiver_id", recipientId)
        .limit(500)) as { data: { sender_id: string; total_shekels: number }[] | null };
      if (!active || !data || data.length === 0) return;
      const totals = new Map<string, number>();
      for (const r of data) {
        totals.set(r.sender_id, (totals.get(r.sender_id) ?? 0) + Number(r.total_shekels));
      }
      const [topId, topTotal] = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
      const { data: prof } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", topId)
        .maybeSingle();
      if (active && prof) setTop({ username: prof.username, total: topTotal });
    })();
    return () => { active = false; };
  }, [recipientId]);

  if (!top) return null;
  return (
    <div className="mx-5 mb-3 flex items-center gap-2.5 rounded-2xl px-3 py-2 bg-gradient-royal border border-border/60">
      <div className="size-8 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground">
        <Crown size={14} fill="currentColor" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Top Gifter</p>
        <p className="text-sm font-semibold truncate">@{top.username}</p>
      </div>
      <div className="text-right">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sent</p>
        <p className="text-sm font-bold tabular-nums text-gold">
          {SHEKEL}{formatShekels(top.total)}
        </p>
      </div>
    </div>
  );
}
