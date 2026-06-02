import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, StatTile, EmptyState, PillBadge } from "@/components/admin/cc/CommandCenterUI";
import { Activity, Database, HardDrive, Plug, AlertTriangle, RefreshCcw } from "lucide-react";

interface Snapshot {
  id: string;
  captured_at: string;
  commits: number;
  rollbacks: number;
  commits_delta: number;
  rollbacks_delta: number;
  rollback_rate: number;
  deadlocks: number;
  deadlocks_delta: number;
  db_size_bytes: number;
  wal_size_bytes: number;
  connections_active: number;
  connections_max: number;
}

interface ErrorGroup {
  source: string;
  count: number;
  last_seen: string;
  sample_message: string;
}

type Range = "24h" | "7d" | "30d";

const RANGE_HOURS: Record<Range, number> = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };
// Lovable Cloud default data disk = 8 GB. We surface usage relative to this budget.
const DISK_BUDGET_BYTES = 8 * 1024 * 1024 * 1024;

function fmtBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function rollbackTone(rate: number): "good" | "warn" | "bad" {
  if (rate >= 25) return "bad";
  if (rate >= 15) return "warn";
  return "good";
}

function diskTone(pct: number): "good" | "warn" | "bad" {
  if (pct >= 90) return "bad";
  if (pct >= 75) return "warn";
  return "good";
}

function Sparkline({ values, height = 36 }: { values: number[]; height?: number }) {
  if (values.length < 2) return <div className="h-9 text-[10px] text-muted-foreground/60">Not enough data yet</div>;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const w = 100;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full h-9" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.2" className="text-primary" />
    </svg>
  );
}

