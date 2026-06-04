// Hierarchical Main → Subcategory → Tags picker.
// Used by Upload, post edit, and admin tools. Renders compact chip groups so
// it works on mobile without falling back to deep selects.
import { useEffect, useMemo, useState } from "react";
import { Hash, Plus, Search } from "lucide-react";
import { useCategoryTree, type MainCategory, type Subcategory } from "@/lib/categories";

export interface CategoryPickerValue {
  mainSlug: string | null;
  subSlug: string | null;
  tags: string[];
}

export default function CategoryPicker({
  value,
  onChange,
  maxTags = 8,
}: {
  value: CategoryPickerValue;
  onChange: (v: CategoryPickerValue) => void;
  maxTags?: number;
}) {
  const { mains, subs, loading } = useCategoryTree();
  const [q, setQ] = useState("");
  const [tagInput, setTagInput] = useState("");

  const visibleMains = useMemo(() => {
    if (!q.trim()) return mains;
    const needle = q.toLowerCase();
    return mains.filter(
      (m) => m.label.toLowerCase().includes(needle) ||
        subs.some((s) => s.main_category_id === m.id && s.label.toLowerCase().includes(needle))
    );
  }, [mains, subs, q]);

  const visibleSubs = useMemo(() => {
    const main = mains.find((m) => m.slug === value.mainSlug);
    if (!main) return [];
    const all = subs.filter((s) => s.main_category_id === main.id);
    if (!q.trim()) return all;
    const needle = q.toLowerCase();
    return all.filter((s) => s.label.toLowerCase().includes(needle));
  }, [mains, subs, value.mainSlug, q]);

  function pickMain(m: MainCategory) {
    onChange({ ...value, mainSlug: m.slug, subSlug: null });
  }
  function pickSub(s: Subcategory) {
    onChange({ ...value, subSlug: s.slug });
  }
  function addTag() {
    const raw = tagInput.trim().replace(/^#/, "").replace(/\s+/g, "").toLowerCase();
    if (!raw) return;
    if (value.tags.includes(raw)) { setTagInput(""); return; }
    if (value.tags.length >= maxTags) return;
    onChange({ ...value, tags: [...value.tags, raw] });
    setTagInput("");
  }
  function removeTag(t: string) {
    onChange({ ...value, tags: value.tags.filter((x) => x !== t) });
  }

  if (loading) return <div className="p-4 text-xs text-muted-foreground">Loading categories…</div>;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search categories…"
          className="w-full pl-9 pr-3 py-2 rounded-xl bg-muted/30 border border-border text-sm focus:outline-none focus:border-primary/50"
        />
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold mb-2">Main Category</p>
        <div className="flex flex-wrap gap-1.5">
          {visibleMains.map((m) => {
            const active = m.slug === value.mainSlug;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => pickMain(m)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                  active
                    ? `bg-gradient-to-br ${m.gradient ?? "from-amber-400 to-yellow-600"} text-white border-transparent shadow-sm`
                    : "border-border bg-card/40 hover:border-primary/40"
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {value.mainSlug && (
        <div>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold mb-2">Subcategory</p>
          <div className="flex flex-wrap gap-1.5">
            {visibleSubs.map((s) => {
              const active = s.slug === value.subSlug;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pickSub(s)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                    active
                      ? "border-primary text-primary bg-primary/10"
                      : "border-border bg-card/30 hover:border-primary/40"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
            {visibleSubs.length === 0 && (
              <p className="text-xs text-muted-foreground">No matching subcategories. Try a different search.</p>
            )}
          </div>
        </div>
      )}

      <div>
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold mb-2">
          Tags <span className="text-muted-foreground/60">({value.tags.length}/{maxTags})</span>
        </p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => removeTag(t)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20"
            >
              <Hash size={10} />{t} ×
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
            placeholder="Add tag (e.g. transformation)"
            className="flex-1 px-3 py-2 rounded-xl bg-muted/30 border border-border text-sm focus:outline-none focus:border-primary/50"
          />
          <button
            type="button"
            onClick={addTag}
            disabled={value.tags.length >= maxTags}
            className="px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold disabled:opacity-50"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
