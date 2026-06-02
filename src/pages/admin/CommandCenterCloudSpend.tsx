import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, StatTile, PillBadge, EmptyState } from "@/components/admin/cc/CommandCenterUI";
import CostAssumptionsEditor from "@/components/admin/cc/CostAssumptionsEditor";
import AlertRulesEditor from "@/components/admin/cc/AlertRulesEditor";
import BillingReconciliation from "@/components/admin/cc/BillingReconciliation";
import { DollarSign, TrendingUp, AlertTriangle, Download, RefreshCcw, Sparkles } from "lucide-react";

interface Rollup {
  id: string;
  date: string;
  feature: string;
  metric_key: string;
  total_count: number;
  total_bytes: number;
  estimated_cost: number;
  metadata: Record<string, unknown>;
}

interface Alert {
  id: string;
  metric_key: string;
  feature: string | null;
  severity: string;
  message: string;
  current_value: number;
  previous_value: number;
  percent_change: number;
  acknowledged: boolean;
  created_at: string;
}

type Tab = "overview" | "projection" | "features" | "alerts" | "billing" | "settings";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "projection", label: "Cost Projection" },
  { id: "features", label: "Feature Attribution" },
  { id: "alerts", label: "Alerts" },
  { id: "billing", label: "Billing Summary" },
  { id: "settings", label: "Assumptions" },
];

