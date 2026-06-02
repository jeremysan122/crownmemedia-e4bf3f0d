import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard } from "@/components/admin/cc/CommandCenterUI";

interface Recon {
  id: string;
  period_start: string;
  period_end: string;
  actual_charge_usd: number;
  estimated_cost_usd: number;
  notes: string | null;
  created_at: string;
}

function fmtUsd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function BillingReconciliation({
  estimated7d, estimated30d, onChange,
}: { estimated7d: number; estimated30d: number; onChange?: () => void }) {
  const [rows, setRows] = useState<Recon[]>([]);
  const [draft, setDraft] = useState({
    period_start: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10),
    period_end: new Date().toISOString().slice(0, 10),
    actual_charge_usd: "",
    estimated_cost_usd: String(estimated30d.toFixed(4)),
    notes: "",
  });

  const load = async () => {
    const { data } = await supabase.from("billing_reconciliations")
      .select("*").order("period_start", { ascending: false }).limit(20);
    setRows((data as Recon[]) ?? []);
  };
  useEffect(() => { void load(); }, []);

  const submit = async () => {
    const actual = Number(draft.actual_charge_usd);
    if (!Number.isFinite(actual) || actual < 0) return;
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("billing_reconciliations").insert({
      period_start: draft.period_start,
      period_end: draft.period_end,
      actual_charge_usd: actual,
      estimated_cost_usd: Number(draft.estimated_cost_usd) || 0,
      notes: draft.notes || null,
      created_by: u.user?.id,
    });
    setDraft({ ...draft, actual_charge_usd: "", notes: "" });
    await load();
    onChange?.();
  };

  return (
    <SectionCard title="Billing reconciliation">
      <p className="text-[11px] text-muted-foreground mb-2">
        Paste the actual charge from <strong>Workspace → Billing</strong> for the same period so the
        dashboard can show variance vs. our estimate. We can't pull this number programmatically.
      </p>

      <div className="grid md:grid-cols-5 gap-1.5 text-[11px] mb-2">
        <input type="date" className="px-2 py-1 rounded bg-card border border-border/60"
          value={draft.period_start} onChange={e => setDraft({ ...draft, period_start: e.target.value })} />
        <input type="date" className="px-2 py-1 rounded bg-card border border-border/60"
          value={draft.period_end} onChange={e => setDraft({ ...draft, period_end: e.target.value })} />
        <input type="number" step="0.01" placeholder="Actual charge USD" className="px-2 py-1 rounded bg-card border border-border/60"
          value={draft.actual_charge_usd} onChange={e => setDraft({ ...draft, actual_charge_usd: e.target.value })} />
        <input type="number" step="0.01" placeholder="Our estimate USD" className="px-2 py-1 rounded bg-card border border-border/60"
          value={draft.estimated_cost_usd} onChange={e => setDraft({ ...draft, estimated_cost_usd: e.target.value })} />
        <button onClick={submit} className="px-2 py-1 rounded bg-primary/15 border border-primary/40 text-primary">
          Record
        </button>
      </div>
      <input className="w-full px-2 py-1 rounded bg-card border border-border/60 text-[11px] mb-3"
        placeholder="Notes (optional)" value={draft.notes}
        onChange={e => setDraft({ ...draft, notes: e.target.value })} />

      <div className="text-[10px] text-muted-foreground mb-1">
        For convenience: last 7d est = <strong>{fmtUsd(estimated7d)}</strong> · last 30d est = <strong>{fmtUsd(estimated30d)}</strong>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">No reconciliations recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border/40">
                <th className="py-1.5 pr-2">Period</th>
                <th className="py-1.5 pr-2 text-right">Actual</th>
                <th className="py-1.5 pr-2 text-right">Estimate</th>
                <th className="py-1.5 pr-2 text-right">Δ</th>
                <th className="py-1.5 pr-2 text-right">Δ %</th>
                <th className="py-1.5 pr-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const diff = Number(r.actual_charge_usd) - Number(r.estimated_cost_usd);
                const pct = r.estimated_cost_usd > 0 ? (diff / Number(r.estimated_cost_usd)) * 100 : 0;
                return (
                  <tr key={r.id} className="border-b border-border/20">
                    <td className="py-1.5 pr-2">{r.period_start} → {r.period_end}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmtUsd(Number(r.actual_charge_usd))}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmtUsd(Number(r.estimated_cost_usd))}</td>
                    <td className={`py-1.5 pr-2 text-right tabular-nums ${diff > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                      {diff > 0 ? "+" : ""}{fmtUsd(diff)}
                    </td>
                    <td className={`py-1.5 pr-2 text-right tabular-nums ${pct > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                      {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
                    </td>
                    <td className="py-1.5 pr-2 text-muted-foreground">{r.notes ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
