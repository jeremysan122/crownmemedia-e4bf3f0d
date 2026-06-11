import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImagePlus, Star, ArrowLeft, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import FilterPicker from "./upload/FilterPicker";
import { FilterId, isValidFilter, cssFor } from "@/lib/filters";
import { stripAndCompressImage } from "@/lib/mediaProcess";
import { CATEGORIES, CATEGORY_LABEL, type CrownCategory } from "@/lib/crown";

interface Props {
  postId: string;
  initialCaption: string;
  initialCoverUrl: string;
  initialFilter?: FilterId | null;
  initialCategory?: CrownCategory;
  initialCity?: string | null;
  initialState?: string | null;
  initialCountry?: string | null;
  initialImageUrls?: string[] | null;
  initialAltTexts?: string[] | null;
  /** Optimistic-concurrency precondition. Pass the post's `edited_at` you
   *  read when opening the dialog so two tabs can't silently overwrite each
   *  other — a stale save is rejected with a conflict toast. */
  initialEditedAt?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: (next: {
    caption: string;
    image_url: string;
    filter: FilterId | null;
    edited_at?: string | null;
    image_urls?: string[];
    alt_texts?: string[];
    category?: CrownCategory;
    city?: string | null;
    state?: string | null;
    country?: string | null;
  }) => void;
}

/**
 * Owner-only edit. Editable: caption, cover, filter, category, location, alt text,
 * carousel cover selection. Votes / score / battle history are protected by
 * `posts_guard_owner_updates`. The same trigger auto-stamps `edited_at`.
 */
