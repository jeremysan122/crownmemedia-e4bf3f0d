// Live moderation activity log for a battle. Shows recent mute/unmute/kick
// actions with actor + target usernames. Reads from live_battle_participants
// (RLS scopes visibility to targets, actors, hosts, opponents, and mods) and
// subscribes to realtime inserts so viewers see actions as they happen.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchLiveBattleModActions, type LiveBattleModAction } from "@/lib/liveBattles";
import { Mic, MicOff, UserX, ChevronDown, ChevronUp } from "lucide-react";

interface Props { battleId: string; selfId?: string | null; }

type ProfileLite = { id: string; username: string | null };

function actionMeta(a: LiveBattleModAction["action"]) {
  switch (a) {
    case "mute":   return { label: "muted",   Icon: MicOff, tone: "text-amber-400" };
    case "unmute": return { label: "unmuted", Icon: Mic,    tone: "text-emerald-400" };
    case "kick":   return { label: "removed", Icon: UserX,  tone: "text-destructive" };
  }
}

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export default function LiveBattleActivityLog({ battleId, selfId }: Props) {
  const [rows, setRows] = useState<LiveBattleModAction[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchLiveBattleModActions(battleId);
        if (mounted) setRows(data);
      } catch { /* RLS may block — silent */ }
      finally { if (mounted) setLoading(false); }
    })();
    const ch = supabase
      .channel(`live_battle_activity:${battleId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "live_battle_participants",
        filter: `battle_id=eq.${battleId}`,
      }, (payload) => {
        const row = payload.new as LiveBattleModAction;
        setRows((prev) => (prev.find((r) => r.id === row.id) ? prev : [row, ...prev].slice(0, 50)));
      })
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [battleId]);

  // Batch-load usernames for actor + target ids we don't have yet.
  const missingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rows) {
      if (!names[r.actor_id]) ids.add(r.actor_id);
      if (!names[r.target_user_id]) ids.add(r.target_user_id);
    }
    return [...ids];
  }, [rows, names]);

  useEffect(() => {
    if (missingIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("profiles")
        .select("id,username").in("id", missingIds);
      if (cancelled || !data) return;
      setNames((prev) => {
        const next = { ...prev };
        for (const p of data as ProfileLite[]) {
          next[p.id] = p.username ?? p.id.slice(0, 6);
        }
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [missingIds]);

  if (loading) return null;
  if (rows.length === 0) return null;

  const visible = expanded ? rows : rows.slice(0, 3);

  return (
    <div className="mt-3 rounded-lg border border-border/50 bg-card/60">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
        aria-expanded={expanded}
      >
        <span>Moderation activity ({rows.length})</span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      <ul className="divide-y divide-border/40">
        {visible.map((r) => {
          const meta = actionMeta(r.action);
          const Icon = meta.Icon;
          const target = names[r.target_user_id] ?? r.target_user_id.slice(0, 6);
          const actor = names[r.actor_id] ?? r.actor_id.slice(0, 6);
          const iAmTarget = selfId === r.target_user_id;
          return (
            <li key={r.id} className="px-3 py-1.5 flex items-center gap-2 text-xs">
              <Icon className={`w-3.5 h-3.5 shrink-0 ${meta.tone}`} />
              <span className="flex-1 min-w-0 truncate">
                <span className="font-medium">@{actor}</span>{" "}
                <span className="text-muted-foreground">{meta.label}</span>{" "}
                <span className="font-medium">{iAmTarget ? "you" : `@${target}`}</span>
              </span>
              <time className="text-[10px] text-muted-foreground shrink-0" dateTime={r.created_at}>
                {timeAgo(r.created_at)}
              </time>
            </li>
          );
        })}
      </ul>
      {!expanded && rows.length > 3 && (
        <div className="px-3 py-1.5 text-[10px] text-muted-foreground text-center">
          + {rows.length - 3} more
        </div>
      )}
    </div>
  );
}
