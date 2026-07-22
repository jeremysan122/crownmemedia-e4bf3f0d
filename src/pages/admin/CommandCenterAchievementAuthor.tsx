import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Save, X, Eye, EyeOff, Loader2 } from "lucide-react";

/**
 * Admin authoring surface for achievement definitions.
 *
 * The scanner-friendly write path goes through the definitions table directly
 * (RLS restricts writes to admins), and every edit lands in `admin_audit_log`
 * via a database trigger you can wire up later; for now we log a client-side
 * audit row explicitly so operators have an immediate paper trail.
 */

type Def = {
  id: string;
  slug: string;
  name: string;
  description: string;
  rarity: string;
  achievement_type: string;
  reward_payload: Record<string, unknown>;
  is_founder_only: boolean;
  is_secret: boolean;
  is_repeatable: boolean;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  display_order: number;
  requirement_logic: Record<string, unknown>;
};

const EMPTY: Omit<Def, "id"> = {
  slug: "",
  name: "",
  description: "",
  rarity: "rare",
  achievement_type: "badge_unlock",
  reward_payload: {},
  is_founder_only: false,
  is_secret: false,
  is_repeatable: false,
  is_active: true,
  starts_at: null,
  ends_at: null,
  display_order: 1000,
  requirement_logic: {},
};

async function logAudit(action: string, target: string, meta: Record<string, unknown>) {
  await (supabase as any).from("admin_audit_log").insert({
    action,
    target_type: "achievement_definition",
    target_id: target,
    details: meta,
  });
}