export default function CommandCenterDbHealth() {
  const [range, setRange] = useState<Range>("24h");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [errors, setErrors] = useState<ErrorGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - RANGE_HOURS[range] * 3600_000).toISOString();

      const [snapsRes, errsRes] = await Promise.all([
        supabase
          .from("db_health_snapshots")
          .select("*")
          .gte("captured_at", since)
          .order("captured_at", { ascending: true })
          .limit(3000),
        supabase
          .from("error_logs")
          .select("source, message, created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      if (cancelled) return;
      setSnapshots((snapsRes.data as Snapshot[]) ?? []);

      const groups = new Map<string, ErrorGroup>();
      for (const row of (errsRes.data ?? []) as Array<{ source: string; message: string; created_at: string }>) {
        const key = row.source || "unknown";
        const g = groups.get(key);
        if (g) {
          g.count += 1;
        } else {
          groups.set(key, { source: key, count: 1, last_seen: row.created_at, sample_message: row.message?.slice(0, 160) ?? "" });
        }
      }
      setErrors([...groups.values()].sort((a, b) => b.count - a.count).slice(0, 12));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [range, refreshKey]);

  const latest = snapshots[snapshots.length - 1];
  const rollbackSeries = useMemo(() => snapshots.map(s => Number(s.rollback_rate) || 0), [snapshots]);
  const dbSizeSeries = useMemo(() => snapshots.map(s => s.db_size_bytes), [snapshots]);
  const walSeries = useMemo(() => snapshots.map(s => s.wal_size_bytes), [snapshots]);
  const connSeries = useMemo(() => snapshots.map(s => s.connections_active), [snapshots]);

  const avgRollback = useMemo(() => {
    if (!rollbackSeries.length) return 0;
    return rollbackSeries.reduce((a, b) => a + b, 0) / rollbackSeries.length;
  }, [rollbackSeries]);

  const totalDeadlocks = useMemo(
    () => snapshots.reduce((a, s) => a + (s.deadlocks_delta || 0), 0),
    [snapshots]
  );

  const diskPctNow = latest
    ? Math.round(((latest.db_size_bytes + latest.wal_size_bytes) / DISK_BUDGET_BYTES) * 100)
    : 0;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-lg flex items-center gap-2">
            <Activity size={16} className="text-primary" /> Database Health Trend
          </h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Sampled every 15 min from Postgres' internal counters. Aggregate trends only —
            this is not a per-transaction event log.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {(Object.keys(RANGE_HOURS) as Range[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`text-[11px] font-mono uppercase px-2.5 py-1 rounded-full border transition ${
                range === r
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >{r}</button>
          ))}
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted/40 hover:bg-muted/60 border border-border/60"
          >
            <RefreshCcw size={11} /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <EmptyState message="Loading snapshots…" />
      ) : snapshots.length === 0 ? (
        <SectionCard title="No data yet">
          <p className="text-xs text-muted-foreground">
            The 15-minute snapshot job has just been scheduled. Trend data will appear after
            the next capture.
          </p>
        </SectionCard>
      ) : (
        <>
          {/* Top tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <StatTile
              label="Rollback rate (latest)"
              value={`${latest!.rollback_rate}%`}
              tone={rollbackTone(latest!.rollback_rate)}
              hint={`avg ${avgRollback.toFixed(1)}% over ${range}`}
            />
            <StatTile
              label="Database size"
              value={fmtBytes(latest!.db_size_bytes)}
              hint={`${diskPctNow}% of 8 GB soft budget`}
              tone={diskTone(diskPctNow)}
            />
            <StatTile
              label="WAL (txn log)"
              value={fmtBytes(latest!.wal_size_bytes)}
              hint="Recycles between checkpoints"
            />
            <StatTile
              label="Connections"
              value={`${latest!.connections_active} / ${latest!.connections_max}`}
              hint={`${totalDeadlocks} deadlocks in ${range}`}
            />
          </div>

          {/* Threshold legend */}
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><PillBadge tone="warn">warn</PillBadge> rollback ≥ 15% · disk ≥ 75%</span>
            <span className="flex items-center gap-1"><PillBadge tone="bad">critical</PillBadge> rollback ≥ 25% · disk ≥ 90%</span>
          </div>

          {/* Trend charts */}
          <div className="grid md:grid-cols-2 gap-2">
            <SectionCard title="Rollback rate trend">
              <Sparkline values={rollbackSeries} />
              <p className="text-[10px] text-muted-foreground/80">
                Rolled-back transactions as % of total per 15-min window. Some baseline rollback is
                normal on a social app (RLS rejections, unique-constraint conflicts).
              </p>
            </SectionCard>
            <SectionCard title="Active connections">
              <Sparkline values={connSeries} />
              <p className="text-[10px] text-muted-foreground/80">
                Out of {latest!.connections_max}. Sustained &gt;70% = consider upsizing database server.
              </p>
            </SectionCard>
            <SectionCard title="Database size">
              <Sparkline values={dbSizeSeries} />
              <p className="text-[10px] text-muted-foreground/80">
                Actual table & index data. Grows steadily with usage.
              </p>
            </SectionCard>
            <SectionCard title="WAL (write-ahead log) size">
              <Sparkline values={walSeries} />
              <p className="text-[10px] text-muted-foreground/80">
                Transaction log. Grows during heavy writes, shrinks after checkpoints.
              </p>
            </SectionCard>
          </div>

          {/* Error sources */}
          <SectionCard title="Top application error sources">
            {errors.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No application errors logged in this range.
              </p>
            ) : (
              <div className="space-y-1.5">
                {errors.map(e => (
                  <div key={e.source} className="flex items-start gap-2 rounded border border-border/40 bg-card/40 p-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-mono text-foreground truncate">{e.source}</div>
                      {e.sample_message && (
                        <div className="text-[10px] text-muted-foreground truncate">{e.sample_message}</div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-display text-primary">{e.count}</div>
                      <div className="text-[9px] text-muted-foreground">events</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground/70 mt-2 flex items-start gap-1">
              <AlertTriangle size={10} className="mt-0.5 shrink-0" />
              Application errors from <code className="font-mono">error_logs</code>. Per-rollback events
              are not exposed by the database — enable external log forwarding (Logflare/Datadog) at the
              Cloud level for that depth.
            </p>
          </SectionCard>

          {/* Recommendations */}
          <SectionCard title="Recommendations">
            <ul className="space-y-1.5 text-[11px] text-muted-foreground">
              <li className="flex items-start gap-2">
                <Database size={11} className="mt-0.5 text-primary shrink-0" />
                {avgRollback >= 25
                  ? <span className="text-rose-400">Rollback rate critical. Investigate top failing tables and RLS policies.</span>
                  : avgRollback >= 15
                    ? <span className="text-amber-400">Rollback rate elevated. Review unique-constraint conflicts and RLS rejections.</span>
                    : <span>Rollback rate within healthy bounds for a social app (typical 5–15%).</span>}
              </li>
              <li className="flex items-start gap-2">
                <HardDrive size={11} className="mt-0.5 text-primary shrink-0" />
                {diskPctNow >= 90
                  ? <span className="text-rose-400">Disk usage critical. Increase database disk size in Cloud settings.</span>
                  : diskPctNow >= 75
                    ? <span className="text-amber-400">Disk usage approaching limit. Plan a disk size increase.</span>
                    : <span>Disk usage is healthy ({diskPctNow}% of 8 GB soft budget).</span>}
              </li>
              <li className="flex items-start gap-2">
                <Plug size={11} className="mt-0.5 text-primary shrink-0" />
                {latest!.connections_active / Math.max(latest!.connections_max, 1) > 0.7
                  ? <span className="text-amber-400">Connection pool above 70%. Consider upsizing the database server.</span>
                  : <span>Connection count is comfortably below the pool limit.</span>}
              </li>
            </ul>
          </SectionCard>
        </>
      )}
    </div>
  );
}
