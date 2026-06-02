import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, EmptyState, PillBadge } from "@/components/admin/cc/CommandCenterUI";
import { Button } from "@/components/ui/button";
import { removePost, removeComment, resolveQueueItem } from "@/lib/admin";
import { toast } from "sonner";

const RATINGS = ["safe", "suggestive", "mature", "explicit"] as const;
const STATUSES = ["pending", "approved", "flagged", "removed"] as const;

export default function CommandCenterContent() {
  const [queue, setQueue] = useState<any[]>([]);
  const [takedowns, setTakedowns] = useState<any[]>([]);
  const [sensitive, setSensitive] = useState<any[]>([]);

  const load = async () => {
    const [q, t, s] = await Promise.all([
      supabase.from("moderation_queue").select("*").eq("status","pending").order("priority", { ascending: false }).order("created_at", { ascending: false }).limit(50),
      supabase.from("content_takedowns").select("*").order("created_at", { ascending: false }).limit(30),
      supabase
        .from("posts")
        .select("id,user_id,caption,is_sensitive,sensitive_reason,content_rating,moderation_status,created_at")
        .or("is_sensitive.eq.true,moderation_status.neq.approved,content_rating.neq.safe")
        .eq("is_removed", false)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);
    setQueue(q.data ?? []);
    setTakedowns(t.data ?? []);
    setSensitive(s.data ?? []);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("cc-content")
      .on("postgres_changes", { event: "*", schema: "public", table: "moderation_queue" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "content_takedowns" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const act = async (item: any, action: "remove" | "dismiss") => {
    try {
      if (action === "remove") {
        if (item.target_type === "post") await removePost(item.target_id, item.reason || "moderation queue");
        else if (item.target_type === "comment") await removeComment(item.target_id, item.reason || "moderation queue");
      }
      await resolveQueueItem(item.id, action === "remove" ? "resolved" : "dismissed");
      toast.success(action === "remove" ? "Removed" : "Dismissed");
      load();
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  };

  const updatePost = async (id: string, patch: Record<string, any>) => {
    const { error } = await (supabase as any).from("posts").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Updated");
    load();
  };

  return (
    <div className="space-y-3">
      <SectionCard title={`Moderation Queue (${queue.length})`}>
        {queue.length === 0 ? <EmptyState message="Queue empty." /> : (
          <ul className="divide-y divide-border/40">
            {queue.map((q) => (
              <li key={q.id} className="py-2 space-y-1">
                <div className="flex items-center gap-2">
                  <PillBadge tone={q.priority === "urgent" ? "bad" : q.priority === "high" ? "warn" : "default"}>{q.priority}</PillBadge>
                  <PillBadge>{q.target_type}</PillBadge>
                  <span className="text-[10px] text-muted-foreground font-mono truncate flex-1">{q.target_id.slice(0, 12)}…</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(q.created_at).toLocaleString()}</span>
                </div>
                <div className="text-xs">{q.reason}</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" className="h-7 text-[10px]" onClick={() => act(q, "remove")}>Remove</Button>
                  <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => act(q, "dismiss")}>Dismiss</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Recent Takedowns">
        {takedowns.length === 0 ? <EmptyState message="No takedowns recorded." /> : (
          <ul className="divide-y divide-border/40 text-xs">
            {takedowns.map((t) => (
              <li key={t.id} className="py-1.5 flex items-center gap-2">
                <PillBadge>{t.target_type}</PillBadge>
                <span className="flex-1 truncate">{t.reason}</span>
                {t.reversed_at ? <PillBadge tone="warn">reversed</PillBadge> : <PillBadge tone="bad">active</PillBadge>}
                <span className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={`Sensitive / Flagged Posts (${sensitive.length})`}>
        {sensitive.length === 0 ? <EmptyState message="No sensitive or flagged posts." /> : (
          <ul className="divide-y divide-border/40">
            {sensitive.map((p) => (
              <li key={p.id} className="py-2 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {p.is_sensitive ? <PillBadge tone="warn">sensitive</PillBadge> : null}
                  <PillBadge tone={p.content_rating === "explicit" ? "bad" : p.content_rating === "mature" ? "warn" : "default"}>{p.content_rating}</PillBadge>
                  <PillBadge tone={p.moderation_status === "removed" ? "bad" : p.moderation_status === "flagged" ? "warn" : p.moderation_status === "pending" ? "warn" : "good"}>{p.moderation_status}</PillBadge>
                  <span className="text-[10px] text-muted-foreground font-mono truncate flex-1">{p.id.slice(0, 12)}…</span>
                </div>
                {p.caption ? <div className="text-xs line-clamp-2">{p.caption}</div> : null}
                {p.sensitive_reason ? <div className="text-[10px] text-muted-foreground">Reason: {p.sensitive_reason}</div> : null}
                <div className="flex gap-1.5 flex-wrap">
                  <select
                    className="h-7 rounded border border-border/60 bg-card/60 text-[10px] px-1"
                    value={p.content_rating}
                    onChange={(e) => updatePost(p.id, { content_rating: e.target.value })}
                  >
                    {RATINGS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <select
                    className="h-7 rounded border border-border/60 bg-card/60 text-[10px] px-1"
                    value={p.moderation_status}
                    onChange={(e) => updatePost(p.id, { moderation_status: e.target.value })}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => updatePost(p.id, { is_sensitive: !p.is_sensitive })}>
                    {p.is_sensitive ? "Unmark sensitive" : "Mark sensitive"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
