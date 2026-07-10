import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, EmptyState, PillBadge, StatTile } from "@/components/admin/cc/CommandCenterUI";
import { ConnectionStatus } from "@/components/admin/cc/ConnectionStatus";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { resolveReport, dismissReport, escalateReport, removePost, removeComment, suspendUser, banUser } from "@/lib/admin";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useRealtimeStatus } from "@/hooks/useRealtimeStatus";
import { ModerationReasonDialog } from "@/components/admin/ModerationReasonDialog";
import { toast } from "sonner";

type ReportRow = {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  post_id: string | null;
  comment_id: string | null;
  reason: string;
  reason_code: string | null;
  status: "open" | "resolved" | "dismissed" | "escalated" | string;
  created_at: string;
  resolution: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
};

type ProfileLite = { id: string; username: string | null; profile_photo_url: string | null; is_suspended?: boolean | null; is_banned?: boolean | null };
type PostLite = { id: string; caption: string | null; image_url: string | null; category: string | null; is_removed: boolean | null; created_at: string };
type CommentLite = { id: string; body: string; is_removed: boolean | null; created_at: string };
type AuditLite = { id: string; action: string; actor_email: string | null; created_at: string; details: any };

export default function CommandCenterReports() {
  const [filter, setFilter] = useState<"open" | "resolved" | "dismissed" | "escalated" | "all">("open");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [counts, setCounts] = useState({ open: 0, resolved: 0, dismissed: 0, escalated: 0 });
  const [selected, setSelected] = useState<ReportRow | null>(null);
  const [reporter, setReporter] = useState<ProfileLite | null>(null);
  const [reported, setReported] = useState<ProfileLite | null>(null);
  const [post, setPost] = useState<PostLite | null>(null);
  const [comment, setComment] = useState<CommentLite | null>(null);
  const [history, setHistory] = useState<AuditLite[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  type PendingAction =
    | { kind: "resolve"; report: ReportRow }
    | { kind: "dismiss"; report: ReportRow }
    | { kind: "escalate"; report: ReportRow }
    | { kind: "remove"; report: ReportRow }
    | { kind: "suspend"; report: ReportRow }
    | { kind: "ban"; report: ReportRow };
  const [pending, setPending] = useState<PendingAction | null>(null);

  const roles = useAdminRoles();

  const load = async () => {
    let q = supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(80);
    if (filter !== "all") q = q.eq("status", filter);
    const [{ data }, openC, resC, disC, escC] = await Promise.all([
      q,
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "resolved"),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "dismissed"),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "escalated"),
    ]);
    setRows((data ?? []) as ReportRow[]);
    setCounts({
      open: openC.count ?? 0,
      resolved: resC.count ?? 0,
      dismissed: disC.count ?? 0,
      escalated: escC.count ?? 0,
    });
  };

  useEffect(() => { load();   }, [filter]);

  // Surgical realtime merging — no full reload, no duplicates
  const rt = useRealtimeStatus("cc-reports", (ch) =>
    ch
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reports" }, (p: any) => {
        const r = p.new as ReportRow;
        if (filter !== "all" && r.status !== filter) return;
        setRows(prev => prev.find(x => x.id === r.id) ? prev : [r, ...prev].slice(0, 80));
        setCounts(c => ({ ...c, [r.status]: (c as any)[r.status] != null ? (c as any)[r.status] + 1 : (c as any)[r.status] }));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "reports" }, (p: any) => {
        const r = p.new as ReportRow;
        setRows(prev => {
          const exists = prev.find(x => x.id === r.id);
          if (filter !== "all" && r.status !== filter) return prev.filter(x => x.id !== r.id);
          if (!exists) return [r, ...prev].slice(0, 80);
          return prev.map(x => x.id === r.id ? { ...x, ...r } : x);
        });
        load(); // refresh counts
      })
  , [filter]);

  const openDrawer = async (r: ReportRow) => {
    setSelected(r);
    setDetailLoading(true);
    setReporter(null); setReported(null); setPost(null); setComment(null); setHistory([]);
    const tasks: Promise<any>[] = [];
    tasks.push(Promise.resolve(supabase.from("profiles").select("id, username, profile_photo_url, is_suspended, is_banned").eq("id", r.reporter_id).maybeSingle()).then(({ data }) => setReporter(data as any)));
    if (r.reported_user_id) tasks.push(Promise.resolve(supabase.from("profiles").select("id, username, profile_photo_url, is_suspended, is_banned").eq("id", r.reported_user_id).maybeSingle()).then(({ data }) => setReported(data as any)));
    if (r.post_id) tasks.push(Promise.resolve(supabase.from("posts").select("id, caption, image_url, category, is_removed, created_at").eq("id", r.post_id).maybeSingle()).then(({ data }) => setPost(data as any)));
    if (r.comment_id) tasks.push(Promise.resolve(supabase.from("comments").select("id, body, is_removed, created_at").eq("id", r.comment_id).maybeSingle()).then(({ data }) => setComment(data as any)));
    tasks.push(
      Promise.resolve(supabase.from("admin_audit_log").select("id, action, actor_email, created_at, details").eq("target_id", r.id).order("created_at", { ascending: false }).limit(20))
        .then(({ data }) => setHistory((data ?? []) as AuditLite[]))
    );
    await Promise.all(tasks);
    setDetailLoading(false);
  };

  const onResolve = (r: ReportRow) => {
    if (!roles.canResolveReports) { toast.error("Not authorized"); return; }
    setPending({ kind: "resolve", report: r });
  };
  const onDismiss = (r: ReportRow) => {
    if (!roles.canDismissReports) { toast.error("Not authorized"); return; }
    setPending({ kind: "dismiss", report: r });
  };
  const onRemoveContent = (r: ReportRow) => {
    if (!roles.canResolveReports) { toast.error("Not authorized"); return; }
    if (!r.post_id && !r.comment_id) { toast.error("No content target"); return; }
    setPending({ kind: "remove", report: r });
  };
  const onSuspendUser = (r: ReportRow) => {
    if (!roles.canSuspend) { toast.error("Not authorized"); return; }
    if (!r.reported_user_id) { toast.error("No user target"); return; }
    setPending({ kind: "suspend", report: r });
  };
  const onBanUser = (r: ReportRow) => {
    if (!roles.canBan) { toast.error("Not authorized"); return; }
    if (!r.reported_user_id) { toast.error("No user target"); return; }
    setPending({ kind: "ban", report: r });
  };

  const runPending = async (reason: string) => {
    if (!pending) return;
    const r = pending.report;
    try {
      if (pending.kind === "resolve") {
        await resolveReport(r.id, reason);
        toast.success("Report resolved");
      } else if (pending.kind === "dismiss") {
        await dismissReport(r.id, reason);
        toast.success("Report dismissed");
      } else if (pending.kind === "remove") {
        if (r.post_id) await removePost(r.post_id, reason);
        else if (r.comment_id) await removeComment(r.comment_id, reason);
        await resolveReport(r.id, `Content removed: ${reason}`);
        toast.success("Content removed & report resolved");
      } else if (pending.kind === "suspend") {
        await suspendUser(r.reported_user_id!, reason);
        await resolveReport(r.id, `User suspended: ${reason}`);
        toast.success("User suspended & report resolved");
      } else if (pending.kind === "ban") {
        await banUser(r.reported_user_id!, reason);
        await resolveReport(r.id, `User banned: ${reason}`);
        toast.success("User banned & report resolved");
      } else if (pending.kind === "escalate") {
        await escalateReport(r.id, reason);
        toast.success("Report escalated for senior review");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
      throw e; // keep dialog open on failure
    }
  };

  const onEscalate = (r: ReportRow) => {
    if (!roles.canResolveReports) { toast.error("Not authorized"); return; }
    setPending({ kind: "escalate", report: r });
  };

  const pendingCopy: Record<PendingAction["kind"], { title: string; desc: string; confirm: string; destructive: boolean; defaultReason: string }> = {
    resolve: { title: "Resolve report", desc: "Mark this report as resolved with a note visible in the audit log.", confirm: "Resolve", destructive: false, defaultReason: "Reviewed; no action needed." },
    dismiss: { title: "Dismiss report", desc: "Dismiss without further action. Reason recorded in the audit log.", confirm: "Dismiss", destructive: false, defaultReason: "Not a violation." },
    escalate: { title: "Escalate report", desc: "Promote this report for senior review. Its status becomes “escalated” and the audit log records who escalated it.", confirm: "Escalate", destructive: false, defaultReason: pending?.report.reason || "Needs senior review." },
    remove: { title: "Remove content", desc: "Remove the reported content and resolve the report.", confirm: "Remove content", destructive: true, defaultReason: pending?.report.reason || "" },
    suspend: { title: "Suspend user", desc: "Temporarily suspend the reported user and resolve the report.", confirm: "Suspend user", destructive: true, defaultReason: pending?.report.reason || "" },
    ban: { title: "Ban user (permanent)", desc: "Permanently ban the reported user. This writes to the admin audit log.", confirm: "Ban user", destructive: true, defaultReason: pending?.report.reason || "" },
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <ConnectionStatus status={rt.status} retryIn={rt.retryIn} label="reports" />
      </div>
      <div className="grid grid-cols-4 gap-2">
        <StatTile label="Open" value={counts.open} tone={counts.open > 0 ? "warn" : "good"} />
        <StatTile label="Escalated" value={counts.escalated} tone={counts.escalated > 0 ? "warn" : "default"} />
        <StatTile label="Resolved" value={counts.resolved} tone="good" />
        <StatTile label="Dismissed" value={counts.dismissed} />
      </div>

      <SectionCard
        title={`Reports (${rows.length})`}
        action={
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            aria-label="Filter reports by status"
            data-testid="cc-reports-filter"
            className="h-7 rounded border border-border/60 bg-background px-2 text-[11px]"
          >
            <option value="open">Open</option>
            <option value="escalated">Escalated</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
            <option value="all">All</option>
          </select>
        }
      >
        {rows.length === 0 ? <EmptyState message="No reports in this view." /> : (
          <ul className="divide-y divide-border/40">
            {rows.map((r) => (
              <li key={r.id} className="py-2 space-y-1.5">
                <button onClick={() => openDrawer(r)} className="w-full text-left" data-testid="cc-report-row" data-report-status={r.status}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <PillBadge tone={r.status === "open" ? "warn" : r.status === "resolved" ? "good" : r.status === "escalated" ? "bad" : "default"}>{r.status}</PillBadge>
                    {r.reason_code ? <PillBadge>{r.reason_code}</PillBadge> : null}
                    {r.post_id ? <PillBadge>post</PillBadge> : null}
                    {r.comment_id ? <PillBadge>comment</PillBadge> : null}
                    {r.reported_user_id ? <PillBadge>user</PillBadge> : null}
                    <span className="text-[10px] text-muted-foreground ml-auto">{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-xs mt-1 line-clamp-2">{r.reason}</p>
                </button>
                {(r.status === "open" || r.status === "escalated") ? (
                  <div className="flex flex-wrap gap-2" data-testid="cc-report-actions">
                    {(r.post_id || r.comment_id) && roles.canResolveReports && (
                      <Button size="sm" variant="destructive" className="h-7 text-[10px]" onClick={() => onRemoveContent(r)}>Remove content</Button>
                    )}
                    {r.reported_user_id && roles.canSuspend && (
                      <Button size="sm" variant="destructive" className="h-7 text-[10px]" onClick={() => onSuspendUser(r)}>Suspend user</Button>
                    )}
                    {r.reported_user_id && roles.canBan && (
                      <Button size="sm" variant="destructive" className="h-7 text-[10px]" onClick={() => onBanUser(r)}>Ban user</Button>
                    )}
                    {roles.canResolveReports && <Button size="sm" className="h-7 text-[10px]" data-testid="cc-report-resolve" onClick={() => onResolve(r)}>Resolve</Button>}
                    {r.status === "open" && roles.canResolveReports && (
                      <Button size="sm" variant="secondary" className="h-7 text-[10px]" data-testid="cc-report-escalate" onClick={() => onEscalate(r)}>Escalate</Button>
                    )}
                    {roles.canDismissReports && <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => onDismiss(r)}>Dismiss</Button>}
                    <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => openDrawer(r)}>Details</Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Details drawer */}
      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <PillBadge tone={selected.status === "open" ? "warn" : selected.status === "resolved" ? "good" : "default"}>{selected.status}</PillBadge>
                  Report details
                </SheetTitle>
                <SheetDescription className="text-[11px]">
                  Filed {new Date(selected.created_at).toLocaleString()} · {selected.reason_code ?? "no code"}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4 text-xs">
                <section className="space-y-1">
                  <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground">Reason</h3>
                  <p className="rounded bg-muted/30 p-2 whitespace-pre-wrap">{selected.reason}</p>
                </section>

                <section className="space-y-1">
                  <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground">Submitted by</h3>
                  {reporter ? (
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-muted overflow-hidden">
                        {reporter.profile_photo_url ? <img loading="lazy" src={reporter.profile_photo_url} alt="" className="h-full w-full object-cover" /> : null}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">@{reporter.username ?? reporter.id.slice(0,8)}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{reporter.id}</div>
                      </div>
                    </div>
                  ) : <p className="text-muted-foreground">{detailLoading ? "Loading…" : "Unknown reporter"}</p>}
                </section>

                {selected.reported_user_id ? (
                  <section className="space-y-1">
                    <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground">Reported user</h3>
                    {reported ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="h-7 w-7 rounded-full bg-muted overflow-hidden">
                          {reported.profile_photo_url ? <img loading="lazy" src={reported.profile_photo_url} alt="" className="h-full w-full object-cover" /> : null}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium flex items-center gap-1.5">
                            @{reported.username ?? reported.id.slice(0,8)}
                            {reported.is_banned ? <PillBadge tone="bad">banned</PillBadge> : reported.is_suspended ? <PillBadge tone="warn">suspended</PillBadge> : null}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">{reported.id}</div>
                        </div>
                      </div>
                    ) : <p className="text-muted-foreground">{detailLoading ? "Loading…" : "Unknown"}</p>}
                  </section>
                ) : null}

                {post ? (
                  <section className="space-y-1">
                    <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground">Reported post {post.is_removed ? <PillBadge tone="bad">removed</PillBadge> : null}</h3>
                    <div className="rounded border border-border/60 p-2 space-y-1">
                      {post.image_url ? <img loading="lazy" src={post.image_url} alt="" className="h-32 w-full object-cover rounded" /> : null}
                      <div className="text-[11px]">{post.caption ?? <span className="italic text-muted-foreground">No caption</span>}</div>
                      <div className="text-[10px] text-muted-foreground">{post.category} · {new Date(post.created_at).toLocaleString()}</div>
                    </div>
                  </section>
                ) : null}

                {comment ? (
                  <section className="space-y-1">
                    <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground">Reported comment {comment.is_removed ? <PillBadge tone="bad">removed</PillBadge> : null}</h3>
                    <div className="rounded border border-border/60 p-2">
                      <p className="text-[11px] whitespace-pre-wrap">{comment.body}</p>
                      <div className="text-[10px] text-muted-foreground mt-1">{new Date(comment.created_at).toLocaleString()}</div>
                    </div>
                  </section>
                ) : null}

                {selected.resolution ? (
                  <section className="space-y-1">
                    <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground">Resolution</h3>
                    <p className="rounded bg-muted/30 p-2 italic">{selected.resolution}</p>
                    {selected.resolved_at ? <p className="text-[10px] text-muted-foreground">Resolved {new Date(selected.resolved_at).toLocaleString()}</p> : null}
                  </section>
                ) : null}

                <section className="space-y-1">
                  <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground">Action history ({history.length})</h3>
                  {history.length === 0 ? <p className="text-muted-foreground">No prior actions on this report.</p> : (
                    <ul className="divide-y divide-border/40">
                      {history.map(h => (
                        <li key={h.id} className="py-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px]">{h.action}</span>
                            <span className="text-[10px] text-muted-foreground ml-auto">{new Date(h.created_at).toLocaleString()}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground">{h.actor_email ?? "system"}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {selected.status === "open" ? (
                  <section className="sticky bottom-0 -mx-6 px-6 py-3 bg-background/95 backdrop-blur border-t border-border/60 flex flex-wrap gap-2">
                    {roles.canResolveReports && (
                      <Button size="sm" className="flex-1 min-w-[100px]" onClick={() => onResolve(selected)}>Resolve</Button>
                    )}
                    {roles.canDismissReports && (
                      <Button size="sm" variant="outline" className="flex-1 min-w-[100px]" onClick={() => onDismiss(selected)}>Dismiss</Button>
                    )}
                    {(selected.post_id || selected.comment_id) && roles.canResolveReports && (
                      <Button size="sm" variant="destructive" className="flex-1 min-w-[100px]" onClick={() => onRemoveContent(selected)}>Remove content</Button>
                    )}
                    {selected.reported_user_id && roles.canSuspend && (
                      <Button size="sm" variant="destructive" className="flex-1 min-w-[100px]" onClick={() => onSuspendUser(selected)}>Suspend user</Button>
                    )}
                    {selected.reported_user_id && roles.canBan && (
                      <Button size="sm" variant="destructive" className="flex-1 min-w-[100px]" onClick={() => onBanUser(selected)}>Ban user</Button>
                    )}
                    {!roles.canResolveReports && !roles.canDismissReports && (
                      <p className="text-[10px] text-muted-foreground w-full text-center">You don't have permission to act on reports.</p>
                    )}
                  </section>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {pending && (
        <ModerationReasonDialog
          open={!!pending}
          onOpenChange={(o) => { if (!o) setPending(null); }}
          title={pendingCopy[pending.kind].title}
          description={pendingCopy[pending.kind].desc}
          confirmLabel={pendingCopy[pending.kind].confirm}
          destructive={pendingCopy[pending.kind].destructive}
          defaultReason={pendingCopy[pending.kind].defaultReason}
          onConfirm={runPending}
        />
      )}
    </div>
  );
}
