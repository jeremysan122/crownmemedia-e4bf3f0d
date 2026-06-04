// Admin: manage main categories + subcategories + review user suggestions.
import { useEffect, useState } from "react";
import { Check, X, Plus, Loader2, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  clearCategoryCache,
  fetchMainCategories,
  fetchSubcategories,
  type MainCategory,
  type Subcategory,
} from "@/lib/categories";
import { toast } from "sonner";

interface Suggestion {
  id: string;
  suggested_by: string;
  proposed_label: string;
  proposed_slug: string | null;
  rationale: string | null;
  status: string;
  main_category_id: string | null;
  created_at: string;
}

export default function AdminCategories() {
  const [mains, setMains] = useState<MainCategory[]>([]);
  const [subs, setSubs] = useState<Subcategory[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // New subcategory form
  const [newLabel, setNewLabel] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newMain, setNewMain] = useState<string>("");

  const reload = async () => {
    setLoading(true);
    const [m, s, sg] = await Promise.all([
      fetchMainCategories(true),
      fetchSubcategories(true),
      supabase
        .from("category_suggestions" as any)
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);
    setMains(m);
    setSubs(s);
    setSuggestions(((sg.data as any) || []) as Suggestion[]);
    setLoading(false);
  };
  useEffect(() => { reload(); }, []);

  const retireSub = async (id: string) => {
    setBusy(id);
    await supabase.from("subcategories" as any).update({ is_active: false }).eq("id", id);
    clearCategoryCache();
    await reload();
    setBusy(null);
  };
  const featureSub = async (id: string, value: boolean) => {
    setBusy(id);
    await supabase.from("subcategories" as any).update({ is_featured: value }).eq("id", id);
    clearCategoryCache();
    await reload();
    setBusy(null);
  };

  const createSub = async () => {
    if (!newLabel.trim() || !newMain) {
      toast.error("Choose a hub and label.");
      return;
    }
    const slug = (newSlug || newLabel)
      .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { error } = await supabase.from("subcategories" as any).insert({
      main_category_id: newMain,
      slug,
      label: newLabel.trim(),
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Subcategory created.");
    setNewLabel(""); setNewSlug(""); setNewMain("");
    clearCategoryCache();
    reload();
  };

  const approveSuggestion = async (s: Suggestion) => {
    if (!s.main_category_id) {
      toast.error("Suggestion is missing a target hub.");
      return;
    }
    setBusy(s.id);
    const slug = (s.proposed_slug || s.proposed_label)
      .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("subcategories" as any).insert({
      main_category_id: s.main_category_id,
      slug,
      label: s.proposed_label,
    });
    if (error) { toast.error(error.message); setBusy(null); return; }
    await supabase.from("category_suggestions" as any).update({
      status: "approved", reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString(),
    }).eq("id", s.id);
    clearCategoryCache();
    await reload();
    setBusy(null);
  };

  const rejectSuggestion = async (s: Suggestion) => {
    setBusy(s.id);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("category_suggestions" as any).update({
      status: "rejected", reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString(),
    }).eq("id", s.id);
    await reload();
    setBusy(null);
  };

  return (
    <main className="max-w-5xl mx-auto px-4 pb-24">
      <header className="pt-6 pb-4">
        <h1 className="font-display text-3xl">Categories</h1>
        <p className="text-sm text-muted-foreground">Manage hubs, subcategories, and user suggestions.</p>
      </header>

      {/* Pending suggestions */}
      <section className="royal-card p-4 mb-6">
        <h2 className="font-display text-sm tracking-widest text-gold mb-3">
          Pending Suggestions ({suggestions.length})
        </h2>
        {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {!loading && suggestions.length === 0 && (
          <p className="text-xs text-muted-foreground">No pending suggestions.</p>
        )}
        <div className="space-y-2">
          {suggestions.map((s) => {
            const main = mains.find((m) => m.id === s.main_category_id);
            return (
              <div key={s.id} className="flex items-start justify-between gap-3 p-3 rounded-xl bg-muted/20 border border-border">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{s.proposed_label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Hub: {main?.label ?? "—"}{s.proposed_slug ? ` · slug: ${s.proposed_slug}` : ""}
                  </p>
                  {s.rationale && <p className="text-xs mt-1">{s.rationale}</p>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => approveSuggestion(s)}
                    disabled={busy === s.id}
                    className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    {busy === s.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}Approve
                  </button>
                  <button
                    onClick={() => rejectSuggestion(s)}
                    disabled={busy === s.id}
                    className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-500/20 text-red-400 hover:bg-red-500/30 inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    <X size={11} />Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Add subcategory */}
      <section className="royal-card p-4 mb-6">
        <h2 className="font-display text-sm tracking-widest text-gold mb-3">Add Subcategory</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <select
            value={newMain}
            onChange={(e) => setNewMain(e.target.value)}
            className="px-3 py-2 rounded-xl bg-muted/30 border border-border text-sm"
          >
            <option value="">Choose hub…</option>
            {mains.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <input
            placeholder="Label"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="px-3 py-2 rounded-xl bg-muted/30 border border-border text-sm"
          />
          <input
            placeholder="slug (optional)"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            className="px-3 py-2 rounded-xl bg-muted/30 border border-border text-sm"
          />
          <button
            onClick={createSub}
            className="px-3 py-2 rounded-xl bg-gradient-gold text-primary-foreground text-xs font-bold inline-flex items-center justify-center gap-1.5"
          >
            <Plus size={14} />Create
          </button>
        </div>
      </section>

      {/* Hubs + subs */}
      <section className="space-y-4">
        {mains.map((m) => {
          const ms = subs.filter((s) => s.main_category_id === m.id);
          return (
            <div key={m.id} className="royal-card p-4">
              <header className="flex items-center justify-between mb-2">
                <h3 className={`font-display text-lg bg-gradient-to-br ${m.gradient ?? "from-amber-400 to-yellow-600"} bg-clip-text text-transparent`}>
                  {m.label}
                </h3>
                <span className="text-[11px] text-muted-foreground">{ms.length} subs</span>
              </header>
              <div className="flex flex-wrap gap-1.5">
                {ms.map((s) => (
                  <div key={s.id}
                    className={`group inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold border ${
                      s.is_active ? "border-border bg-card/40" : "border-red-500/30 bg-red-500/5 text-muted-foreground line-through"
                    }`}>
                    {s.is_featured && <Tag size={10} className="text-gold" />}
                    {s.label}
                    {s.is_active && (
                      <>
                        <button onClick={() => featureSub(s.id, !s.is_featured)} disabled={busy === s.id}
                          className="text-muted-foreground hover:text-gold ml-1" title={s.is_featured ? "Unfeature" : "Feature"}>★</button>
                        <button onClick={() => retireSub(s.id)} disabled={busy === s.id}
                          className="text-muted-foreground hover:text-red-400" title="Retire">×</button>
                      </>
                    )}
                  </div>
                ))}
                {ms.length === 0 && <p className="text-xs text-muted-foreground">No subs yet.</p>}
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
