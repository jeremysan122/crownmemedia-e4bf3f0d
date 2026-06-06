import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, EmptyState, PillBadge } from "@/components/admin/cc/CommandCenterUI";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { removePost, removeComment, resolveQueueItem } from "@/lib/admin";
import { toast } from "sonner";

const RATINGS = ["safe", "suggestive", "mature", "explicit"] as const;
const STATUSES = ["pending", "approved", "flagged", "removed"] as const;

type BulkKind = "approve" | "flag" | "unflag" | "remove";
const BULK_DEFS: Record<BulkKind, { label: string; patch: Record<string, any>; destructive?: boolean; verb: string; description: string }> = {
  approve: { label: "Approve", verb: "approve", patch: { moderation_status: "approved" }, description: "Posts will be marked approved and visible to all viewers per their content filter." },
  flag:    { label: "Flag",    verb: "flag",    patch: { moderation_status: "flagged"  }, description: "Posts will be marked flagged and hidden from non-moderator viewers." },
  unflag:  { label: "Unflag",  verb: "unflag",  patch: { moderation_status: "approved", is_sensitive: false }, description: "Posts will be approved and the sensitive flag cleared." },
  remove:  { label: "Remove",  verb: "remove",  patch: { moderation_status: "removed" }, destructive: true, description: "Posts will be removed from the feed. This is destructive and visible in the audit log." },
};
type Post = {
  id: string;
  user_id: string;
  caption: string | null;
  is_sensitive: boolean;
  sensitive_reason: string | null;
  content_rating: string;
  moderation_status: string;
  created_at: string;
};
type AuditRow = {
  id: string;
  actor_id: string;
  action: string;
  target_id: string | null;
  details: any;
  created_at: string;
};

