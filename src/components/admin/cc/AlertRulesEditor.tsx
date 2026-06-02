import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, PillBadge } from "@/components/admin/cc/CommandCenterUI";
import { Plus, Trash2 } from "lucide-react";

interface Rule {
  id: string;
  name: string;
  metric_key: string;
  feature: string | null;
  threshold_type: string;
  threshold_value: number;
  comparison_window: string;
  is_active: boolean;
}

const METRICS = ["estimated_cost", "total_bytes", "posts_created", "messages_sent", "votes", "notifications_created"];
const FEATURES = ["", "Feed", "Scrolls", "Profile", "Crown Map", "Leaderboard", "Voting", "Comments", "DMs", "Notifications", "Verification", "Share Cards", "Royal Pass", "Users"];
const TYPES = [
  { v: "pct_change_dod", label: "% change DoD" },
  { v: "pct_change_wow", label: "% change WoW" },
  { v: "absolute", label: "Absolute value" },
];

export default function AlertRulesEditor({ onChange }: { onChange?: () => void }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [draft, setDraft] = useState({
    name: "", metric_key: "estimated_cost", feature: "", threshold_type: "pct_change_dod", threshold_value: "30",
  });

  const load = async () => {
    const { data } = await supabase.from("cost_alert_rules").select("*").order("created_at", { ascending: false });
    setRules((data as Rule[]) ?? []);
  };
  useEffect(() => { void load(); }, []);

  const create = async () => {
    if (!draft.name.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("cost_alert_rules").insert({
      name: draft.name.trim(),
      metric_key: draft.metric_key,
      feature: draft.feature || null,
      threshold_type: draft.threshold_type,
      threshold_value: Number(draft.threshold_value) || 0,
      comparison_window: draft.threshold_type === "pct_change_wow" ? "7d" : "1d",
      is_active: true,
      created_by: u.user?.id,
    });
    setDraft({ ...draft, name: "" });
    await load();
    onChange?.();
  };

  const toggle = async (r: Rule) => {
    await supabase.from("cost_alert_rules").update({ is_active: !r.is_active }).eq("id", r.id);
    await load();
  };
  const remove = async (id: string) => {
    await supabase.from("cost_alert_rules").delete().eq("id", id);
    await load();
  };

  return (
    <SectionCard title="Alert rules">
      <div className="grid md:grid-cols-6 gap-1.5 text-[11px] mb-2">
        <input className="md:col-span-2 px-2 py-1 rounded bg-card border border-border/60" placeholder="Rule name"
          value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
        <select className="px-2 py-1 rounded bg-card border border-border/60"
          value={draft.metric_key} onChange={e => setDraft({ ...draft, metric_key: e.target.value })}>
          {METRICS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className="px-2 py-1 rounded bg-card border border-border/60"
          value={draft.feature} onChange={e => setDraft({ ...draft, feature: e.target.value })}>
          {FEATURES.map(f => <option key={f} value={f}>{f || "all features"}</option>)}
        </select>
        <select className="px-2 py-1 rounded bg-card border border-border/60"
          value={draft.threshold_type} onChange={e => setDraft({ ...draft, threshold_type: e.target.value })}>
          {TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
        </select>
        <div className="flex gap-1">
          <input type="number" className="flex-1 px-2 py-1 rounded bg-card border border-border/60"
            value={draft.threshold_value} onChange={e => setDraft({ ...draft, threshold_value: e.target.value })} />
          <button onClick={create} className="px-2 rounded bg-primary/15 border border-primary/40 text-primary inline-flex items-center">
            <Plus size={12} />
          </button>
        </div>
      </div>

      {rules.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3 text-center">No rules yet.</p>
      ) : (
        <div className="space-y-1">
          {rules.map(r => (
            <div key={r.id} className="flex items-center gap-2 text-[11px] rounded border border-border/40 bg-card/40 p-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground">{r.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {r.metric_key} · {r.feature ?? "all"} · {r.threshold_type} ≥ {r.threshold_value}
                </div>
              </div>
              <button onClick={() => toggle(r)}>
                <PillBadge tone={r.is_active ? "good" : "default"}>{r.is_active ? "active" : "off"}</PillBadge>
              </button>
              <button onClick={() => remove(r.id)} className="text-rose-400 hover:text-rose-300">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
