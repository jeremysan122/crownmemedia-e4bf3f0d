import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard } from "@/components/admin/cc/CommandCenterUI";
import { Save } from "lucide-react";

interface Assumption {
  id: string;
  metric_key: string;
  unit_name: string;
  unit_cost: number;
  currency: string;
  notes: string | null;
}

export default function CostAssumptionsEditor({ onChange }: { onChange?: () => void }) {
  const [rows, setRows] = useState<Assumption[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("cloud_cost_assumptions")
      .select("id, metric_key, unit_name, unit_cost, currency, notes")
      .order("metric_key");
    setRows((data as Assumption[]) ?? []);
  };
  useEffect(() => { void load(); }, []);

  const save = async (row: Assumption) => {
    const next = draft[row.id];
    if (next === undefined) return;
    const val = Number(next);
    if (!Number.isFinite(val) || val < 0) return;
    setSaving(row.id);
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("cloud_cost_assumptions").update({
      unit_cost: val,
      updated_by: u.user?.id,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    setSaving(null);
    setDraft(d => { const { [row.id]: _drop, ...rest } = d; return rest; });
    await load();
    onChange?.();
  };

  return (
    <SectionCard title="Pricing assumptions">
      <p className="text-[11px] text-muted-foreground mb-2">
        These values drive every cost estimate on this page. Edit when Lovable Cloud pricing
        changes or when you have better average file-size data.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border/40">
              <th className="py-1.5 pr-2">Metric</th>
              <th className="py-1.5 pr-2">Unit</th>
              <th className="py-1.5 pr-2 text-right">Value</th>
              <th className="py-1.5 pr-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-border/20">
                <td className="py-1.5 pr-2 font-mono text-foreground">{r.metric_key}</td>
                <td className="py-1.5 pr-2 text-muted-foreground">{r.unit_name}</td>
                <td className="py-1.5 pr-2 text-right">
                  <input
                    type="number"
                    step="0.000001"
                    value={draft[r.id] ?? r.unit_cost}
                    onChange={e => setDraft(d => ({ ...d, [r.id]: e.target.value }))}
                    className="w-28 px-2 py-1 rounded bg-card border border-border/60 text-right font-mono"
                  />
                </td>
                <td className="py-1.5 pr-2 text-right">
                  {draft[r.id] !== undefined && draft[r.id] !== String(r.unit_cost) && (
                    <button
                      onClick={() => save(r)}
                      disabled={saving === r.id}
                      className="text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 border border-primary/40 text-primary disabled:opacity-50"
                    >
                      <Save size={10} /> {saving === r.id ? "…" : "Save"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