export default function CommandCenterAchievementAuthor() {
  const [rows, setRows] = useState<Def[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Def | null>(null);
  const [creating, setCreating] = useState<Omit<Def, "id"> | null>(null);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("achievement_definitions")
      .select("*")
      .order("display_order", { ascending: true });
    if (error) toast.error(error.message);
    else setRows((data as Def[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { void refresh(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => r.slug.toLowerCase().includes(needle) || r.name.toLowerCase().includes(needle));
  }, [rows, q]);

  const save = async (row: Def | (Omit<Def, "id"> & { id?: string })) => {
    setSaving(true);
    const isNew = !("id" in row) || !row.id;
    let error: any;
    let targetId = (row as any).id ?? row.slug;
    if (isNew) {
      const { data, error: e } = await (supabase as any).from("achievement_definitions").insert(row).select("id").single();
      error = e; if (data?.id) targetId = data.id;
    } else {
      const { id, ...rest } = row as Def;
      const { error: e } = await (supabase as any).from("achievement_definitions").update(rest).eq("id", id);
      error = e;
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(isNew ? "Achievement created" : "Achievement updated");
    await logAudit(isNew ? "achievement.create" : "achievement.update", targetId, { slug: row.slug });
    setEditing(null); setCreating(null);
    await refresh();
  };

  const toggleActive = async (r: Def) => {
    const { error } = await (supabase as any).from("achievement_definitions").update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) return toast.error(error.message);
    await logAudit("achievement.toggle_active", r.id, { slug: r.slug, is_active: !r.is_active });
    await refresh();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl">Achievement Author</h1>
        <button
          onClick={() => setCreating({ ...EMPTY })}
          className="inline-flex items-center gap-1 bg-gradient-gold text-black text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full"
        >
          <Plus size={14} /> New
        </button>
      </div>

      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by slug or name…"
        className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background mb-4"
      />

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="animate-spin" size={14} /> Loading…</div>
      ) : (
        <div className="royal-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="p-2">Slug</th>
                <th className="p-2">Name</th>
                <th className="p-2">Type</th>
                <th className="p-2">Rarity</th>
                <th className="p-2">Flags</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-2 font-mono">{r.slug}</td>
                  <td className="p-2">{r.name}</td>
                  <td className="p-2">{r.achievement_type}</td>
                  <td className="p-2">{r.rarity}</td>
                  <td className="p-2 space-x-1">
                    {r.is_founder_only && <span className="text-gold">F</span>}
                    {r.is_secret && <span className="text-purple-400">S</span>}
                    {r.is_repeatable && <span className="text-blue-400">R</span>}
                    {!r.is_active && <span className="text-destructive">off</span>}
                  </td>
                  <td className="p-2 text-right">
                    <button onClick={() => setEditing(r)} className="text-gold hover:underline mr-2">Edit</button>
                    <button
                      onClick={() => toggleActive(r)}
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      {r.is_active ? <><Eye size={12} /> On</> : <><EyeOff size={12} /> Off</>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating) && (
        <EditorModal
          initial={editing ?? (creating as any)}
          isNew={!!creating}
          onCancel={() => { setEditing(null); setCreating(null); }}
          onSave={save}
          saving={saving}
        />
      )}
    </div>
  );
}

function EditorModal({
  initial,
  isNew,
  onCancel,
  onSave,
  saving,
}: {
  initial: Def | Omit<Def, "id">;
  isNew: boolean;
  onCancel: () => void;
  onSave: (row: any) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<any>({ ...initial });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto p-6">
      <div className="royal-card w-full max-w-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg">{isNew ? "New Achievement" : `Edit: ${form.slug}`}</h2>
          <button onClick={onCancel} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="col-span-2">
            <span className="text-muted-foreground">Slug</span>
            <input value={form.slug} onChange={(e) => set("slug", e.target.value)} className="w-full mt-1 px-2 py-1 rounded border border-border bg-background" />
          </label>
          <label className="col-span-2">
            <span className="text-muted-foreground">Name</span>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className="w-full mt-1 px-2 py-1 rounded border border-border bg-background" />
          </label>
          <label className="col-span-2">
            <span className="text-muted-foreground">Description</span>
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} className="w-full mt-1 px-2 py-1 rounded border border-border bg-background" rows={2} />
          </label>
          <label>
            <span className="text-muted-foreground">Type</span>
            <select value={form.achievement_type} onChange={(e) => set("achievement_type", e.target.value)} className="w-full mt-1 px-2 py-1 rounded border border-border bg-background">
              <option value="frame_unlock">frame_unlock</option>
              <option value="badge_unlock">badge_unlock</option>
              <option value="title_unlock">title_unlock</option>
              <option value="shekel_grant">shekel_grant</option>
              <option value="boost_grant">boost_grant</option>
            </select>
          </label>
          <label>
            <span className="text-muted-foreground">Rarity</span>
            <select value={form.rarity} onChange={(e) => set("rarity", e.target.value)} className="w-full mt-1 px-2 py-1 rounded border border-border bg-background">
              {["common","rare","epic","legendary","mythic"].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="col-span-2">
            <span className="text-muted-foreground">Reward payload (JSON)</span>
            <textarea
              value={JSON.stringify(form.reward_payload ?? {}, null, 2)}
              onChange={(e) => {
                try { set("reward_payload", JSON.parse(e.target.value || "{}")); } catch { /* ignore until valid */ }
              }}
              className="w-full mt-1 px-2 py-1 rounded border border-border bg-background font-mono text-[11px]"
              rows={3}
            />
          </label>
          <label className="col-span-2">
            <span className="text-muted-foreground">Requirement logic (JSON)</span>
            <textarea
              value={JSON.stringify(form.requirement_logic ?? {}, null, 2)}
              onChange={(e) => {
                try { set("requirement_logic", JSON.parse(e.target.value || "{}")); } catch { /* ignore until valid */ }
              }}
              className="w-full mt-1 px-2 py-1 rounded border border-border bg-background font-mono text-[11px]"
              rows={3}
            />
          </label>
          <label>
            <span className="text-muted-foreground">Starts at</span>
            <input type="datetime-local" value={form.starts_at ?? ""} onChange={(e) => set("starts_at", e.target.value || null)} className="w-full mt-1 px-2 py-1 rounded border border-border bg-background" />
          </label>
          <label>
            <span className="text-muted-foreground">Ends at</span>
            <input type="datetime-local" value={form.ends_at ?? ""} onChange={(e) => set("ends_at", e.target.value || null)} className="w-full mt-1 px-2 py-1 rounded border border-border bg-background" />
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_founder_only} onChange={(e) => set("is_founder_only", e.target.checked)} /> Founder-only</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_secret} onChange={(e) => set("is_secret", e.target.checked)} /> Secret</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_repeatable} onChange={(e) => set("is_repeatable", e.target.checked)} /> Repeatable</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Active</label>
          <label>
            <span className="text-muted-foreground">Display order</span>
            <input type="number" value={form.display_order} onChange={(e) => set("display_order", Number(e.target.value))} className="w-full mt-1 px-2 py-1 rounded border border-border bg-background" />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded border border-border">Cancel</button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.slug || !form.name}
            className="text-xs px-3 py-1.5 rounded bg-gradient-gold text-black font-bold inline-flex items-center gap-1 disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
