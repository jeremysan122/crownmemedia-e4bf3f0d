import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, EmptyState } from "@/components/admin/cc/CommandCenterUI";
import { Loader2, RefreshCw, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface Flag {
  id: string;
  key: string;
  enabled: boolean;
  description: string | null;
  rollout_percent: number;
  audience: "all" | "admins" | "royal_pass";
  updated_at: string;
}

export default function CommandCenterFeatureFlags() {
  const [rows, setRows] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("feature_flags").select("*").order("key");
    setRows((data as Flag[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    const k = newKey.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
    if (k.length < 2) { toast.error("Key too short"); return; }
    const { error } = await supabase.from("feature_flags").insert({ key: k, description: newDesc.trim() || null, enabled: false });
    if (error) { toast.error(error.message); return; }
    setNewKey(""); setNewDesc("");
    toast.success("Flag created");
    load();
  };

  const patch = async (id: string, patch: Partial<Flag>) => {
    const { error } = await supabase.from("feature_flags").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this flag?")) return;
    const { error } = await supabase.from("feature_flags").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg">Feature Flags</h2>
          <p className="text-xs text-muted-foreground">Toggle features at runtime without redeploying</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <RefreshCw size={14} className="mr-1.5" />}
          Refresh
        </Button>
      </div>

      <SectionCard title="Create new flag">
        <div className="flex flex-col md:flex-row gap-2">
          <Input placeholder="flag_key (a-z, 0-9, _ . -)" value={newKey} onChange={(e) => setNewKey(e.target.value)} className="md:w-64" />
          <Input placeholder="Description (optional)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
          <Button onClick={create} size="sm"><Plus size={14} className="mr-1.5" /> Create</Button>
        </div>
      </SectionCard>

      <SectionCard title={`Flags (${rows.length})`}>
        {loading ? (
          <div className="p-6 flex items-center justify-center text-muted-foreground">
            <Loader2 size={14} className="animate-spin mr-2" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message="No flags yet — create your first above" />
        ) : (
          <div className="divide-y divide-border/60">
            {rows.map((f) => (
              <div key={f.id} className="p-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                <div className="md:col-span-4">
                  <div className="font-mono text-sm">{f.key}</div>
                  {f.description && <div className="text-xs text-muted-foreground">{f.description}</div>}
                </div>
                <div className="md:col-span-2 flex items-center gap-2">
                  <Switch checked={f.enabled} onCheckedChange={(v) => patch(f.id, { enabled: v })} />
                  <span className="text-xs text-muted-foreground">{f.enabled ? "ON" : "OFF"}</span>
                </div>
                <div className="md:col-span-3 flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={f.rollout_percent}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                      setRows((rs) => rs.map((r) => (r.id === f.id ? { ...r, rollout_percent: v } : r)));
                    }}
                    onBlur={(e) => patch(f.id, { rollout_percent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                    className="w-20"
                  />
                  <span className="text-xs text-muted-foreground">% rollout</span>
                </div>
                <div className="md:col-span-2">
                  <select
                    value={f.audience}
                    onChange={(e) => patch(f.id, { audience: e.target.value as Flag["audience"] })}
                    className="w-full bg-background border border-border/60 rounded px-2 py-1 text-xs"
                  >
                    <option value="all">All users</option>
                    <option value="royal_pass">Royal Pass</option>
                    <option value="admins">Admins only</option>
                  </select>
                </div>
                <div className="md:col-span-1 flex justify-end">
                  <Button variant="ghost" size="icon" onClick={() => remove(f.id)}>
                    <Trash2 size={14} className="text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
