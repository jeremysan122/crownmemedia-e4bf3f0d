// Unified history list — merges post battles and ended live battles for
// the current user, most recent first. Callers pass `limit` for previews
// (Battles Hub) or leave undefined for the full history page.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Radio, Swords, Trophy, Minus } from "lucide-react";

type Item =
  | { kind: "live"; id: string; ts: string; opponent_id: string; won: boolean | null; tied: boolean; category: string | null; host: boolean }
  | { kind: "post"; id: string; ts: string; opponent_id: string; won: boolean | null; tied: boolean; category: string | null; host: boolean };

export default function BattleHistoryList({ limit }: { limit?: number }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    (async () => {
      const [live, post] = await Promise.all([
        supabase.from("live_battles")
          .select("id,host_id,opponent_id,winner_id,status,ends_at,started_at,created_at,category_slug")
          .or(`host_id.eq.${user.id},opponent_id.eq.${user.id}`)
          .eq("status", "ended")
          .order("ends_at", { ascending: false })
          .limit(limit ?? 40),
        supabase.from("battles")
          .select("id,challenger_id,opponent_id,winner_id,status,ended_at,created_at")
          .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
          .eq("status", "completed")
          .order("ended_at", { ascending: false })
          .limit(limit ?? 40),
      ]);

      const merged: Item[] = [];
      (live.data ?? []).forEach((b: any) => {
        const host = b.host_id === user.id;
        const otherId = host ? b.opponent_id : b.host_id;
        merged.push({
          kind: "live", id: b.id, ts: b.ends_at ?? b.started_at ?? b.created_at,
          opponent_id: otherId,
          won: b.winner_id ? b.winner_id === user.id : null,
          tied: b.winner_id === null,
          category: b.category_slug, host,
        });
      });
      (post.data ?? []).forEach((b: any) => {
        const host = b.challenger_id === user.id;
        const otherId = host ? b.opponent_id : b.challenger_id;
        merged.push({
          kind: "post", id: b.id, ts: b.ended_at ?? b.created_at,
          opponent_id: otherId,
          won: b.winner_id ? b.winner_id === user.id : null,
          tied: b.winner_id === null,
          category: null, host,
        });
      });
      merged.sort((a, b) => (a.ts < b.ts ? 1 : -1));
      const trimmed = limit ? merged.slice(0, limit) : merged;

      const ids = Array.from(new Set(trimmed.map((m) => m.opponent_id).filter(Boolean)));
      if (ids.length) {
        const { data: prof } = await supabase.from("profiles").select("id,username").in("id", ids);
        const map: Record<string, string> = {};
        (prof ?? []).forEach((p: any) => { map[p.id] = p.username; });
        if (mounted) setNames(map);
      }
      if (mounted) setItems(trimmed);
    })();
    return () => { mounted = false; };
  }, [user?.id, limit]);

  if (!user?.id) return null;
  if (items === null) {
    return <div className="flex justify-center py-6 text-muted-foreground"><Loader2 className="animate-spin" size={16} /></div>;
  }
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">No battles yet — challenge someone!</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((it) => {
        const to = it.kind === "live" ? `/live/${it.id}` : `/battles/${it.id}`;
        const opp = names[it.opponent_id] ?? "royal";
        return (
          <li key={`${it.kind}:${it.id}`}>
            <Link to={to} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 hover:border-primary/50 transition">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                {it.kind === "live" ? <Radio size={16} className="text-red-500" /> : <Swords size={16} className="text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">
                  {it.host ? "You" : "You"} vs @{opp}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {it.kind === "live" ? "Live" : "Post"} battle · {new Date(it.ts).toLocaleDateString()}
                  {it.category ? ` · ${it.category}` : ""}
                </p>
              </div>
              <Outcome won={it.won} tied={it.tied} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Outcome({ won, tied }: { won: boolean | null; tied: boolean }) {
  if (tied) return <span className="text-xs font-bold text-muted-foreground flex items-center gap-1"><Minus size={12} />Tie</span>;
  if (won === true) return <span className="text-xs font-bold text-primary flex items-center gap-1"><Trophy size={12} />Won</span>;
  if (won === false) return <span className="text-xs font-bold text-muted-foreground">Lost</span>;
  return <span className="text-xs text-muted-foreground">—</span>;
}