export default function CommandCenterContent() {
  const [queue, setQueue] = useState<any[]>([]);
  const [takedowns, setTakedowns] = useState<any[]>([]);
  const [sensitive, setSensitive] = useState<Post[]>([]);
  const [reviewQueue, setReviewQueue] = useState<Post[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, AuditRow[]>>({});
  const [confirmKind, setConfirmKind] = useState<BulkKind | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ kind: BulkKind; done: number; total: number } | null>(null);
  const [recentlyChanged, setRecentlyChanged] = useState<Map<string, number>>(new Map());
  const expandedRef = useRef<string | null>(null);
  expandedRef.current = expanded;

  const load = async () => {
    const sb = supabase as any;
    const [q, t, s, r] = await Promise.all([
      supabase
        .from("moderation_queue")
        .select("*")
        .eq("status", "pending")
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("content_takedowns")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30),
      sb
        .from("posts")
        .select("id,user_id,caption,is_sensitive,sensitive_reason,content_rating,moderation_status,created_at")
        .or("is_sensitive.eq.true,moderation_status.neq.approved,content_rating.neq.safe")
        .eq("is_removed", false)
        .order("created_at", { ascending: false })
        .limit(60),
      sb
        .from("posts")
        .select("id,user_id,caption,is_sensitive,sensitive_reason,content_rating,moderation_status,created_at")
        .or("moderation_status.eq.flagged,moderation_status.eq.pending,content_rating.eq.explicit")
        .eq("is_removed", false)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);
    setQueue(q.data ?? []);
    setTakedowns(t.data ?? []);
    setSensitive((s.data ?? []) as Post[]);
    setReviewQueue((r.data ?? []) as Post[]);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("cc-content")
      .on("postgres_changes", { event: "*", schema: "public", table: "moderation_queue" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "content_takedowns" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, (payload: any) => {
        const id = (payload?.new ?? payload?.old)?.id;
        if (id) {
          setRecentlyChanged((m) => { const n = new Map(m); n.set(id, Date.now()); return n; });
        }
        load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_audit_log" }, () => {
        if (expandedRef.current) loadHistory(expandedRef.current);
      })
      .subscribe();
    const tick = window.setInterval(() => {
      setRecentlyChanged((m) => {
        const cutoff = Date.now() - 10_000;
        let changed = false;
        const n = new Map(m);
        for (const [k, t] of n) if (t < cutoff) { n.delete(k); changed = true; }
        return changed ? n : m;
      });
    }, 2000);
    return () => { supabase.removeChannel(ch); window.clearInterval(tick); };
     
  }, []);

  const loadHistory = async (postId: string) => {
    const { data } = await supabase
      .from("admin_audit_log")
      .select("id,actor_id,action,target_id,details,created_at")
      .eq("target_type", "post")
      .eq("target_id", postId)
      .order("created_at", { ascending: false })
      .limit(30);
    setHistory((h) => ({ ...h, [postId]: (data ?? []) as AuditRow[] }));
  };

  const toggleExpand = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!history[id]) await loadHistory(id);
  };

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
    if (error) { toast.error(error.message); return false; }
    return true;
  };

  const bulk = async (patch: Record<string, any>, label: string) => {
    if (selected.size === 0) { toast.message("Select posts first"); return; }
    const ids = Array.from(selected);
    const { error } = await (supabase as any).from("posts").update(patch).in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`${label} (${ids.length})`);
    setSelected(new Set());
    load();
  };

  const requestBulk = (kind: BulkKind) => {
    if (selected.size === 0) { toast.message("Select posts first"); return; }
    setConfirmKind(kind);
  };

  const runBulk = async (kind: BulkKind) => {
    const def = BULK_DEFS[kind];
    const ids = Array.from(selected);
    const CHUNK = 25;
    setBulkProgress({ kind, done: 0, total: ids.length });
    let failed = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { error } = await (supabase as any).from("posts").update(def.patch).in("id", slice);
      if (error) { failed += slice.length; }
      setBulkProgress({ kind, done: Math.min(i + slice.length, ids.length), total: ids.length });
    }
    setBulkProgress(null);
    setConfirmKind(null);
    if (failed > 0) toast.error(`${def.label} failed for ${failed} of ${ids.length}`);
    else toast.success(`${def.label} · ${ids.length} post${ids.length === 1 ? "" : "s"}`);
    setSelected(new Set());
    load();
  };

  const toggleSel = (id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const renderPostRow = (p: Post, withCheckbox = false) => (
    <li key={p.id} className="py-2 space-y-1.5">
      <div className="flex items-start gap-2 flex-wrap">
        {withCheckbox ? (
          <input
            type="checkbox"
            className="mt-1 accent-primary"
            checked={selected.has(p.id)}
            onChange={() => toggleSel(p.id)}
          />
        ) : null}
        {recentlyChanged.has(p.id) ? <PillBadge tone="good">NEW</PillBadge> : null}
        {p.is_sensitive ? <PillBadge tone="warn">sensitive</PillBadge> : null}
        <PillBadge tone={p.content_rating === "explicit" ? "bad" : p.content_rating === "mature" ? "warn" : "default"}>
          {p.content_rating}
        </PillBadge>
        <PillBadge tone={p.moderation_status === "removed" ? "bad" : p.moderation_status === "flagged" || p.moderation_status === "pending" ? "warn" : "good"}>
          {p.moderation_status}
        </PillBadge>
        <span className="text-[10px] text-muted-foreground font-mono truncate flex-1">{p.id.slice(0, 12)}…</span>
        <button
          type="button"
          onClick={() => toggleExpand(p.id)}
          className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
        >
          {expanded === p.id ? "Hide history" : "History"}
        </button>
      </div>
      {p.caption ? <div className="text-xs line-clamp-2">{p.caption}</div> : null}
      {p.sensitive_reason ? <div className="text-[10px] text-muted-foreground">Reason: {p.sensitive_reason}</div> : null}
      <div className="flex gap-1.5 flex-wrap">
        <select
          className="h-7 rounded border border-border/60 bg-card/60 text-[10px] px-1"
          value={p.content_rating}
          onChange={async (e) => { if (await updatePost(p.id, { content_rating: e.target.value })) load(); }}
        >
          {RATINGS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select
          className="h-7 rounded border border-border/60 bg-card/60 text-[10px] px-1"
          value={p.moderation_status}
          onChange={async (e) => { if (await updatePost(p.id, { moderation_status: e.target.value })) load(); }}
        >
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Button
          size="sm" variant="outline" className="h-7 text-[10px]"
          onClick={async () => { if (await updatePost(p.id, { moderation_status: "approved" })) { toast.success("Approved"); load(); } }}
        >Approve</Button>
        <Button
          size="sm" variant="destructive" className="h-7 text-[10px]"
          onClick={async () => { if (await updatePost(p.id, { moderation_status: "removed" })) { toast.success("Removed"); load(); } }}
        >Remove</Button>
        <Button
          size="sm" variant="outline" className="h-7 text-[10px]"
          onClick={async () => { if (await updatePost(p.id, { is_sensitive: !p.is_sensitive })) load(); }}
        >{p.is_sensitive ? "Unmark sensitive" : "Mark sensitive"}</Button>
      </div>
      {expanded === p.id ? (
        <div className="mt-1 rounded border border-border/40 bg-card/40 p-2 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Audit timeline</div>
          {(history[p.id] ?? []).length === 0 ? (
            <div className="text-[10px] text-muted-foreground">No moderation history yet.</div>
          ) : (
            <ul className="space-y-1">
              {(history[p.id] ?? []).map((h) => (
                <li key={h.id} className="text-[10px] font-mono">
                  <span className="text-muted-foreground">{new Date(h.created_at).toLocaleString()}</span>{" "}
                  <span>· actor {h.actor_id.slice(0, 8)} ·</span>{" "}
                  {Object.entries(h.details?.changes ?? {}).map(([field, v]: [string, any]) => (
                    <span key={field} className="mr-2">
                      {field}: <span className="text-rose-400">{String(v?.old)}</span> →{" "}
                      <span className="text-emerald-400">{String(v?.new)}</span>
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  );

  const allReviewSelected = useMemo(
    () => reviewQueue.length > 0 && reviewQueue.every((p) => selected.has(p.id)),
    [reviewQueue, selected],
  );

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

      <SectionCard
        title={`Review Queue · Flagged / Explicit (${reviewQueue.length})`}
        action={
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <input
              type="checkbox"
              checked={allReviewSelected}
              onChange={(e) => {
                setSelected((s) => {
                  const n = new Set(s);
                  if (e.target.checked) reviewQueue.forEach((p) => n.add(p.id));
                  else reviewQueue.forEach((p) => n.delete(p.id));
                  return n;
                });
              }}
            />
            select all
          </label>
        }
      >
        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-border/40">
            <span className="text-[10px] text-muted-foreground self-center">{selected.size} selected:</span>
            <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={!!bulkProgress} onClick={() => requestBulk("approve")}>Approve</Button>
            <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={!!bulkProgress} onClick={() => requestBulk("flag")}>Flag</Button>
            <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={!!bulkProgress} onClick={() => requestBulk("unflag")}>Unflag</Button>
            <Button size="sm" variant="destructive" className="h-7 text-[10px]" disabled={!!bulkProgress} onClick={() => requestBulk("remove")}>Remove</Button>
            <Button size="sm" variant="ghost" className="h-7 text-[10px]" disabled={!!bulkProgress} onClick={() => setSelected(new Set())}>Clear</Button>
            {bulkProgress ? (
              <div className="flex items-center gap-2 ml-auto text-[10px] text-muted-foreground">
                <span>{BULK_DEFS[bulkProgress.kind].label}… {bulkProgress.done}/{bulkProgress.total}</span>
                <div className="w-24 h-1.5 rounded bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.round((bulkProgress.done / Math.max(1, bulkProgress.total)) * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {reviewQueue.length === 0 ? <EmptyState message="No posts need review." /> : (
          <ul className="divide-y divide-border/40">{reviewQueue.map((p) => renderPostRow(p, true))}</ul>
        )}
      </SectionCard>

      <SectionCard title={`Sensitive / Non-approved Posts (${sensitive.length})`}>
        {sensitive.length === 0 ? <EmptyState message="No sensitive or flagged posts." /> : (
          <ul className="divide-y divide-border/40">{sensitive.map((p) => renderPostRow(p, false))}</ul>
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

      <AlertDialog open={!!confirmKind} onOpenChange={(o) => { if (!o && !bulkProgress) setConfirmKind(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmKind ? `${BULK_DEFS[confirmKind].label} ${selected.size} post${selected.size === 1 ? "" : "s"}?` : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmKind ? BULK_DEFS[confirmKind].description : ""}
              {confirmKind === "remove" ? " This cannot be self-served by users — only mods can reverse it." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {bulkProgress ? (
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">Processing {bulkProgress.done}/{bulkProgress.total}…</div>
              <div className="w-full h-1.5 rounded bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all"
                     style={{ width: `${Math.round((bulkProgress.done / Math.max(1, bulkProgress.total)) * 100)}%` }} />
              </div>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!bulkProgress}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!bulkProgress}
              className={confirmKind && BULK_DEFS[confirmKind].destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              onClick={(e) => { e.preventDefault(); if (confirmKind) runBulk(confirmKind); }}
            >
              {confirmKind ? (bulkProgress ? "Working…" : `Confirm ${BULK_DEFS[confirmKind].verb}`) : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
