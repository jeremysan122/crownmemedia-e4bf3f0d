import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Navigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { timeAgo } from "@/lib/crown";
import { banUser } from "@/lib/admin";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { ModerationReasonDialog } from "@/components/admin/ModerationReasonDialog";
import { Ban, Flag, Shield, RefreshCw, Gavel, Paperclip, ExternalLink, Loader2 } from "lucide-react";

interface BlockRow {
  id: string;
  created_at: string;
  blocker_id: string;
  blocked_id: string;
  blocker?: { username: string } | null;
  blocked?: { username: string } | null;
}
interface ReportRow {
  id: string;
  created_at: string;
  reason: string;
  reason_code: string | null;
  status: string;
  post_id: string | null;
  comment_id: string | null;
  reporter_id: string;
  mod_notes: string | null;
  evidence_paths: string[] | null;
  reporter?: { username: string } | null;
}
interface AppealRow {
  id: string;
  created_at: string;
  status: string;
  body: string;
  mod_notes: string | null;
  user_id: string;
  report_id: string;
  evidence_paths: string[] | null;
  user?: { username: string } | null;
}

type TabKey = "reports" | "appeals" | "blocks";

const REPORT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "action_taken", label: "Action taken" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
  { value: "denied", label: "Denied" },
];

const APPEAL_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "approved", label: "Approve appeal" },
  { value: "denied", label: "Deny appeal" },
];

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: "bg-secondary text-foreground",
    pending: "bg-secondary text-foreground",
    resolved: "bg-emerald-500/15 text-emerald-400",
    action_taken: "bg-emerald-500/20 text-emerald-300",
    approved: "bg-emerald-500/20 text-emerald-300",
    dismissed: "bg-muted text-muted-foreground",
    denied: "bg-destructive/15 text-destructive",
  };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${map[status] ?? "bg-muted"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

type EvidenceItem = { path: string; url: string; kind: "image" | "video" | "other" };

function classifyEvidence(path: string): EvidenceItem["kind"] {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "image";
  if (["mp4", "mov", "m4v", "webm"].includes(ext)) return "video";
  return "other";
}

function EvidenceLinks({ paths }: { paths: string[] | null }) {
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(false);
  if (!paths || !paths.length) return null;

  const fetchUrls = async () => {
    setLoading(true);
    const out: EvidenceItem[] = [];
    for (const p of paths) {
      const { data, error } = await supabase.storage.from("evidence").createSignedUrl(p, 60 * 10);
      if (error) {
        toast.error(`Cannot access ${p.split("/").pop()}: ${error.message}`);
        continue;
      }
      if (data?.signedUrl) out.push({ path: p, url: data.signedUrl, kind: classifyEvidence(p) });
    }
    setItems(out);
    setLoading(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Paperclip size={12} className="text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">{paths.length} evidence file(s)</span>
        {items.length === 0 && (
          <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={fetchUrls} disabled={loading}>
            {loading ? <Loader2 size={10} className="animate-spin" /> : "Reveal"}
          </Button>
        )}
      </div>
      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-2">
          {items.map((u) => {
            const name = u.path.split("/").pop() ?? u.path;
            return (
              <li key={u.path} className="space-y-1 bg-muted/30 rounded p-1.5">
                {u.kind === "image" && (
                  <a href={u.url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={u.url}
                      alt={`Evidence ${name}`}
                      loading="lazy"
                      className="w-full h-32 object-cover rounded"
                    />
                  </a>
                )}
                {u.kind === "video" && (
                  <video
                    src={u.url}
                    controls
                    preload="metadata"
                    playsInline
                    className="w-full h-32 object-cover rounded bg-black"
                  />
                )}
                {u.kind === "other" && (
                  <div className="h-32 flex items-center justify-center text-[10px] text-muted-foreground bg-muted rounded">
                    Unsupported preview
                  </div>
                )}
                <a
                  href={u.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-primary hover:underline truncate"
                >
                  <ExternalLink size={9} className="shrink-0" />
                  <span className="truncate">{name}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function AdminModeration() {
  const { isModerator, loading } = useAuth();
  const roles = useAdminRoles();
  const [tab, setTab] = useState<TabKey>("reports");
  const [reportStatusFilter, setReportStatusFilter] = useState<"open" | "all">("open");
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [appeals, setAppeals] = useState<AppealRow[]>([]);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [banTarget, setBanTarget] = useState<{ reportId: string; userId: string; reason: string } | null>(null);

  const load = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [r, a, b] = await Promise.all([
        supabase
          .from("reports")
          .select("id, created_at, reason, reason_code, status, post_id, comment_id, reporter_id, mod_notes, evidence_paths, reporter:profiles!reports_reporter_id_fkey(username), reported_user_id")
          .order("created_at", { ascending: false })
          .limit(150),
        supabase
          .from("report_appeals")
          .select("id, created_at, status, body, mod_notes, user_id, report_id, evidence_paths")
          .order("created_at", { ascending: false })
          .limit(150),
        supabase
          .from("blocks")
          .select("id, created_at, blocker_id, blocked_id, blocker:profiles!blocks_blocker_id_fkey(username), blocked:profiles!blocks_blocked_id_fkey(username)")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      if (r.error) throw r.error;
      if (a.error) throw a.error;
      if (b.error) throw b.error;
      setReports((r.data as unknown as ReportRow[]) || []);
      const appealRows = (a.data as unknown as AppealRow[]) || [];
      const userIds = Array.from(new Set(appealRows.map((x) => x.user_id)));
      if (userIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id,username").in("id", userIds);
        const map = new Map((profs ?? []).map((p) => [p.id, p.username]));
        appealRows.forEach((x) => { x.user = { username: map.get(x.user_id) ?? x.user_id.slice(0, 8) }; });
      }
      setAppeals(appealRows);
      setBlocks((b.data as unknown as BlockRow[]) || []);
    } catch (e: any) {
      setLoadError(e?.message ?? "Failed to load moderation queue");
      toast.error(e?.message ?? "Failed to load moderation queue");
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    if (isModerator) load();
  }, [isModerator]);

  const openCounts = useMemo(
    () => ({
      reports: reports.filter((r) => r.status === "open").length,
      appeals: appeals.filter((a) => a.status === "pending").length,
      blocks: blocks.length,
    }),
    [reports, appeals, blocks],
  );

  const visibleReports = useMemo(
    () => reportStatusFilter === "open" ? reports.filter((r) => r.status === "open") : reports,
    [reports, reportStatusFilter],
  );

  if (loading) return <AppShell><div className="py-20 text-center">Loading…</div></AppShell>;
  if (!isModerator) return <Navigate to="/feed" replace />;

  const decideReport = async (id: string, status: string) => {
    setBusyId(id);
    const note = notesById[id]?.trim() || null;
    // Terminal statuses get a resolved_at timestamp; re-opening clears it.
    const isTerminal = status !== "open";
    const { error } = await supabase
      .from("reports")
      .update({
        status: status as "open" | "resolved" | "dismissed",
        mod_notes: note,
        resolved_at: isTerminal ? new Date().toISOString() : null,
      })
      .eq("id", id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success(`Report marked ${status.replace("_", " ")}`);
    setNotesById((n) => ({ ...n, [id]: "" }));
    load();
  };

  const decideAppeal = async (id: string, status: "approved" | "denied", reportId?: string) => {
    setBusyId(id);
    const note = notesById[id]?.trim() || null;
    // Update the appeal itself (updated_at is set by the table's BEFORE UPDATE trigger).
    const { error } = await supabase
      .from("report_appeals")
      .update({ status, mod_notes: note })
      .eq("id", id);
    if (error) {
      setBusyId(null);
      return toast.error(error.message);
    }
    // Mirror the appeal decision onto the parent report so its terminal state stays in sync.
    if (reportId) {
      const reportStatus = status === "approved" ? "resolved" : "denied";
      await supabase
        .from("reports")
        .update({
          status: reportStatus as "open" | "resolved" | "dismissed",
          resolved_at: new Date().toISOString(),
        })
        .eq("id", reportId);
    }
    setBusyId(null);
    toast.success(`Appeal ${status}`);
    setNotesById((n) => ({ ...n, [id]: "" }));
    load();
  };

  // (decideAppeal defined above)

  const unblock = async (id: string) => {
    const { error } = await supabase.from("blocks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Unblocked");
    load();
  };

  return (
    <AppShell title="MODERATION QUEUE">
      <div className="px-4 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-primary" />
          <h1 className="font-display text-xl text-gold">Moderation Queue</h1>
          <Button size="sm" variant="ghost" onClick={load} className="ml-auto">
            <RefreshCw size={14} />
          </Button>
        </div>

        <div className="flex gap-1 text-[11px]">
          {(["reports", "appeals", "blocks"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-full font-bold uppercase tracking-wider ${
                tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {t === "reports" && `Reports (${openCounts.reports})`}
              {t === "appeals" && `Appeals (${openCounts.appeals})`}
              {t === "blocks" && `Blocks (${openCounts.blocks})`}
            </button>
          ))}
        </div>

        {tab === "reports" && reports.map((r) => (
          <div key={r.id} className="royal-card p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-primary">
                <Flag size={12} /> <StatusPill status={r.status} />
              </span>
              <span className="text-[10px] text-muted-foreground">{timeAgo(r.created_at)}</span>
            </div>
            <p className="text-sm">
              <span className="text-muted-foreground">Reason: </span>
              {r.reason}
              {r.reason_code && <span className="text-[10px] text-muted-foreground ml-2">({r.reason_code})</span>}
            </p>
            {r.mod_notes && <p className="text-[11px] text-muted-foreground italic">"{r.mod_notes}"</p>}
            <div className="text-[10px] text-muted-foreground">
              By @{r.reporter?.username ?? r.reporter_id.slice(0, 8)}
              {r.post_id && (
                <> · <Link to={`/post/${r.post_id}`} className="text-primary hover:underline">post {r.post_id.slice(0, 6)}</Link></>
              )}
            </div>
            <EvidenceLinks paths={r.evidence_paths} />
            {r.status === "open" && (
              <>
                <Textarea
                  placeholder="Moderator note (visible to reporter)…"
                  value={notesById[r.id] ?? ""}
                  onChange={(e) => setNotesById((n) => ({ ...n, [r.id]: e.target.value }))}
                  className="bg-input text-xs min-h-[60px]"
                  maxLength={500}
                />
                <div className="flex flex-wrap gap-2">
                  {REPORT_STATUS_OPTIONS.map((o) => (
                    <Button
                      key={o.value}
                      size="sm"
                      variant={o.value === "action_taken" ? "default" : "outline"}
                      disabled={busyId === r.id}
                      onClick={() => decideReport(r.id, o.value)}
                    >
                      {o.label}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
        {tab === "reports" && !reports.length && (
          <p className="text-center text-sm text-muted-foreground py-10">No reports yet.</p>
        )}

        {tab === "appeals" && appeals.map((a) => (
          <div key={a.id} className="royal-card p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-primary">
                <Gavel size={12} /> <StatusPill status={a.status} />
              </span>
              <span className="text-[10px] text-muted-foreground">{timeAgo(a.created_at)}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{a.body}</p>
            {a.mod_notes && (
              <p className="text-[11px] text-foreground/80 border-t border-border/40 pt-1">
                Previous note: {a.mod_notes}
              </p>
            )}
            <div className="text-[10px] text-muted-foreground">
              By @{a.user?.username ?? a.user_id.slice(0, 8)} · report {a.report_id.slice(0, 6)}
            </div>
            <EvidenceLinks paths={a.evidence_paths} />
            {a.status === "pending" && (
              <>
                <Textarea
                  placeholder="Decision note (visible to user)…"
                  value={notesById[a.id] ?? ""}
                  onChange={(e) => setNotesById((n) => ({ ...n, [a.id]: e.target.value }))}
                  className="bg-input text-xs min-h-[60px]"
                  maxLength={500}
                />
                <div className="flex gap-2">
                  {APPEAL_STATUS_OPTIONS.map((o) => (
                    <Button
                      key={o.value}
                      size="sm"
                      variant={o.value === "approved" ? "default" : "outline"}
                      disabled={busyId === a.id}
                      onClick={() => decideAppeal(a.id, o.value as "approved" | "denied", a.report_id)}
                    >
                      {o.label}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
        {tab === "appeals" && !appeals.length && (
          <p className="text-center text-sm text-muted-foreground py-10">No appeals submitted.</p>
        )}

        {tab === "blocks" && blocks.map((b) => (
          <div key={b.id} className="royal-card p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">
                <Ban size={12} /> Block
              </span>
              <span className="text-[10px] text-muted-foreground">{timeAgo(b.created_at)}</span>
            </div>
            <p className="text-sm">
              <Link to={`/u/${b.blocker?.username ?? ""}`} className="font-semibold text-foreground hover:underline">
                @{b.blocker?.username ?? b.blocker_id.slice(0, 8)}
              </Link>
              <span className="text-muted-foreground"> blocked </span>
              <Link to={`/u/${b.blocked?.username ?? ""}`} className="font-semibold text-foreground hover:underline">
                @{b.blocked?.username ?? b.blocked_id.slice(0, 8)}
              </Link>
            </p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => unblock(b.id)}>Unblock</Button>
            </div>
          </div>
        ))}
        {tab === "blocks" && !blocks.length && (
          <p className="text-center text-sm text-muted-foreground py-10">No blocks recorded.</p>
        )}
      </div>
    </AppShell>
  );
}
