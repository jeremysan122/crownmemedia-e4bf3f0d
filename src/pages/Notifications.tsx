import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { trackUsage } from "@/lib/usageTrack";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { timeAgo } from "@/lib/crown";
import { Bell, Crown, Heart, MessageCircle, UserPlus, Swords, AtSign, Reply as ReplyIcon, Check, Trash2, MailOpen, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Group = "reply" | "mention" | "vote" | "follow" | "crown" | "battle" | "other";

const GROUPS: { key: Group; label: string; Icon: any }[] = [
  { key: "reply", label: "Replies", Icon: ReplyIcon },
  { key: "mention", label: "Mentions", Icon: AtSign },
  { key: "vote", label: "Votes & gifts", Icon: Heart },
  { key: "follow", label: "Follows", Icon: UserPlus },
  { key: "crown", label: "Crowns", Icon: Crown },
  { key: "battle", label: "Battles", Icon: Swords },
  { key: "other", label: "Other", Icon: Bell },
];

function classify(n: any): Group {
  if (n.type === "comment" && n.payload?.reply) return "reply";
  if (n.type === "comment" && n.payload?.mention) return "mention";
  if (n.type === "comment") return "reply";
  if (n.type === "vote") return "vote";
  if (n.type === "follow") return "follow";
  if (n.type?.startsWith("crown")) return "crown";
  if (n.type?.startsWith("battle")) return "battle";
  return "other";
}

function targetFor(n: any): string | null {
  const p = n.payload || {};
  if (p.battle_id) return `/battles?b=${p.battle_id}`;
  if (n.type === "follow" && p.follower_id) return `/u/${p.follower_id}`;
  if (p.post_id) return `/post/${p.post_id}`;
  return null;
}

export default function Notifications() {
  useSeoMeta({ title: "Notifications · CrownMe", noIndex: true });
  const { user } = useAuth();
  const nav = useNavigate();
  const [list, setList] = useState<any[]>([]);
  const [active, setActive] = useState<Group | "all">("all");

  // Dedupe by id — defends against any duplicate inserts (realtime + initial load).
  const dedupe = (arr: any[]) => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const n of arr) {
      if (!n?.id || seen.has(n.id)) continue;
      seen.add(n.id);
      out.push(n);
    }
    return out;
  };

  const refresh = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .neq("type", "dm")
      .order("created_at", { ascending: false })
      .limit(120);
    setList(dedupe(data || []));
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [user?.id]);

  // Realtime: new notifications stream in, deduped by id.
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`notifs-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n: any = payload.new;
          if (!n || n.type === "dm") return;
          setList((prev) => dedupe([n, ...prev]));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  // Once the user lands on the notifications inbox, all currently-unread
  // alerts are considered "viewed" and the bell badge clears immediately.
  useEffect(() => {
    if (!user?.id) return;
    const t = setTimeout(async () => {
      await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
      setList((l) => l.map((n) => ({ ...n, read: true })));
    }, 600);
    return () => clearTimeout(t);
  }, [user?.id]);

  const markRead = async (id: string) => {
    if (!id) return;
    setList((l) => l.map((n) => n.id === id ? { ...n, read: true } : n));
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  };

  const markUnread = async (id: string) => {
    if (!id) return;
    setList((l) => l.map((n) => n.id === id ? { ...n, read: false } : n));
    await supabase.from("notifications").update({ read: false }).eq("id", id);
  };

  const removeOne = async (id: string) => {
    setList((l) => l.filter((n) => n.id !== id));
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) toast.error("Could not delete notification");
  };

  const markAllRead = async () => {
    if (!user?.id) return;
    setList((l) => l.map((n) => ({ ...n, read: true })));
    const { error } = await supabase.rpc("mark_all_notifications_read");
    if (error) {
      toast.error("Could not mark all as read");
      refresh();
    } else {
      toast.success("All notifications marked as read");
    }
  };

  const clearAll = async () => {
    if (!user?.id) return;
    if (!window.confirm("Delete all notifications? This cannot be undone.")) return;
    const ids = list.map((n) => n.id);
    setList([]);
    if (ids.length) await supabase.from("notifications").delete().in("id", ids);
  };

  const handleOpen = async (n: any) => {
    if (!n.read) await markRead(n.id);
    const t = targetFor(n);
    if (t) nav(t);
  };

  const grouped = useMemo(() => {
    const map = new Map<Group, any[]>();
    for (const n of list) {
      const g = classify(n);
      const arr = map.get(g) ?? [];
      arr.push(n);
      map.set(g, arr);
    }
    return map;
  }, [list]);

  const visible = active === "all" ? list : grouped.get(active) ?? [];
  const unreadCount = list.filter((n) => !n.read).length;

  return (
    <AppShell title="NOTIFICATIONS">
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display text-xl text-gold">Royal Decrees</h1>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={markAllRead}>
                <Check size={12} /> Mark all read
              </Button>
            )}
            {list.length > 0 && (
              <Button size="sm" variant="ghost" className="h-7 text-[11px] text-destructive hover:text-destructive" onClick={clearAll}>
                <Trash2 size={12} /> Clear all
              </Button>
            )}
          </div>
        </div>

        {/* Group tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
          <button
            onClick={() => setActive("all")}
            className={`shrink-0 px-3 h-8 rounded-full text-xs font-semibold border transition ${
              active === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            All <span className="ml-1 opacity-70 tabular-nums">{list.length}</span>
          </button>
          {GROUPS.map(({ key, label, Icon }) => {
            const count = grouped.get(key)?.length ?? 0;
            if (count === 0) return null;
            const isActive = active === key;
            return (
              <button
                key={key}
                onClick={() => setActive(key)}
                className={`shrink-0 px-3 h-8 rounded-full text-xs font-semibold border flex items-center gap-1.5 transition ${
                  isActive ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={12} />
                {label}
                <span className="opacity-70 tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          {visible.map((n) => {
            const g = classify(n);
            const Icon = GROUPS.find((x) => x.key === g)?.Icon ?? Bell;
            const target = targetFor(n);
            return (
              <div
                key={n.id}
                className={`royal-card p-3 flex items-start gap-2 transition hover:border-primary/40 ${
                  !n.read ? "bg-primary/5 border-primary/30" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleOpen(n)}
                  className="flex-1 flex items-start gap-3 text-left min-w-0"
                >
                  <div className="relative shrink-0">
                    <Icon size={18} className="text-primary mt-0.5" />
                    {!n.read && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-destructive animate-pulse" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">{n.title}</p>
                    {n.body && <p className="text-xs text-muted-foreground break-words">{n.body}</p>}
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</p>
                      {target && <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Open →</span>}
                    </div>
                  </div>
                </button>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => (n.read ? markUnread(n.id) : markRead(n.id))}
                    className="size-7 rounded-full hover:bg-muted/60 flex items-center justify-center text-muted-foreground"
                    aria-label={n.read ? "Mark unread" : "Mark read"}
                    title={n.read ? "Mark unread" : "Mark read"}
                  >
                    {n.read ? <Mail size={14} /> : <MailOpen size={14} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeOne(n.id)}
                    className="size-7 rounded-full hover:bg-destructive/15 flex items-center justify-center text-muted-foreground hover:text-destructive"
                    aria-label="Delete notification"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
          {!visible.length && <p className="text-center text-sm text-muted-foreground py-10">No notifications in this group.</p>}
        </div>
      </div>
    </AppShell>
  );
}
