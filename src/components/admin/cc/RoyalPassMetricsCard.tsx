import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, StatTile } from "@/components/admin/cc/CommandCenterUI";
import { Button } from "@/components/ui/button";
import { RotateCw, Loader2, Crown } from "lucide-react";

interface Metrics {
  mrr_usd: number;
  arr_usd: number;
  active_monthly: number;
  active_annual: number;
  active_total: number;
  canceled_30d: number;
  churn_rate_30d: number;
  ltv_usd: number;
  monthly_price_usd: number;
  computed_at: string;
}

const fmtUsd = (n: number) =>
  `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function RoyalPassMetricsCard() {
  const [m, setM] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data, error } = await (supabase as any).rpc("royal_pass_finance_metrics");
      if (error) throw error;
      setM(data as Metrics);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <SectionCard
      title="Royal Pass · MRR / Churn / LTV"
      action={
        <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={load} disabled={loading}>
          {loading ? <Loader2 size={12} className="animate-spin mr-1" /> : <RotateCw size={12} className="mr-1" />}
          Refresh
        </Button>
      }
    >
      {err ? (
        <div className="text-[11px] text-rose-300">Couldn't load metrics: {err}</div>
      ) : !m ? (
        <div className="text-[11px] text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatTile label="MRR" value={fmtUsd(m.mrr_usd)} tone="good" />
            <StatTile label="ARR" value={fmtUsd(m.arr_usd)} />
            <StatTile label="Active subs" value={m.active_total.toLocaleString()} />
            <StatTile label="Churn (30d)" value={`${(m.churn_rate_30d * 100).toFixed(2)}%`}
              tone={m.churn_rate_30d > 0.1 ? "bad" : m.churn_rate_30d > 0.05 ? "warn" : "good"} />
            <StatTile label="LTV" value={fmtUsd(m.ltv_usd)} />
            <StatTile label="Monthly" value={m.active_monthly.toLocaleString()} />
            <StatTile label="Annual" value={m.active_annual.toLocaleString()} />
            <StatTile label="Canceled 30d" value={m.canceled_30d.toLocaleString()} tone={m.canceled_30d > 0 ? "warn" : "default"} />
          </div>
          <div className="text-[10px] text-muted-foreground text-right">
            Computed {new Date(m.computed_at).toLocaleTimeString()}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
