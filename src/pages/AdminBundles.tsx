import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Coins, Plus, Trash2, Loader2 } from "lucide-react";
import AdminSessionHint from "@/components/admin/AdminSessionHint";

interface Bundle {
  id: string;
  stripe_price_id: string;
  shekels: number;
  usd: number;
  label: string;
  sort_order: number;
  active: boolean;
}

export default function AdminBundles() {
  const { isModerator, loading } = useAuth();
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [form, setForm] = useState({ stripe_price_id: "", shekels: "", usd: "", label: "", sort_order: "0" });
  const [saving, setSaving] = useState(false);



  const load = async () => {
    // stripe_price_id is admin-only, fetched via the SECURITY DEFINER RPC
    const { data, error } = await supabase.rpc("admin_list_shekel_bundles");
    if (error) {
      toast.error("Couldn't load bundles");
      return;
    }
    setBundles((data as Bundle[]) || []);
  };
  useEffect(() => { if (isModerator) load(); }, [isModerator]);

  if (loading) return <AppShell><div className="py-20 text-center">Loading…</div></AppShell>;
  if (!isModerator) return <Navigate to="/feed" replace />;

  const add = async () => {
    if (!form.stripe_price_id.startsWith("price_")) {
      toast.error("Stripe price IDs start with 'price_'");
      return;
    }
    const shekels = Number(form.shekels);
    const usd = Number(form.usd);
    if (!shekels || !usd || !form.label) {
      toast.error("All fields required");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("shekel_bundles").insert({
      stripe_price_id: form.stripe_price_id.trim(),
      shekels,
      usd,
      label: form.label.trim(),
      sort_order: Number(form.sort_order) || 0,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Bundle added");
    setForm({ stripe_price_id: "", shekels: "", usd: "", label: "", sort_order: "0" });
    load();
  };

  const toggleActive = async (b: Bundle) => {
    await supabase.from("shekel_bundles").update({ active: !b.active }).eq("id", b.id);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this bundle?")) return;
    await supabase.from("shekel_bundles").delete().eq("id", id);
    load();
  };




  return (
    <AppShell title="ADMIN BUNDLES">
      <div className="px-4 py-4 space-y-5 max-w-2xl mx-auto">
        <AdminSessionHint />
        <h1 className="font-display text-2xl text-gold flex items-center gap-2">
          <Coins size={20} /> Shekel Bundles
        </h1>

        <section className="royal-card p-4 space-y-3">
          <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground">Add Bundle</h2>
          <div>
            <Label>Stripe Price ID</Label>
            <Input value={form.stripe_price_id} onChange={(e) => setForm({ ...form, stripe_price_id: e.target.value })} placeholder="price_1ABC…" className="bg-input" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Shekels</Label><Input type="number" value={form.shekels} onChange={(e) => setForm({ ...form, shekels: e.target.value })} className="bg-input" /></div>
            <div><Label>USD</Label><Input type="number" step="0.01" value={form.usd} onChange={(e) => setForm({ ...form, usd: e.target.value })} className="bg-input" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Label</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Starter Pouch" className="bg-input" /></div>
            <div><Label>Sort order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} className="bg-input" /></div>
          </div>
          <Button onClick={add} disabled={saving} className="w-full bg-gradient-gold text-primary-foreground">
            {saving ? <Loader2 size={14} className="animate-spin mr-2" /> : <Plus size={14} className="mr-2" />}
            Add bundle
          </Button>
        </section>

        <section className="royal-card divide-y divide-border">
          {bundles.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No bundles yet</p>}
          {bundles.map((b) => (
            <div key={b.id} className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold">{b.label} · ₪{Number(b.shekels).toLocaleString()} · ${Number(b.usd).toFixed(2)}</div>
                <div className="text-[10px] text-muted-foreground truncate">{b.stripe_price_id} · order {b.sort_order}</div>
              </div>
              <Switch checked={b.active} onCheckedChange={() => toggleActive(b)} />
              <button onClick={() => remove(b.id)} className="p-2 text-destructive hover:bg-destructive/10 rounded-lg">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </section>

      </div>
    </AppShell>
  );
}
