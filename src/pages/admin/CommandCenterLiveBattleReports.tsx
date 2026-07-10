// Admin/moderator review queue for Live Battle reports. Filters by status
// (queued / processing / handled / rejected / all) and lets a mod approve
// (handled) or reject a report. Realtime-refreshes when new reports come in
// or statuses change.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, EmptyState, PillBadge, StatTile } from "@/components/admin/cc/CommandCenterUI";
import { ConnectionStatus } from "@/components/admin/cc/ConnectionStatus";
import { Button } from "@/components/ui/button";
import { useRealtimeStatus } from "@/hooks/useRealtimeStatus";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  adminListLiveBattleReports,
  adminUpdateLiveBattleReportStatus,
  liveBattleErrorMessage,
  type AdminLiveBattleReportRow,
} from "@/lib/liveBattles";
import { Loader2, CheckCircle2, XCircle, Clock, Play } from "lucide-react";

type Filter = "queued" | "processing" | "handled" | "rejected" | "all";

const STATUS_TONE: Record<string, "warn" | "good" | "bad" | "default"> = {
  queued: "warn",
  processing: "warn",
  handled: "good",
  rejected: "default",
};

export default function CommandCenterLiveBattleReports() {
  const [filter, setFilter] = useState<Filter>("queued");
  const [rows, setRows] = useState<AdminLiveBattleReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openTotal, setOpenTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminListLiveBattleReports(filter === "all" ? null : filter, 100, 0);
      setRows(data);
      if (data[0]) setOpenTotal(data[0].total_open);
      else if (filter === "queued" || filter === "processing") setOpenTotal(0);
    } catch (e) {
      toast.error(liveBattleErrorMessage(e, "Couldn't load reports."));
    } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const rt = useRealtimeStatus("cc-live-battle-reports", (ch) =>
    ch.on("postgres_changes", { event: "*", schema: "public", table: "live_battle_reports" }, () => {
      void load();
    })
  , [load]);

  const act = async (r: AdminLiveBattleReportRow, next: "queued" | "processing" | "handled" | "rejected") => {
    setBusyId(r.id);
    try {
      await adminUpdateLiveBattleReportStatus(r.id, next);
      toast.success(
        next === "handled" ? "Report approved" :
        next === "rejected" ? "Report rejected" :
        "Marked as processing",
      );
      // load() will be triggered by the realtime subscription; also refresh now.
      await load();
    } catch (e) {
      toast.error(liveBattleErrorMessage(e, "Couldn't update report."));
    } finally { setBusyId(null); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <ConnectionStatus status={rt.status} retryIn={rt.retryIn} label="live-battle-reports" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Open (queued+processing)" value={openTotal} tone={openTotal > 0 ? "warn" : "good"} />
        <StatTile label="Filter" value={filter.toUpperCase()} />
        <StatTile label="Shown" value={rows.length} />
      </div>

      <SectionCard
        title={`Live battle reports${filter === "all" ? "" : ` · ${filter}`}`}
        action={
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="h-7 rounded border border-border/60 bg-background px-2 text-[11px]"
            aria-label="Filter reports"
          >
            <option value="queued">Queued</option>
            <option value="processing">Processing</option>
            <option value="handled">Handled</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </select>
        }
      >
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground p-4">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading reports…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message="No reports in this view." />
        ) : (
          <ul className="divide-y divide-border/40">
            {rows.map((r) => (
              <li key={r.id} className="py-2.5 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <PillBadge tone={STATUS_TONE[r.status] ?? "default"}>{r.status}</PillBadge>
                  {r.battle_category && <PillBadge>{r.battle_category}</PillBadge>}
                  {r.battle_region && <PillBadge>{r.battle_region}</PillBadge>}
                  {r.battle_status && <PillBadge tone={r.battle_status === "live" ? "warn" : "default"}>{r.battle_status}</PillBadge>}
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs">
                  <span className="text-muted-foreground">From </span>
                  <span className="font-medium">@{r.reporter_username ?? r.reporter_id.slice(0, 8)}</span>
                  {r.battle_id && (
                    <>
                      {" · "}
                      <Link
                        to={`/live/${r.battle_id}`}
                        className="text-primary hover:underline"
                        target="_blank" rel="noreferrer"
                      >
                        open battle
                      </Link>
                    </>
                  )}
                </div>
                <p className="text-xs rounded bg-muted/30 p-2 whitespace-pre-wrap">{r.reason}</p>
                {r.handled_at && (
                  <p className="text-[10px] text-muted-foreground">
                    {r.status === "handled" ? "Handled" : "Closed"} {new Date(r.handled_at).toLocaleString()}
                    {r.handled_by ? ` by ${r.handled_by.slice(0, 8)}…` : ""}
                  </p>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {r.status === "queued" && (
                    <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={busyId === r.id}
                      onClick={() => act(r, "processing")}>
                      <Play className="w-3 h-3 mr-1" /> Take
                    </Button>
                  )}
                  {(r.status === "queued" || r.status === "processing") && (
                    <>
                      <Button size="sm" className="h-7 text-[10px]" disabled={busyId === r.id}
                        onClick={() => act(r, "handled")}>
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="destructive" className="h-7 text-[10px]" disabled={busyId === r.id}
                        onClick={() => act(r, "rejected")}>
                        <XCircle className="w-3 h-3 mr-1" /> Reject
                      </Button>
                    </>
                  )}
                  {(r.status === "handled" || r.status === "rejected") && (
                    <Button size="sm" variant="ghost" className="h-7 text-[10px]" disabled={busyId === r.id}
                      onClick={() => act(r, "queued")}>
                      <Clock className="w-3 h-3 mr-1" /> Reopen
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