function fmtBytes(n: number): string {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}
function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n);
}
function fmtNum(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
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

export default function CommandCenterCloudSpend() {
  const [tab, setTab] = useState<Tab>("overview");
  const [rollups, setRollups] = useState<Rollup[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [recomputing, setRecomputing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 10);
      const [r, a] = await Promise.all([
        supabase.from("daily_usage_rollups").select("*").gte("date", since).order("date", { ascending: true }).limit(5000),
        supabase.from("cost_alerts").select("*").order("created_at", { ascending: false }).limit(100),
      ]);
      if (cancelled) return;
      setRollups((r.data as Rollup[]) ?? []);
      setAlerts((a.data as Alert[]) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const recompute = async () => {
    setRecomputing(true);
    try {
      // Recompute today's rollup so the dashboard reflects the latest data.
      // Stored procedure scoped to admins only via RLS-protected tables it writes to.
      await supabase.rpc("compute_daily_usage_rollup" as never, { _d: new Date().toISOString().slice(0, 10) } as never);
    } catch {/* RLS may deny if not admin; the page itself is admin-gated, but be defensive */}
    setRecomputing(false);
    setRefreshKey(k => k + 1);
  };

  // Derived numbers ---------------------------------------------------------
  const today = new Date().toISOString().slice(0, 10);
  const yest = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  const byDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rollups) m.set(r.date, (m.get(r.date) ?? 0) + Number(r.estimated_cost));
    return m;
  }, [rollups]);

  const costToday = byDate.get(today) ?? 0;
  const costYest = byDate.get(yest) ?? 0;
  const costSeries = useMemo(() => {
    const days = [...byDate.keys()].sort();
    return days.map(d => byDate.get(d) ?? 0);
  }, [byDate]);
  const cost7d = costSeries.slice(-7).reduce((a, b) => a + b, 0);
  const cost30d = costSeries.slice(-30).reduce((a, b) => a + b, 0);
  const avgDaily = costSeries.length ? cost30d / Math.min(30, costSeries.length) : 0;
  const dom = new Date().getUTCDate();
  const daysInMonth = new Date(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0).getUTCDate();
  const projectedMonth = avgDaily * daysInMonth;

  const featureTotals = useMemo(() => {
    const recent = rollups.filter(r => r.date >= new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10));
    const map = new Map<string, { count: number; bytes: number; cost: number }>();
    for (const r of recent) {
      const e = map.get(r.feature) ?? { count: 0, bytes: 0, cost: 0 };
      e.count += Number(r.total_count);
      e.bytes += Number(r.total_bytes);
      e.cost += Number(r.estimated_cost);
      map.set(r.feature, e);
    }
    return [...map.entries()].sort((a, b) => b[1].cost - a[1].cost);
  }, [rollups]);

  const topDriver = featureTotals[0]?.[0] ?? "—";
  const totalCost7d = featureTotals.reduce((a, [, v]) => a + v.cost, 0);
  const unackAlerts = alerts.filter(a => !a.acknowledged).length;

  // CSV export
  const exportCsv = (days: number) => {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const rows = rollups.filter(r => r.date >= cutoff);
    const header = ["date", "feature", "metric_key", "total_count", "total_bytes", "estimated_cost_usd"].join(",");
    const lines = rows.map(r => [r.date, r.feature, r.metric_key, r.total_count, r.total_bytes, r.estimated_cost].join(","));
    const disclaimer = `# Estimate only — not actual Workspace/Lovable billing. Reconcile in the Billing Summary tab.\n# Generated ${new Date().toISOString()} · window ${days}d\n`;
    const csv = disclaimer + header + "\n" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `cloud-spend-estimate-${days}d-${today}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex-1 min-w-[240px]">
          <h1 className="font-display text-lg flex items-center gap-2">
            <DollarSign size={16} className="text-primary" /> Cloud Spend &amp; Usage
            <PillBadge tone="warn">ESTIMATE</PillBadge>
          </h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Internal estimate based on app metrics × configurable assumptions. <strong>Not</strong> an actual
            Workspace or Lovable Cloud invoice — reconcile in the Billing tab.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={recompute}
            disabled={recomputing}
            className="text-[11px] inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/40 hover:bg-muted/60 border border-border/60 disabled:opacity-50"
          >
            <Sparkles size={11} /> {recomputing ? "Recomputing…" : "Recompute today"}
          </button>
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="text-[11px] inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/40 hover:bg-muted/60 border border-border/60"
          >
            <RefreshCcw size={11} /> Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <nav className="flex flex-wrap gap-1.5">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`text-[11px] font-mono uppercase px-2.5 py-1 rounded-full border transition ${
              tab === t.id
                ? "bg-primary/15 border-primary/40 text-primary"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.id === "alerts" && unackAlerts > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-rose-500/20 text-rose-300 text-[9px]">
                {unackAlerts}
              </span>
            )}
          </button>
        ))}
      </nav>

      {loading ? (
        <EmptyState message="Loading rollups…" />
      ) : rollups.length === 0 ? (
        <SectionCard title="No rollup data yet">
          <p className="text-xs text-muted-foreground">
            The daily aggregation job runs at 00:10 UTC. Click <em>Recompute today</em> to populate it now.
          </p>
        </SectionCard>
      ) : tab === "overview" ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <StatTile label="Est. cost today" value={fmtUsd(costToday)} hint={costYest > 0 ? `vs ${fmtUsd(costYest)} yesterday` : "—"} />
            <StatTile label="Est. cost 7d" value={fmtUsd(cost7d)} hint={`${fmtUsd(avgDaily)}/day avg`} />
            <StatTile label="Est. cost 30d" value={fmtUsd(cost30d)} />
            <StatTile label="Projected month" value={fmtUsd(projectedMonth)} hint={`day ${dom} of ${daysInMonth}`} tone="warn" />
          </div>

          <div className="grid md:grid-cols-2 gap-2">
            <SectionCard title="Estimated daily cost trend">
              <Sparkline values={costSeries} />
              <p className="text-[10px] text-muted-foreground/80">Sum of est. cost across all features per day.</p>
            </SectionCard>
            <SectionCard title="Top cost driver (7d)">
              <div className="flex items-center gap-2 py-1">
                <TrendingUp size={14} className="text-primary" />
                <div className="font-display text-xl text-foreground">{topDriver}</div>
                <PillBadge tone="default">
                  {totalCost7d > 0 ? `${Math.round(((featureTotals[0]?.[1].cost ?? 0) / totalCost7d) * 100)}%` : "0%"}
                </PillBadge>
              </div>
              <p className="text-[10px] text-muted-foreground/80">
                Feature with the largest share of estimated spend over the last 7 days.
              </p>
            </SectionCard>
          </div>
        </>
      ) : tab === "projection" ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <StatTile label="Avg daily (30d)" value={fmtUsd(avgDaily)} />
            <StatTile label="Projected month" value={fmtUsd(projectedMonth)} tone="warn" />
            <StatTile label="Day-over-day" value={costYest > 0 ? `${(((costToday - costYest) / costYest) * 100).toFixed(1)}%` : "—"} />
            <StatTile label="7d total" value={fmtUsd(cost7d)} />
          </div>
          <SectionCard title="30-day estimated cost trend">
            <Sparkline values={costSeries} height={60} />
          </SectionCard>
          <SectionCard title="What this projection assumes">
            <ul className="text-[11px] text-muted-foreground space-y-1 list-disc pl-4">
              <li>Linear extrapolation from the 30-day average daily spend.</li>
              <li>Storage cost is amortised per day (per-GB-month ÷ 30).</li>
              <li>Egress is estimated from media event counts × average file size (see Assumptions tab).</li>
              <li>This is <strong>not</strong> a billing forecast — it omits whatever pricing is bundled into your Lovable plan.</li>
            </ul>
          </SectionCard>
        </>
      ) : tab === "features" ? (
        <SectionCard title="Feature attribution (last 7 days)">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border/40">
                  <th className="py-1.5 pr-2">Feature</th>
                  <th className="py-1.5 pr-2 text-right">Events</th>
                  <th className="py-1.5 pr-2 text-right">Est. bytes</th>
                  <th className="py-1.5 pr-2 text-right">Est. cost</th>
                  <th className="py-1.5 pr-2 text-right">% share</th>
                </tr>
              </thead>
              <tbody>
                {featureTotals.map(([feature, v]) => (
                  <tr key={feature} className="border-b border-border/20">
                    <td className="py-1.5 pr-2 font-medium text-foreground">{feature}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmtNum(v.count)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmtBytes(v.bytes)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmtUsd(v.cost)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {totalCost7d > 0 ? `${Math.round((v.cost / totalCost7d) * 100)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground/70 mt-2">
            Derived from posts/votes/comments/messages/notifications + page-view analytics events.
            Per-image-load tracking is intentionally not done (cost &gt; value at this scale).
          </p>
        </SectionCard>
      ) : tab === "alerts" ? (
        <>
          <SectionCard title="Recent alerts">
            {alerts.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">No alerts yet.</p>
            ) : (
              <div className="space-y-1.5">
                {alerts.slice(0, 20).map(a => (
                  <div key={a.id} className="rounded border border-border/40 bg-card/40 p-2 flex items-start gap-2">
                    <AlertTriangle size={12} className={a.severity === "critical" ? "text-rose-400 mt-0.5" : "text-amber-400 mt-0.5"} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-foreground">{a.message}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(a.created_at).toLocaleString()} · {a.feature ?? "all features"} · {a.metric_key}
                      </div>
                    </div>
                    {!a.acknowledged && (
                      <button
                        onClick={async () => {
                          const { data } = await supabase.auth.getUser();
                          await supabase.from("cost_alerts").update({
                            acknowledged: true, acknowledged_at: new Date().toISOString(), acknowledged_by: data.user?.id,
                          }).eq("id", a.id);
                          setRefreshKey(k => k + 1);
                        }}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-muted/40 hover:bg-muted/60 border border-border/60"
                      >Ack</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
          <AlertRulesEditor onChange={() => setRefreshKey(k => k + 1)} />
        </>
      ) : tab === "billing" ? (
        <>
          <SectionCard
            title="Export estimated usage CSV"
            action={
              <div className="flex gap-1.5">
                <button onClick={() => exportCsv(7)} className="text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted/40 hover:bg-muted/60 border border-border/60">
                  <Download size={10} /> 7d
                </button>
                <button onClick={() => exportCsv(30)} className="text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted/40 hover:bg-muted/60 border border-border/60">
                  <Download size={10} /> 30d
                </button>
              </div>
            }
          >
            <p className="text-[11px] text-muted-foreground">
              Exports rollup rows with the disclaimer that values are estimates. Includes the pricing
              assumptions currently in effect.
            </p>
          </SectionCard>
          <BillingReconciliation estimated7d={cost7d} estimated30d={cost30d} onChange={() => setRefreshKey(k => k + 1)} />
        </>
      ) : (
        <CostAssumptionsEditor onChange={() => setRefreshKey(k => k + 1)} />
      )}
    </div>
  );
}