export default function EditPostDialog({
  postId,
  initialCaption,
  initialCoverUrl,
  initialFilter,
  initialCategory = "overall",
  initialCity,
  initialState,
  initialCountry,
  initialImageUrls,
  initialAltTexts,
  initialEditedAt,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const [caption, setCaption] = useState(initialCaption);
  const [file, setFile] = useState<File | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>(
    initialImageUrls && initialImageUrls.length > 0 ? [...initialImageUrls] : [initialCoverUrl]
  );
  const [coverIdx, setCoverIdx] = useState(0);
  const [preview, setPreview] = useState<string>(imageUrls[0] ?? initialCoverUrl);
  const [filter, setFilter] = useState<FilterId>(
    isValidFilter(initialFilter ?? null) ? (initialFilter as FilterId) : "none"
  );
  const [category, setCategory] = useState<CrownCategory>(initialCategory);
  const [city, setCity] = useState(initialCity ?? "");
  const [stateField, setStateField] = useState(initialState ?? "");
  const [country, setCountry] = useState(initialCountry ?? "");
  const [altTexts, setAltTexts] = useState<string[]>(() => {
    const base = initialAltTexts ?? [];
    return imageUrls.map((_, i) => (base[i] ?? "").slice(0, 140));
  });
  const [saving, setSaving] = useState(false);

  const isMulti = imageUrls.length > 1;

  const onPick = async (f: File | null) => {
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast.error("Please choose an image"); return; }
    if (f.size > 12 * 1024 * 1024) { toast.error("Image must be under 12MB"); return; }
    try {
      const processed = await stripAndCompressImage(f);
      setFile(processed);
      setPreview(URL.createObjectURL(processed));
    } catch {
      setFile(f);
      setPreview(URL.createObjectURL(f));
    }
  };

  const setCoverTo = (i: number) => {
    setCoverIdx(i);
    setPreview(imageUrls[i]);
    setFile(null); // a replaced cover takes priority; switching back clears it
  };

  // Reorder a thumbnail by delta. Keeps altTexts in sync and adjusts coverIdx
  // so the same photo stays selected as cover after moving.
  const moveThumb = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= imageUrls.length) return;
    const nextUrls = [...imageUrls];
    const [u] = nextUrls.splice(i, 1);
    nextUrls.splice(j, 0, u);
    const nextAlts = [...altTexts];
    const [a] = nextAlts.splice(i, 1);
    nextAlts.splice(j, 0, a ?? "");
    setImageUrls(nextUrls);
    setAltTexts(nextAlts);
    setCoverIdx((cur) => {
      if (cur === i) return j;
      if (cur === j) return i;
      return cur;
    });
    if (coverIdx === i) setPreview(nextUrls[j]);
  };

  const save = async () => {
    if (!user) return;
    if (!city.trim() || !country.trim()) {
      toast.error("City and country are required");
      return;
    }
    setSaving(true);
    let uploadedPath: string | null = null;
    try {
      // 1. If owner replaced the cover, upload the new file and swap it into imageUrls
      let nextUrls = [...imageUrls];
      if (file) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${user.id}/${postId}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("media").upload(path, file, { upsert: false, contentType: file.type });
        if (upErr) throw upErr;
        uploadedPath = path;
        const newUrl = supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
        nextUrls[coverIdx] = newUrl;
      }

      // 2. Reorder so chosen cover is index 0 (image_url trigger keeps them in sync)
      if (coverIdx !== 0) {
        const reordered = [nextUrls[coverIdx], ...nextUrls.filter((_, i) => i !== coverIdx)];
        const reorderedAlts = [
          altTexts[coverIdx] ?? "",
          ...altTexts.filter((_, i) => i !== coverIdx),
        ];
        nextUrls = reordered;
        setAltTexts(reorderedAlts);
      }

      const nextFilter: FilterId | null = filter === "none" ? null : filter;
      const trimmedAlts = nextUrls.map((_, i) => (altTexts[i] ?? "").trim().slice(0, 140));
      const editedAt = new Date().toISOString();

      let query = supabase
        .from("posts")
        .update({
          edited_at: editedAt,
          caption: caption.trim(),
          image_url: nextUrls[0],
          image_urls: nextUrls,
          alt_texts: trimmedAlts,
          filter: nextFilter,
          photo_filter: nextFilter,
          filter_type: nextFilter ? "photo" : null,
          category,
          city: city.trim(),
          state: stateField.trim() || null,
          country: country.trim(),
        } as any)
        .eq("id", postId);
      // Optimistic-concurrency guard: only update if the row's edited_at
      // still matches what we read when the dialog opened. If another
      // tab/device edited the post meanwhile the trigger will have bumped
      // edited_at, the predicate misses, and the update affects 0 rows —
      // we surface that as a conflict instead of silently overwriting.
      if (initialEditedAt) {
        query = query.eq("edited_at", initialEditedAt);
      }
      const { data: row, error } = await query
        .select("caption, image_url, image_urls, alt_texts, filter, category, city, state, country, edited_at")
        .maybeSingle();
      if (error) throw error;
      if (!row && initialEditedAt) {
        trackEvent("post_edit_conflict", { postId });
        toast.error("This post was edited somewhere else. Close and reopen to load the latest version.");
        return;
      }
      // Safety-affecting fields (caption, media, category, location) kick the
      // background moderation edge function so it can re-score the edited
      // post. Instant-publish model: the post stays live unless moderation
      // (service_role) decides to move it to pending_review / rejected /
      // sensitive. Every edit is still recorded in `post_edits_audit` via
      // the `posts_write_edit_audit` trigger.
      const safetyAffecting =
        caption.trim() !== (initialCaption ?? "") ||
        !!file ||
        category !== initialCategory ||
        city.trim() !== (initialCity ?? "") ||
        (stateField.trim() || null) !== (initialState ?? null) ||
        country.trim() !== (initialCountry ?? "");
      if (safetyAffecting) {
        try {
          void supabase.functions.invoke("moderate-media", {
            body: { post_id: postId, reason: "edit_recheck" },
          });
        } catch { /* non-fatal: scheduled scanners pick it up */ }
      }
      trackEvent("post_edited", {
        postId,
        metadata: { changed_image: !!file, filter: nextFilter, recategorized: category !== initialCategory, safety_recheck: safetyAffecting },
      });
      // We don't know the moderation outcome yet — the post stays live until
      // moderation says otherwise. Surface a neutral success and let the
      // background flip do its job (Pending list will show it if demoted).
      toast.success("Post updated");

      const next = {
        caption: (row?.caption ?? caption) as string,
        image_url: (row?.image_url ?? nextUrls[0]) as string,
        image_urls: ((row?.image_urls as string[] | null) ?? nextUrls) as string[],
        alt_texts: ((row?.alt_texts as string[] | null) ?? trimmedAlts) as string[],
        filter: ((row?.filter as FilterId | null) ?? nextFilter) as FilterId | null,
        edited_at: (row?.edited_at as string | null) ?? editedAt,
        category: ((row?.category as CrownCategory) ?? category) as CrownCategory,
        city: (row?.city ?? city.trim()) as string,
        state: (row?.state ?? (stateField.trim() || null)) as string | null,
        country: (row?.country ?? country.trim()) as string,
      };
      try {
        window.dispatchEvent(new CustomEvent("post:updated", { detail: { id: postId, ...next } }));
      } catch { /* noop */ }
      try {
        const { broadcastCacheInvalidation } = await import("@/lib/cacheInvalidate");
        broadcastCacheInvalidation({ kind: safetyAffecting ? "post:moderation_changed" : "post:updated", postId, userId: user.id });
      } catch { /* noop */ }
      onSaved?.(next);
      onOpenChange(false);
    } catch (e) {
      if (uploadedPath) {
        try { await supabase.storage.from("media").remove([uploadedPath]); } catch { /* noop */ }
      }
      const msg = e instanceof Error ? e.message : "Update failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-5">
        <DialogHeader className="mb-2">
          <DialogTitle className="text-base">Edit post</DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="aspect-[4/3] sm:aspect-square w-full max-h-[36vh] sm:max-h-none bg-muted rounded-xl overflow-hidden relative flex items-center justify-center">
              {preview && (
                <img
                  src={preview}
                  alt="Cover preview"
                  className="w-full h-full object-contain"
                  style={{ filter: filter === "none" ? "none" : cssFor(filter) }}
                />
              )}
            </div>
            {isMulti && (
              <>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                  {imageUrls.map((u, i) => (
                    <div key={u + i} className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setCoverTo(i)}
                        className={`relative size-14 rounded-md overflow-hidden border-2 transition-all ${
                          i === coverIdx ? "border-primary shadow-md" : "border-transparent opacity-70 hover:opacity-100"
                        }`}
                        aria-label={`Set photo ${i + 1} as cover`}
                      >
                        <img loading="lazy" src={u} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                        {i === coverIdx && (
                          <span className="absolute top-0.5 right-0.5 size-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                            <Star size={9} fill="currentColor" />
                          </span>
                        )}
                      </button>
                      <div className="absolute -bottom-0.5 inset-x-0 flex justify-between px-0.5">
                        <button
                          type="button"
                          onClick={() => moveThumb(i, -1)}
                          disabled={i === 0}
                          aria-label={`Move photo ${i + 1} earlier`}
                          className="size-4 rounded-full bg-background/90 border border-border flex items-center justify-center disabled:opacity-30 hover:bg-primary hover:text-primary-foreground"
                        >
                          <ArrowLeft size={9} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveThumb(i, 1)}
                          disabled={i === imageUrls.length - 1}
                          aria-label={`Move photo ${i + 1} later`}
                          className="size-4 rounded-full bg-background/90 border border-border flex items-center justify-center disabled:opacity-30 hover:bg-primary hover:text-primary-foreground"
                        >
                          <ArrowRight size={9} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">Tap a thumbnail to set as cover. Use the arrows to reorder.</p>
              </>
            )}
            <label className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-border hover:border-primary/60 cursor-pointer text-xs">
              <ImagePlus size={14} />
              {isMulti ? `Replace cover photo (${coverIdx + 1})` : "Replace cover photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <div className="space-y-3 min-w-0">
            <FilterPicker previewUrl={preview} mediaType="image" selected={filter} onSelect={setFilter} />

            <div className="space-y-1.5">
              <Label htmlFor="caption" className="text-xs">Caption</Label>
              <Textarea
                id="caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={500}
                rows={3}
                className="text-sm"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Votes & history preserved.</span>
                <span className="tabular-nums">{caption.length}/500</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as CrownCategory)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">City *</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">State</Label>
                <Input value={stateField} onChange={(e) => setStateField(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Country *</Label>
                <Input value={country} onChange={(e) => setCountry(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
          </div>
        </div>

        {/* Alt text inputs */}
        <div className="space-y-1.5 mt-2">
          <Label className="text-[11px] uppercase tracking-widest">Alt text (accessibility)</Label>
          <div className="space-y-1.5">
            {imageUrls.map((_, i) => (
              <div key={`alt-${i}`} className="flex items-center gap-2">
                <span className="text-[10px] tabular-nums text-muted-foreground w-5">{i + 1}.</span>
                <Input
                  value={altTexts[i] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.slice(0, 140);
                    setAltTexts((prev) => {
                      const next = [...prev];
                      next[i] = v;
                      return next;
                    });
                  }}
                  placeholder={`Describe photo ${i + 1} for screen readers`}
                  className="bg-input h-8 text-xs"
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="mt-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving} className="bg-gradient-gold text-primary-foreground">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
