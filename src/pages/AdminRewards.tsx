import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Prize = {
  id: string;
  label: string;
  prize_type: "shekels" | "battle_tickets" | "royal_pass_days" | "nothing";
  prize_value: number;
  weight: number;
  color_hex: string | null;
  active: boolean;
  sort_order: number;
};

const PRIZE_TYPES = ["shekels", "battle_tickets", "royal_pass_days", "nothing"] as const;

const blankDraft = (): Prize => ({
  id: "",
  label: "",
  prize_type: "shekels",
  prize_value: 0,
  weight: 1,
  color_hex: "#D4AF37",
  active: true,
  sort_order: 0,
});

export default function AdminRewards() {
  useSeoMeta({ title: "Admin · Rewards & Wheel", description: "Configure the daily spin wheel prize pool." });
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Prize | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from("spin_wheel_prizes")
      .select("id,label,prize_type,prize_value,weight,color_hex,active,sort_order")
      .order("sort_order");
    if (error) { toast.error(error.message); return; }
    setPrizes((data as Prize[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!editing) return;
    const { error } = await supabase.rpc("admin_upsert_spin_prize", {
      _id: editing.id || null,
      _label: editing.label.trim(),
      _prize_type: editing.prize_type,
      _prize_value: editing.prize_value,
      _weight: editing.weight,
      _color_hex: editing.color_hex,
      _active: editing.active,
      _sort_order: editing.sort_order,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(editing.id ? "Prize updated" : "Prize created");
    setEditing(null);
    load();
  }

  async function toggle(p: Prize) {
    const { error } = await supabase.rpc("admin_upsert_spin_prize", {
      _id: p.id, _label: p.label, _prize_type: p.prize_type, _prize_value: p.prize_value,
      _weight: p.weight, _color_hex: p.color_hex, _active: !p.active, _sort_order: p.sort_order,
    });
    if (error) { toast.error(error.message); return; }
    load();
  }

  const totalWeight = prizes.filter((p) => p.active).reduce((s, p) => s + p.weight, 0) || 1;

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="font-display text-2xl">Daily Rewards & Spin Wheel</h1>
          <Button onClick={() => setEditing(blankDraft())}>+ New prize</Button>
        </header>

        {loading ? <p className="text-muted-foreground text-sm">Loading…</p> : (
          <Card className="divide-y">
            {prizes.map((p) => (
              <div key={p.id} className="p-4 flex items-center gap-4">
                <span className="inline-block size-5 rounded" style={{ backgroundColor: p.color_hex ?? "#444" }} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{p.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.prize_type} · {p.prize_value} · weight {p.weight} ({((p.weight / totalWeight) * 100).toFixed(1)}% if active)
                  </div>
                </div>
                <Switch checked={p.active} onCheckedChange={() => toggle(p)} aria-label="Active" />
                <Button variant="outline" size="sm" onClick={() => setEditing(p)}>Edit</Button>
              </div>
            ))}
            {prizes.length === 0 && <div className="p-6 text-sm text-muted-foreground">No prizes yet.</div>}
          </Card>
        )}

        {editing && (
          <Card className="p-5 space-y-3 border-primary/40">
            <h2 className="font-semibold">{editing.id ? "Edit prize" : "New prize"}</h2>
            <div>
              <Label className="text-xs">Label</Label>
              <Input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} maxLength={80} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Prize type</Label>
                <select
                  value={editing.prize_type}
                  onChange={(e) => setEditing({ ...editing, prize_type: e.target.value as Prize["prize_type"] })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {PRIZE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Value</Label>
                <Input type="number" min={0} value={editing.prize_value} onChange={(e) => setEditing({ ...editing, prize_value: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
              <div>
                <Label className="text-xs">Weight (odds)</Label>
                <Input type="number" min={0} value={editing.weight} onChange={(e) => setEditing({ ...editing, weight: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
              <div>
                <Label className="text-xs">Sort order</Label>
                <Input type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <Label className="text-xs">Color hex</Label>
                <Input value={editing.color_hex ?? ""} onChange={(e) => setEditing({ ...editing, color_hex: e.target.value })} placeholder="#D4AF37" />
              </div>
              <div className="flex items-end gap-2">
                <Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />
                <span className="text-sm">Active</span>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={save}>Save</Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
