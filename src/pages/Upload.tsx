import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { Switch } from "@/components/ui/switch";
import { CATEGORIES, CrownCategory } from "@/lib/crown";
import { CategoryBadge } from "@/lib/categoryIcons";
import { ImagePlus, Crown, X, Star, Camera, Video as VideoIcon, GripVertical, Trash2, Loader2, Crop, RotateCw, Sparkles, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { logRawError, toFriendlyMessage } from "@/lib/settingsSecurityErrors";
import { validateUpload } from "@/lib/uploadValidation";
import { isRateLimitError, RATE_LIMIT_FRIENDLY_MESSAGE } from "@/lib/rateLimit";
import {
  isHeic,
  convertHeicToJpeg,
  probeImage,
  probeVideo,
  stripAndCompressImage,
  captureVideoPoster,
  sha256File,
  trimVideo,
  sampleVideoFrames,
} from "@/lib/mediaProcess";
import { clearDraft, loadDraft, loadDraftFiles, saveDraft, saveDraftFiles } from "@/lib/uploadDraft";
import { uploadWithProgress, runWithConcurrency } from "@/lib/storageUpload";
import { ArrowUp, ArrowDown, Move } from "lucide-react";
import CameraCapture from "@/components/upload/CameraCapture";
import CropEditor from "@/components/upload/CropEditor";
import FilterPicker from "@/components/upload/FilterPicker";
import FilterOverlay from "@/components/FilterOverlay";
import TagPeopleInput, { type TaggedProfile } from "@/components/TagPeopleInput";
import { cssFor, FilterId } from "@/lib/filters";
import { trackEvent } from "@/lib/analytics";
import { Calendar as CalendarIcon, Users, Hash, MapPin, ChevronDown } from "lucide-react";
import { fetchMainCategories, fetchSubcategories, type MainCategory, type Subcategory } from "@/lib/categories";
import CategoryPicker, { type CategoryPickerValue } from "@/components/categories/CategoryPicker";
import { validateUploadSelection } from "@/lib/contentType";
import { runPickPipeline, type PickItem } from "@/lib/pickPipeline";

const MAX_PHOTOS = 10;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;          // 8MB raw input
// Single source of truth for the client-side video capacity limit. Server
// trigger (`validate_post_media_upload`) and the storage bucket
// `file_size_limit` are aligned to the same 250 MB ceiling — see the
// `bump_video_upload_capacity_250mb` migration. Duration cap stays at 30s
// because Scrolls are short-form; longer clips are rejected at pick time.
const MAX_VIDEO_BYTES = 250 * 1024 * 1024;         // 250MB raw input
const MAX_VIDEO_MB = 250;
const MAX_VIDEO_MS = 30_000;                        // 30s hard cap
const MAX_DIM = 6000;                               // sanity ceiling

type MediaOrigin = "camera" | "gallery" | "paste" | "import";

interface PickedPhoto {
  id: string;            // stable for drag/drop
  file: File;
  preview: string;
  alt: string;
  uploaded?: { path: string; url: string };
  uploading?: boolean;
  progress?: number;
  error?: string;
  origin?: MediaOrigin;
  /** True once Lovable AI has filled in alt text automatically. */
  altAuto?: boolean;
  /** Auto alt-text generation state, surfaced as a chip in the alt list. */
  altStatus?: "running" | "done" | "failed";
  altError?: string;
}

interface PickedVideo {
  file: File;
  preview: string;
  durationMs: number;
  /** Real intrinsic dimensions read from the file (probeVideo). Never a
   * placeholder — Scroll validation and stored media_width/media_height
   * rely on these being truthful. */
  width: number;
  height: number;
  uploaded?: { path: string; url: string };
  posterUploaded?: { path: string; url: string };
  posterError?: string;
  error?: string;
  posterFile?: File;
  posterPreview?: string;
  posterAtSec?: number;
  origin?: MediaOrigin;
}

type Mode = "photo" | "video";

export default function Upload() {
  const { user, profile, refreshProfile } = useAuth();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const cloudDraftId = searchParams.get("draft");
  const [savingDraft, setSavingDraft] = useState(false);

  // Post vs Scroll: separates the main feed (Post) from the vertical Scrolls
  // surface. `?type=scroll` deep-links into Scroll creation from the Profile
  // empty state. Picking Scroll forces video mode (vertical 9:16, ≤30s).
  const initialContentType = (searchParams.get("type") === "scroll" ? "scroll" : "post") as "post" | "scroll";
  const [contentType, setContentType] = useState<"post" | "scroll">(initialContentType);
  const [mode, setMode] = useState<Mode>(initialContentType === "scroll" ? "video" : "photo");
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [video, setVideo] = useState<PickedVideo | null>(null);

  const [caption, setCaption] = useState("");
  const [category, setCategory] = useState<CrownCategory>("overall");
  const [city, setCity] = useState(profile?.city || "");
  const [state, setState] = useState(profile?.state || "");
  const [country, setCountry] = useState(profile?.country || "");
  const [filter, setFilter] = useState<FilterId>("none");
  const [scheduledFor, setScheduledFor] = useState<string>("");
  const [tagged, setTagged] = useState<TaggedProfile[]>([]);
  const [isSensitive, setIsSensitive] = useState(false);
  const [sensitiveReason, setSensitiveReason] = useState("");
  // ── Post location (see /map). Default OFF — location is per-POST, never
  // pulled from the user's profile or device silently. Exact coords only land
  // on the post when the user explicitly picks "Use my current location".
  const [locationMode, setLocationMode] = useState<"none" | "manual" | "current">("none");
  const [postLat, setPostLat] = useState<number | null>(null);
  const [postLng, setPostLng] = useState<number | null>(null);
  const [locationCapturedAt, setLocationCapturedAt] = useState<string | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationPermissionDenied, setLocationPermissionDenied] = useState(false);
  const cityInputRef = useRef<HTMLInputElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  // ── Category system (Master Category + Topic + tags) ──
  // The picker is the source of truth. The legacy `category` enum is kept
  // in sync from the chosen topic's legacy_enum so existing crown/leaderboard
  // logic keeps working unchanged.
  const [catSubs, setCatSubs] = useState<Subcategory[]>([]);
  const [catMains, setCatMains] = useState<MainCategory[]>([]);
  const [pickerVal, setPickerVal] = useState<CategoryPickerValue>({ mainSlug: null, subSlug: null, tags: [] });
  useEffect(() => {
    Promise.all([fetchMainCategories(), fetchSubcategories()]).then(([m, s]) => {
      setCatMains(m); setCatSubs(s);
    });
  }, []);
  // Hydrate picker from legacy `category` (drafts) once categories are loaded
  // and the user hasn't picked anything yet.
  useEffect(() => {
    if (pickerVal.subSlug || catSubs.length === 0) return;
    const sub = catSubs.find((s) => s.legacy_enum === category);
    if (!sub) return;
    const main = catMains.find((m) => m.id === sub.main_category_id);
    if (!main) return;
    setPickerVal((v) => ({ ...v, mainSlug: main.slug, subSlug: sub.slug }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catSubs, catMains]);
  const derivedSub = useMemo(
    () => catSubs.find((s) => s.slug === pickerVal.subSlug) ?? null,
    [catSubs, pickerVal.subSlug]
  );
  const derivedMain = useMemo(
    () => catMains.find((m) => m.slug === pickerVal.mainSlug) ?? null,
    [catMains, pickerVal.mainSlug]
  );
  // Keep legacy enum aligned with chosen topic for downstream consumers.
  useEffect(() => {
    if (derivedSub?.legacy_enum && derivedSub.legacy_enum !== category) {
      setCategory(derivedSub.legacy_enum as CrownCategory);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedSub?.legacy_enum]);
  const [cameraOpen, setCameraOpen] = useState<null | Mode>(null);
  // Crop editor state — when set, the user is reviewing a captured/picked photo
  // before it gets added to the photos array. `fromCamera` lets the "Retake"
  // button send the user back to the camera instead of just closing.
  // `editingId` re-crops an existing photo in-place instead of appending.
  const [pendingCrop, setPendingCrop] = useState<{ file: File; fromCamera: boolean; editingId?: string; origin?: MediaOrigin } | null>(null);
  // Remaining gallery picks waiting their turn in the crop editor.
  const [cropQueue, setCropQueue] = useState<{ file: File; origin: MediaOrigin }[]>([]);
  // Upload progress + states
  const [uploadStage, setUploadStage] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState<number>(0); // 0..100
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Per-file pick progress (HEIC convert + validate). null = idle.
  const [pickItems, setPickItems] = useState<PickItem[] | null>(null);
  const pickCancelRef = useRef(false);
  const [pickError, setPickError] = useState<
    | { fileName: string; message: string; retry: () => void }
    | null
  >(null);
  const [draftRestored, setDraftRestored] = useState(false);

  // Stable per-attempt idempotency key — regenerated only after a successful
  // post or after the draft is cleared. The DB enforces uniqueness on
  // (user_id, submission_key), so retries / double-taps cannot create dupes.
  const submissionKeyRef = useRef<string>(crypto.randomUUID());
  // Hard re-entry guard for the submit handler (defends against fast double-clicks
  // before React state updates the disabled prop).
  const inflightRef = useRef(false);
  // AbortController for in-flight upload — lets the user cancel mid-upload.
  const uploadAbortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);

  // Tap-to-move reorder state — for mobile users who can't easily drag.
  const [reorderMode, setReorderMode] = useState(false);

  // ────────── Draft persistence ──────────
  // Restore fields + binary photos (from IndexedDB) once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const d = loadDraft();
      if (!d) return;
      if (cancelled) return;
      setCaption(d.caption);
      setCategory(d.category);
      setCity(d.city || profile?.city || "");
      setState(d.state || profile?.state || "");
      setCountry(d.country || profile?.country || "");
      setFilter(d.filter);
      // Try to restore photos from IndexedDB.
      const blobs = await loadDraftFiles();
      if (cancelled || blobs.length === 0) {
        if (d.photos.length > 0) {
          toast.info("Draft text restored — please re-pick your photos");
        }
        setDraftRestored(true);
        return;
      }
      const byId = new Map(blobs.map((b) => [b.id, b.file]));
      let restored: PickedPhoto[] = d.photos
        .map((p) => {
          const f = byId.get(p.id);
          if (!f) return null;
          return { id: p.id, file: f, preview: URL.createObjectURL(f), alt: p.alt };
        })
        .filter((x): x is PickedPhoto => x !== null);
      // Re-apply chosen cover (move to index 0).
      const coverId = d.coverId ?? (typeof d.coverIndex === "number" ? d.photos[d.coverIndex]?.id : null);
      if (coverId) {
        const ci = restored.findIndex((x) => x.id === coverId);
        if (ci > 0) {
          const [c] = restored.splice(ci, 1);
          restored = [c, ...restored];
        }
      }
      if (restored.length > 0) {
        setPhotos(restored);
        setMode("photo");
      }
      setDraftRestored(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save draft on changes (debounced).
  useEffect(() => {
    if (success) return;
    const t = setTimeout(() => {
      saveDraft({
        caption, category, city, state, country, filter,
        photos: photos.map((p) => ({ id: p.id, alt: p.alt, fileName: p.file.name, fileType: p.file.type })),
        coverIndex: 0,
        coverId: photos[0]?.id ?? null,
        savedAt: Date.now(),
      });
      void saveDraftFiles(photos.map((p) => ({ id: p.id, file: p.file })));
    }, 400);
    return () => clearTimeout(t);
  }, [caption, category, city, state, country, filter, photos, success]);

  // ────────── Cloud draft hydration (?draft=<id>) ──────────
  // Restores caption/category/location/filter AND any photos that were
  // uploaded with the draft so the user can publish without re-picking.
  useEffect(() => {
    if (!cloudDraftId || !user?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("post_drafts" as any)
        .select("caption, category, city, state, country, photo_filter, image_urls")
        .eq("id", cloudDraftId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled || error || !data) return;
      const d: any = data;
      if (typeof d.caption === "string") setCaption(d.caption);
      if (d.category && CATEGORIES.includes(d.category)) setCategory(d.category as CrownCategory);
      if (typeof d.city === "string") setCity(d.city);
      if (typeof d.state === "string") setState(d.state);
      if (typeof d.country === "string") setCountry(d.country);
      if (d.photo_filter) setFilter(d.photo_filter as FilterId);

      const urls: string[] = Array.isArray(d.image_urls) ? d.image_urls.filter((u: any) => typeof u === "string" && u) : [];
      if (urls.length === 0) {
        toast.info("Cloud draft loaded — re-pick your photos to publish");
        return;
      }
      // Re-hydrate photos as PickedPhoto entries with already-uploaded URLs so
      // publish can skip re-uploading them.
      try {
        const restored: PickedPhoto[] = [];
        for (let i = 0; i < urls.length; i++) {
          const u = urls[i];
          const res = await fetch(u);
          if (!res.ok) continue;
          const blob = await res.blob();
          const file = new File([blob], `draft_${i}.jpg`, { type: blob.type || "image/jpeg" });
          // Storage path is everything after `/media/` in the public URL.
          const m = u.match(/\/object\/public\/media\/(.+)$/);
          const path = m ? decodeURIComponent(m[1]) : "";
          restored.push({
            id: crypto.randomUUID(),
            file,
            preview: URL.createObjectURL(file),
            alt: "",
            uploaded: path ? { path, url: u } : undefined,
          });
        }
        if (cancelled) {
          restored.forEach((p) => URL.revokeObjectURL(p.preview));
          return;
        }
        if (restored.length > 0) {
          setPhotos(restored);
          setMode("photo");
          toast.success("Cloud draft loaded with photos");
        } else {
          toast.info("Cloud draft loaded — re-pick your photos to publish");
        }
      } catch {
        toast.info("Cloud draft loaded — re-pick your photos to publish");
      }
    })();
    return () => { cancelled = true; };
  }, [cloudDraftId, user?.id]);

  // Save current draft to the cloud, including any picked photos. Photos are
  // uploaded to the same `media` bucket under a `drafts/<user>/<draftKey>/`
  // prefix so they're easy to clean up later and don't pollute the post path.
  const draftKeyRef = useRef<string>(crypto.randomUUID());
  const saveCloudDraft = async () => {
    if (!user?.id) { toast.error("Sign in to save drafts"); return; }
    setSavingDraft(true);
    try {
      // Re-use already uploaded URLs and only upload photos that don't have one yet.
      const urls: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const p = photos[i];
        if (p.uploaded?.url) { urls.push(p.uploaded.url); continue; }
        let toUpload = p.file;
        try {
          const dims = await probeImage(toUpload);
          if (dims.width !== 1080 || dims.height !== 1080 || toUpload.type !== "image/jpeg") {
            toUpload = await stripAndCompressImage(toUpload);
          }
        } catch { /* fall through with original */ }
        const path = `${user.id}/drafts/${draftKeyRef.current}_${i}_${p.id}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("media")
          .upload(path, toUpload, { upsert: true, contentType: "image/jpeg", cacheControl: "31536000" });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
        urls.push(pub.publicUrl);
        // Mark in local state so we don't re-upload on subsequent saves.
        setPhotos((cur) => cur.map((x) => x.id === p.id ? { ...x, uploaded: { path, url: pub.publicUrl } } : x));
      }

      const payload = {
        user_id: user.id,
        caption,
        category,
        city,
        state,
        country,
        photo_filter: filter,
        image_urls: urls,
        cover_url: urls[0] ?? null,
      };
      if (cloudDraftId) {
        const { error } = await supabase
          .from("post_drafts" as any)
          .update(payload)
          .eq("id", cloudDraftId)
          .eq("user_id", user.id);
        if (error) throw error;
        toast.success(urls.length ? `Draft updated with ${urls.length} photo${urls.length === 1 ? "" : "s"}` : "Draft updated");
      } else {
        const { error } = await supabase.from("post_drafts" as any).insert(payload);
        if (error) throw error;
        toast.success(urls.length ? `Draft saved with ${urls.length} photo${urls.length === 1 ? "" : "s"}` : "Draft saved to cloud");
      }
    } catch (e: any) {
      logRawError(e, "generic", { feature: "upload_save_draft" });
      toast.error(toFriendlyMessage(e, "generic"));
    } finally {
      setSavingDraft(false);
    }
  };

  // ────────── Object URL cleanup on unmount ──────────
  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
      if (video) URL.revokeObjectURL(video.preview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ────────── File pickers ──────────
  // Gallery picks are validated then queued through the crop editor one-by-one
  // so the user can frame each photo before it lands in the preview.
  const onPickPhotos = async (files: FileList | null, origin: MediaOrigin = "gallery") => {
    if (!files || files.length === 0) return;
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) { toast.error(`Max ${MAX_PHOTOS} photos`); return; }
    const existingHashes = new Set<string>();
    for (const p of photos) {
      try { existingHashes.add(await sha256File(p.file)); } catch { /* noop */ }
    }
    const queue = Array.from(files).slice(0, remaining);
    setPickError(null);
    pickCancelRef.current = false;
    try {
      const result = await runPickPipeline({
        files: queue,
        existingHashes,
        isCancelled: () => pickCancelRef.current,
        onProgress: (items) => setPickItems(items),
        deps: {
          isHeic,
          convertHeicToJpeg,
          probeImage,
          sha256File,
          maxBytes: MAX_PHOTO_BYTES,
          maxDim: MAX_DIM,
        },
      });

      // Surface a single retryable error for the first HEIC conversion failure.
      const firstConvertFail = result.items.find(
        (it) => it.status === "failed" && /HEIC/i.test(it.error ?? ""),
      );
      if (firstConvertFail) {
        setPickError({
          fileName: firstConvertFail.name,
          message: firstConvertFail.error ?? "Conversion failed.",
          retry: () => onPickPhotos(files, origin),
        });
      } else {
        // Non-HEIC failures get inline toasts so the user knows which files were skipped.
        for (const it of result.items) {
          if (it.status === "failed") toast.error(it.error ?? `${it.name} was skipped`);
        }
      }

      if (result.cancelled) {
        toast.info("Upload cancelled");
        return;
      }

      const valid = result.valid.map((file) => ({ file, origin }));
      if (valid.length === 0) return;
      const [first, ...rest] = valid;
      if (rest.length > 0) {
        const extras: PickedPhoto[] = rest.map((r) => ({
          id: crypto.randomUUID(),
          file: r.file,
          preview: URL.createObjectURL(r.file),
          alt: "",
          origin: r.origin,
        }));
        setPhotos((p) => [...p, ...extras]);
        setMode("photo");
        if (video) { URL.revokeObjectURL(video.preview); setVideo(null); }
      }
      setCropQueue([]);
      setPendingCrop({ file: first.file, fromCamera: false, origin: first.origin });
    } finally {
      setPickItems(null);
      pickCancelRef.current = false;
    }
  };

  const onPickVideo = async (file: File | null, origin: MediaOrigin = "gallery") => {
    if (!file) return;
    if (!file.type.startsWith("video/")) { toast.error("Not a video file"); return; }
    const vcheck = validateUpload(file, "post_video");
    if (!vcheck.ok) { toast.error(vcheck.message); return; }
    if (file.size > MAX_VIDEO_BYTES) { toast.error("Video must be under 80MB"); return; }
    try {
      const meta = await probeVideo(file);
      if (meta.durationMs > MAX_VIDEO_MS) {
        toast.error(`Video must be 30s or less (got ${(meta.durationMs / 1000).toFixed(1)}s)`);
        return;
      }
      if (video) URL.revokeObjectURL(video.preview);
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
      setPhotos([]);
      setVideo({ file, preview: URL.createObjectURL(file), durationMs: meta.durationMs, width: meta.width, height: meta.height, origin });
      setMode("video");
    } catch {
      toast.error("Couldn't read this video");
    }
  };

  const onCameraCapture = async (file: File, kind: "photo" | "video") => {
    setCameraOpen(null);
    if (kind === "photo") {
      const remaining = MAX_PHOTOS - photos.length;
      if (remaining <= 0) { toast.error(`Max ${MAX_PHOTOS} photos`); return; }
      setPendingCrop({ file, fromCamera: true, origin: "camera" });
    } else {
      try {
        const meta = await probeVideo(file);
        if (video) URL.revokeObjectURL(video.preview);
        photos.forEach((p) => URL.revokeObjectURL(p.preview));
        setPhotos([]);
        setVideo({ file, preview: URL.createObjectURL(file), durationMs: meta.durationMs, width: meta.width, height: meta.height, origin: "camera" });
        setMode("video");
      } catch {
        toast.error("Couldn't read recorded video");
      }
    }
  };

  const onCropConfirm = (cropped: File) => {
    const editingId = pendingCrop?.editingId;
    const pickOrigin: MediaOrigin = pendingCrop?.origin ?? "gallery";
    if (editingId) {
      setPhotos((p) => p.map((x) => {
        if (x.id !== editingId) return x;
        URL.revokeObjectURL(x.preview);
        return { ...x, file: cropped, preview: URL.createObjectURL(cropped), uploaded: undefined, error: undefined };
      }));
    } else {
      const picked: PickedPhoto = {
        id: crypto.randomUUID(),
        file: cropped,
        preview: URL.createObjectURL(cropped),
        alt: "",
        origin: pickOrigin,
      };
      setPhotos((p) => [...p, picked]);
      setMode("photo");
      if (video) {
        URL.revokeObjectURL(video.preview);
        setVideo(null);
      }
    }
    if (cropQueue.length > 0) {
      const [next, ...rest] = cropQueue;
      setCropQueue(rest);
      setPendingCrop({ file: next.file, fromCamera: false, origin: next.origin });
    } else {
      setPendingCrop(null);
    }
  };

  const onCropRetake = () => {
    setPendingCrop(null);
    setCameraOpen("photo");
  };

  const onCropCancel = () => {
    // Cancelling drops the rest of the queue too — predictable behavior.
    setPendingCrop(null);
    setCropQueue([]);
  };

  const editPhoto = (id: string) => {
    const target = photos.find((x) => x.id === id);
    if (!target) return;
    setPendingCrop({ file: target.file, fromCamera: false, editingId: id });
  };

  // ────────── Photo grid manipulation ──────────
  const removePhoto = (id: string) => {
    setPhotos((p) => {
      const target = p.find((x) => x.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return p.filter((x) => x.id !== id);
    });
  };

  const setAlt = (id: string, alt: string) => {
    setPhotos((p) => p.map((x) => (x.id === id ? { ...x, alt } : x)));
  };

  // Set selected thumbnail as cover (move to index 0).
  const setAsCover = (id: string) => {
    setPhotos((p) => {
      const i = p.findIndex((x) => x.id === id);
      if (i <= 0) return p;
      const next = [...p];
      const [moved] = next.splice(i, 1);
      next.unshift(moved);
      return next;
    });
    toast.success("Cover updated");
  };

  // Move a photo by delta (used by tap-to-move reorder mode).
  const movePhoto = (id: string, delta: number) => {
    setPhotos((p) => {
      const i = p.findIndex((x) => x.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= p.length) return p;
      const next = [...p];
      const [moved] = next.splice(i, 1);
      next.splice(j, 0, moved);
      return next;
    });
  };

  // ────────── Drag-to-reorder (HTML5 DnD) ──────────
  const dragId = useRef<string | null>(null);
  const onDragStart = (id: string) => { dragId.current = id; };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const onDrop = (overId: string) => {
    const from = dragId.current;
    dragId.current = null;
    if (!from || from === overId) return;
    setPhotos((p) => {
      const fi = p.findIndex((x) => x.id === from);
      const ti = p.findIndex((x) => x.id === overId);
      if (fi < 0 || ti < 0) return p;
      const next = [...p];
      const [moved] = next.splice(fi, 1);
      next.splice(ti, 0, moved);
      return next;
    });
  };

  // ────────── Submit ──────────
  const validation = useMemo(() => {
    if (mode === "photo" && photos.length === 0) return "Add at least one photo";
    if (mode === "video" && !video) return "Record or pick a video";
    if (!pickerVal.mainSlug) return "Pick a master category";
    if (!pickerVal.subSlug) return "Pick a topic inside that category";
    if (derivedSub && derivedMain && derivedSub.main_category_id !== derivedMain.id) {
      return "Topic doesn't belong to the chosen category";
    }
    // Location is now optional and per-POST — required only when the creator
    // explicitly picked "Manual city".
    if (locationMode === "manual" && (!city.trim() || !country.trim())) {
      return "Enter city and country, or switch location off";
    }
    if (locationMode === "current" && (postLat == null || postLng == null)) {
      return "Waiting for location — allow permission or switch to city/none";
    }
    // Scheduling is hidden until server-side release exists (audit P0-#5).
    // Any leftover scheduledFor value from restored drafts is ignored below —
    // we never send it in the payload, so every post publishes immediately.
    // Post vs Scroll: enforce surface-specific media rules client-side using
    // REAL media dimensions. The publish RPC re-validates content_type
    // independently — this is UX only.
    const ctErr = validateUploadSelection(contentType, mode, {
      width: mode === "video" ? (video?.width ?? null) : null,
      height: mode === "video" ? (video?.height ?? null) : null,
      durationMs: mode === "video" ? (video?.durationMs ?? null) : null,
    });
    if (ctErr) return ctErr;
    return null;
  }, [mode, photos, video, city, country, scheduledFor, pickerVal.mainSlug, pickerVal.subSlug, derivedSub, derivedMain, contentType, locationMode, postLat, postLng]);

  const cancelUpload = () => {
    cancelledRef.current = true;
    uploadAbortRef.current?.abort();
  };

  const submit = async () => {
    if (!user) return;
    if (validation) { toast.error(validation); return; }
    // Hard re-entry guard — blocks double-taps even before React re-renders disabled.
    if (inflightRef.current || submitting) return;
    inflightRef.current = true;
    cancelledRef.current = false;
    uploadAbortRef.current = new AbortController();
    setSubmitting(true);
    setUploadError(null);
    setUploadProgress(0);
    setUploadStage("Preparing…");

    // Track everything we put into storage so we can clean up on failure.
    const uploaded: { bucket: "media"; path: string }[] = [];
    const checkCancel = () => {
      if (cancelledRef.current) throw new Error("__cancelled__");
    };

    try {
      let imageUrls: string[] = [];
      let videoUrl: string | null = null;
      let videoPosterUrl: string | null = null;
      let durationMs: number | null = null;
      const autoAlts: string[] = [];

      if (mode === "photo") {
        const total = photos.length;
        const collected: string[] = new Array(total);
        photos.forEach((p, i) => { if (p.uploaded?.url) collected[i] = p.uploaded.url; });

        // Duplicate detection removed — users can re-post any photo.
        const needsHashCheck = photos.filter((p) => !p.uploaded?.url);

        // ─── Parallel uploads with real byte-level progress ───
        // Pool to 3 concurrent uploads so 10 photos finish in ~3 batches.
        setUploadStage(`Uploading ${needsHashCheck.length || total} photo${(needsHashCheck.length || total) === 1 ? "" : "s"}…`);
        // Per-photo progress map → overall %.
        const perProgress = new Map<string, number>(photos.map((p) => [p.id, p.uploaded ? 1 : 0]));
        const recomputeOverall = () => {
          let sum = 0;
          perProgress.forEach((v) => { sum += v; });
          setUploadProgress(Math.round((sum / total) * 90));
        };

        await runWithConcurrency(
          photos.map((p, i) => ({ p, i })),
          async ({ p, i }) => {
            checkCancel();
            if (p.uploaded?.url) return;
            setPhotos((cur) => cur.map((x) => (x.id === p.id ? { ...x, uploading: true, progress: 0, error: undefined } : x)));
            let toUpload = p.file;
            let dims = await probeImage(toUpload);
            if (dims.width !== 1080 || dims.height !== 1080 || toUpload.type !== "image/jpeg") {
              toUpload = await stripAndCompressImage(toUpload);
              dims = await probeImage(toUpload);
              if (dims.width !== 1080 || dims.height !== 1080) {
                throw new Error(`Photo ${i + 1} couldn't be cropped to 1080×1080.`);
              }
            }
            const path = `${user.id}/${submissionKeyRef.current}_${i}_${p.id}.jpg`;
            try {
              const result = await uploadWithProgress(path, toUpload, {
                contentType: "image/jpeg",
                signal: uploadAbortRef.current?.signal,
                onProgress: (r) => {
                  perProgress.set(p.id, r);
                  recomputeOverall();
                  setPhotos((cur) => cur.map((x) => (x.id === p.id ? { ...x, progress: Math.round(r * 100) } : x)));
                },
              });
              uploaded.push({ bucket: "media", path: result.path });
              collected[i] = result.publicUrl;
              perProgress.set(p.id, 1);
              recomputeOverall();
              setPhotos((cur) => cur.map((x) => (x.id === p.id ? { ...x, uploading: false, progress: 100, uploaded: { path: result.path, url: result.publicUrl }, error: undefined } : x)));
            } catch (err) {
              logRawError(err, "generic", { feature: "upload_photo_upload", photo_id: p.id });
              setPhotos((cur) => cur.map((x) => (x.id === p.id ? { ...x, uploading: false, error: "Couldn't upload this photo. Tap to retry." } : x)));
              throw err;
            }
          },
          3,
        );
        imageUrls = collected.filter(Boolean);

        // ─── Auto alt-text (accessibility) ───
        // For any photo the user left blank, ask Lovable AI to describe it.
        // Failures are non-fatal — we just leave the alt empty.
        const needsAlt = photos
          .map((p, i) => ({ p, i, url: collected[i] }))
          .filter((x) => x.url && !x.p.alt.trim());
        if (needsAlt.length > 0) {
          setUploadStage(`Writing alt text for ${needsAlt.length} photo${needsAlt.length > 1 ? "s" : ""}…`);
          setPhotos((cur) => cur.map((x) =>
            needsAlt.find((n) => n.p.id === x.id) ? { ...x, altStatus: "running", altError: undefined } : x
          ));
          await runWithConcurrency(needsAlt, async ({ p, i, url }) => {
            try {
              const { data, error } = await supabase.functions.invoke("generate-alt-text", {
                body: { image_url: url },
              });
              if (error) throw error;
              const alt = (data?.alt ?? "").toString().trim();
              if (alt) {
                autoAlts[i] = alt;
                setPhotos((cur) => cur.map((x) => (x.id === p.id ? { ...x, alt, altAuto: true, altStatus: "done" } : x)));
              } else {
                setPhotos((cur) => cur.map((x) => (x.id === p.id ? { ...x, altStatus: "failed", altError: "No description" } : x)));
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Failed";
              setPhotos((cur) => cur.map((x) => (x.id === p.id ? { ...x, altStatus: "failed", altError: msg } : x)));
            }
          }, 3);
        }
      } else if (mode === "video" && video) {
        const ext = video.file.name.split(".").pop() || "webm";
        const vPath = video.uploaded?.path ?? `${user.id}/video_${submissionKeyRef.current}.${ext}`;
        if (video.uploaded?.url) {
          setUploadStage("Video already uploaded — finishing…");
          setUploadProgress(80);
          videoUrl = video.uploaded.url;
        } else {
          setUploadStage("Uploading video…");
          try {
            const result = await uploadWithProgress(vPath, video.file, {
              contentType: video.file.type,
              signal: uploadAbortRef.current?.signal,
              onProgress: (r) => setUploadProgress(Math.round(r * 70)),
            });
            uploaded.push({ bucket: "media", path: result.path });
            videoUrl = result.publicUrl;
            setVideo((cur) => (cur ? { ...cur, uploaded: { path: result.path, url: result.publicUrl }, error: undefined } : cur));
          } catch (vErr) {
            const msg = vErr instanceof Error ? vErr.message : "Video upload failed";
            setVideo((cur) => (cur ? { ...cur, error: msg } : cur));
            throw vErr;
          }
        }
        durationMs = video.durationMs;
        setUploadProgress(72);

        if (video.posterUploaded?.url) {
          videoPosterUrl = video.posterUploaded.url;
          imageUrls = [videoPosterUrl];
        } else {
          setUploadStage(video.posterFile ? "Uploading chosen frame…" : "Generating preview frame…");
          try {
            const poster = video.posterFile ?? await captureVideoPoster(video.file);
            if (!poster) throw new Error("Could not generate preview frame");
            const pPath = `${user.id}/poster_${submissionKeyRef.current}.jpg`;
            const result = await uploadWithProgress(pPath, poster, {
              contentType: "image/jpeg",
              signal: uploadAbortRef.current?.signal,
            });
            uploaded.push({ bucket: "media", path: result.path });
            videoPosterUrl = result.publicUrl;
            imageUrls = [videoPosterUrl];
            setVideo((cur) => (cur ? { ...cur, posterUploaded: { path: result.path, url: result.publicUrl }, posterError: undefined } : cur));
          } catch (pe) {
            const msg = pe instanceof Error ? pe.message : "Preview frame upload failed";
            setVideo((cur) => (cur ? { ...cur, posterError: msg } : cur));
            toast.warning("Couldn't make a preview thumbnail — you can retry it after posting.");
          }
        }

        // ─── Video frame moderation ───
        // Sample 5 frames across the clip, upload to a temp scratch path, and
        // moderate. Any unsafe frame blocks publish. Scratch files are removed
        // after the check regardless of verdict.
        setUploadStage("Sampling video frames for safety check…");
        const frames = await sampleVideoFrames(video.file, 5);
        const framePaths: string[] = [];
        if (frames.length > 0) {
          try {
            // Upload the 5 sampled frames in parallel — sequential uploads
            // here used to add seconds of stall time on slow connections.
            const uploaded = await runWithConcurrency(
              frames,
              async (frame, fi) => {
                const fp = `${user.id}/_scratch/frames_${submissionKeyRef.current}_${fi}.jpg`;
                const r = await uploadWithProgress(fp, frame, { contentType: "image/jpeg" });
                return r;
              },
              5,
            );
            const frameUrls = uploaded.map((u) => u.publicUrl);
            uploaded.forEach((u) => framePaths.push(u.path));
            setUploadStage("Checking content safety…");
            const { data: vVerdict, error: vModErr } = await supabase.functions.invoke("moderate-media", {
              body: { image_urls: frameUrls, kind: "video" },
            });
            if (!vModErr && vVerdict?.safe === false) {
              throw new Error(`Blocked: ${vVerdict.reason || "Video flagged as unsafe."}`);
            }
          } finally {
            // Always remove scratch frames — don't leak them into permanent storage.
            if (framePaths.length > 0) {
              try { await supabase.storage.from("media").remove(framePaths); } catch { /* noop */ }
            }
          }
        }

        if (imageUrls.length === 0 && videoUrl) imageUrls = [videoUrl];
        setUploadProgress(90);
      }

      // ─── Pre-publish safety check ───
      // Run NSFW/violence moderation on the uploaded image URLs. Server fails
      // open on infra errors so users aren't blocked by transient gateway issues.
      const toModerate = imageUrls.filter(Boolean).slice(0, 6);
      if (toModerate.length > 0) {
        setUploadStage("Reviewing media safety…");
        try {
          const { data: verdict, error: modErr } = await supabase.functions.invoke("moderate-media", {
            body: { image_urls: toModerate },
          });
          if (modErr) {
            // Network/function error — log and proceed. (We don't want infra to gate posting.)
            console.warn("moderation invoke failed", modErr);
          } else if (verdict && verdict.safe === false) {
            const reason = (verdict.reason as string) || "Content flagged as not safe for the feed.";
            throw new Error(`Blocked: ${reason}`);
          }
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("Blocked:")) throw e;
          console.warn("moderation skipped", e);
        }
      }

      const filterId = filter === "none" ? null : filter;
      const captionLc = caption.toLowerCase();
      const extraTags = pickerVal.tags.filter((t) => !captionLc.includes(`#${t}`));
      const finalCaption = (
        extraTags.length > 0 ? `${caption}${caption ? " " : ""}${extraTags.map((t) => `#${t}`).join(" ")}` : caption
      ).slice(0, 500);

      // ─── Idempotent publish via SECURITY DEFINER RPC ───
      // Instant-publish model: new posts default to `approved` and appear on
      // public surfaces immediately. The RPC dedupes on
      // (user_id, client_request_id) so refreshes, retries, and multi-tab
      // publishes can't create duplicates. Background moderation
      // (moderate-media edge function + reports + admin actions) is the only
      // path that can later flip the post to pending_review / rejected /
      // sensitive — it runs after publish, not before.
      setUploadStage("Publishing…");
      const payload = {
        image_url: imageUrls[0],
        image_urls: imageUrls,
        caption: finalCaption,
        category,
        // city/state/country only when the creator picked manual location.
        // Never send silently — the Crown Map pins the crowned POST, and we
        // don't want stale profile-defaults leaking into a "no location" post.
        city: locationMode === "manual" ? city.trim() : null,
        state: locationMode === "manual" ? state.trim() : null,
        country: locationMode === "manual" ? country.trim() : null,
        media_type: mode === "photo" ? "image" : "video",
        video_url: videoUrl,
        video_poster_url: videoPosterUrl,
        duration_ms: durationMs,
        filter: filterId,
        photo_filter: mode === "photo" ? filterId : null,
        video_filter: mode === "video" ? filterId : null,
        filter_type: filterId ? mode : null,
        alt_texts: mode === "photo"
          ? photos.map((p, i) => (p.alt.trim() || autoAlts[i] || "")).slice(0, imageUrls.length)
          : [],
        // Real media dimensions (audit P0-#3). Photos are normalised to
        // 1080x1080 by mediaProcess; videos carry the intrinsic dimensions
        // read from the source file at pick / trim time.
        media_width: mode === "photo" ? 1080 : (video?.width ?? null),
        media_height: mode === "photo" ? 1080 : (video?.height ?? null),
        // Persisted framing so downstream surfaces don't have to guess.
        aspect_ratio:
          contentType === "scroll"
            ? "9:16"
            : mode === "photo"
              ? "1:1"
              : (video && video.width && video.height ? `${video.width}:${video.height}` : null),
        tagged_user_ids: tagged.map((t) => t.id),
        media_origin: mode === "photo" ? (photos[0]?.origin ?? "gallery") : (video?.origin ?? "gallery"),
        is_sensitive: isSensitive,
        sensitive_reason: isSensitive ? (sensitiveReason.trim().slice(0, 120) || null) : null,
        main_category_slug: derivedMain?.slug ?? null,
        subcategory_slug: derivedSub?.slug ?? null,
        content_type: contentType,
        // Per-post location. `location_source='none'` (the default) tells the
        // publish RPC + trigger to store nothing sensitive on the row.
        location_enabled: locationMode !== "none",
        location_source: locationMode === "current" ? "current_location"
                       : locationMode === "manual"  ? "manual"
                       : "none",
        location_label: locationMode === "current" && postLat != null && postLng != null
          ? `${postLat.toFixed(4)}, ${postLng.toFixed(4)}`
          : locationMode === "manual"
          ? [city.trim(), state.trim(), country.trim()].filter(Boolean).join(", ")
          : null,
        region_name: locationMode === "manual" ? (city.trim() || null) : null,
        region_type: locationMode === "manual" && city.trim() ? "city" : null,
        post_lat: locationMode === "current" ? postLat : null,
        post_lng: locationMode === "current" ? postLng : null,
        post_location_precision: locationMode === "current" ? "exact"
                               : locationMode === "manual"  ? "city"
                               : "none",
        location_captured_at: locationMode === "current" ? locationCapturedAt : null,
      };

      const { data: published, error } = await supabase.rpc("publish_post_idempotent" as any, {
        p_client_request_id: submissionKeyRef.current,
        p_payload: payload as any,
      });
      if (error) throw error;
      // ─── Commit boundary (audit P0-#8) ───
      // Once the RPC succeeds, the post row exists and owns every uploaded
      // asset. Any error after this point (profile refresh, cache broadcast,
      // etc.) must NOT delete the media — the post would exist with dead
      // URLs. Clear the `uploaded` tracker so the catch block's cleanup
      // becomes a no-op.
      const postCommitted = true;
      uploaded.length = 0;
      void postCommitted;
      const publishedRow = (published ?? null) as { id?: string; publish_status?: string; created_at?: string } | null;
      const publishStatus = publishedRow?.publish_status ?? "approved";
      // If the RPC returned a row older than ~5s, it's a dedup-hit — the post
      // was created on a previous attempt with this same client_request_id.
      const wasExisting = !!publishedRow?.created_at &&
        Date.now() - new Date(publishedRow.created_at).getTime() > 5000;
      trackEvent("post_publish_submitted", {
        metadata: { publishStatus, deduped: wasExisting },
      });

      // Kick off background AI media analysis (Gemini 2.5 Flash via Lovable AI
      // Gateway). It runs once per post, writes safety/OCR/category results to
      // `post_media_ai_analysis`, and may flip the post to
      // sensitive/pending_review. Fire-and-forget so we never block the UI.
      // The existing `moderate-media` pre-publish gate above still runs as a
      // hard NSFW block; this new function is the deeper post-publish pass.
      if (publishedRow?.id && !wasExisting) {
        try {
          void supabase.functions.invoke("analyze-post-media", {
            body: { post_id: publishedRow.id },
          });
        } catch { /* non-fatal: admin can re-trigger or scheduled scanners pick it up */ }
      }

      setUploadProgress(100);
      // The post is live; AI media analysis runs in the background. Reflect
      // that in the success label so users know review may still mark the
      // post sensitive or send it to pending_review shortly after publish.
      const statusLabel =
        publishStatus === "approved" ? "Published! Analyzing media in background…" :
        publishStatus === "rejected" ? "Rejected" :
        publishStatus === "pending_review" ? "Post is being reviewed" :
        wasExisting ? "Already published" :
        "Published!";
      setUploadStage(statusLabel);
      if (wasExisting) trackEvent("post_publish_deduped");

      if (tagged.length > 0) {
        trackEvent("post_tagged_people", { metadata: { count: tagged.length } });
      }
      clearDraft();

      // Photo-hash recording disabled — duplicate uploads are allowed.

      submissionKeyRef.current = crypto.randomUUID();
      setSuccess(true);
      (window as any).__crownmePendingReview = publishStatus !== "approved";
      await refreshProfile();
      try {
        const { broadcastCacheInvalidation } = await import("@/lib/cacheInvalidate");
        broadcastCacheInvalidation({ kind: "post:published", postId: (published as any)?.id, userId: user.id });
      } catch { /* noop */ }
      try {
        localStorage.setItem("crownme:feed:tab", "global");
        localStorage.removeItem("crownme:feed:tag");
      } catch { /* noop */ }
      setTimeout(() => nav("/feed"), 1700);
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Upload failed";
      const isCancel = raw === "__cancelled__";
      // Always clean up orphaned media on failure — the publish RPC is the
      // sole writer that attaches files to a post, so any uploads still
      // dangling at this point are guaranteed orphans for this session.
      // The server-side cleanup_orphaned_media RPC is the fallback safety
      // net for partial failures the client never gets to handle.
      // Only reachable on pre-commit failures — post-commit paths clear
      // `uploaded` immediately after the RPC succeeds (audit P0-#8).
      if (uploaded.length) {
        try {
          await supabase.storage.from("media").remove(uploaded.map((u) => u.path));
        } catch { /* noop */ }
        // Clear cached upload URLs from composer state so a retry re-uploads
        // to fresh paths instead of publishing the URLs we just deleted
        // (audit P0-#7).
        setPhotos((cur) => cur.map((x) => ({ ...x, uploading: false, progress: 0, uploaded: undefined, error: undefined })));
        setVideo((cur) => (cur ? { ...cur, uploaded: undefined, posterUploaded: undefined, error: undefined, posterError: undefined } : cur));
      }
      if (isCancel) {
        setUploadError(null);
        setUploadStage("");
        setUploadProgress(0);
        toast("Upload cancelled");
      } else {
        // Translate the two server-side guards that are otherwise opaque.
        const friendly = isRateLimitError(e)
          ? RATE_LIMIT_FRIENDLY_MESSAGE
          : /row-level security/i.test(raw)
            ? "Upload blocked: please retake the photo with the in-app camera or pick a JPG/PNG/WEBP file (HEIC and other formats are rejected)."
            : /1080x1080|1080×1080|Media must be exactly/i.test(raw)
              ? "Photo must be exactly 1080×1080. Try the in-app camera or pick a different file — it will be auto-cropped."
              : toFriendlyMessage(e, "generic");
        setUploadError(friendly);
        setUploadStage("Upload failed");
        toast.error(friendly);
      }
    } finally {
      setSubmitting(false);
      inflightRef.current = false;
      uploadAbortRef.current = null;
    }
  };

  // ────────── Hooks that must run on every render (declared before any early return) ──────────
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);
  const [trimRange, setTrimRange] = useState<[number, number] | null>(null);
  const [trimming, setTrimming] = useState(false);
  const [trimProgress, setTrimProgress] = useState(0);

  // ────────── Render ──────────
  if (success) {
    const pending = typeof window !== "undefined" && (window as any).__crownmePendingReview === true;
    return (
      <AppShell title="UPLOAD">
        <div className="flex flex-col items-center justify-center py-32 px-6 text-center animate-scale-in">
          <Crown size={80} className="text-primary animate-crown-pulse mb-6" fill="currentColor" />
          <h2 className="font-display text-3xl text-gold mb-2">
            {pending ? "In review" : "Your crown race has begun"}
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            {pending
              ? "Moderation flagged this one for a closer look. You'll find it in your Pending list and we'll publish it as soon as it clears."
              : "Your post is live — returning to feed…"}
          </p>
        </div>
      </AppShell>
    );
  }


  const canAddMore = photos.length < MAX_PHOTOS;
  const canSubmit = !submitting && !validation;
  const previewSrc = mode === "video" ? video?.preview : photos[0]?.preview;


  const onDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  };
  const onDragOverPage = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDropPage = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const first = files[0];
    if (first.type.startsWith("video/")) {
      setMode("video");
      onPickVideo(first);
    } else {
      setMode("photo");
      onPickPhotos(files);
    }
  };

  // ─── Clipboard paste (Ctrl/Cmd+V on desktop) ───
  // Lets users paste a screenshot or copied image straight into the composer.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      let videoFile: File | null = null;
      for (const item of Array.from(items)) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (!file) continue;
        if (file.type.startsWith("image/")) imageFiles.push(file);
        else if (file.type.startsWith("video/") && !videoFile) videoFile = file;
      }
      if (imageFiles.length === 0 && !videoFile) return;
      e.preventDefault();
      if (imageFiles.length > 0) {
        const dt = new DataTransfer();
        imageFiles.forEach((f) => dt.items.add(f));
        setMode("photo");
        void onPickPhotos(dt.files);
        toast.success(`Pasted ${imageFiles.length} image${imageFiles.length === 1 ? "" : "s"}`);
      } else if (videoFile) {
        setMode("video");
        void onPickVideo(videoFile);
        toast.success("Pasted video");
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [photos.length]);

  // ─── Beforeunload guard ───
  // Warn the user before navigating away with unsaved picks or mid-upload.
  useEffect(() => {
    const hasWork = submitting || photos.length > 0 || !!video;
    if (!hasWork || success) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [submitting, photos.length, video, success]);


  // ─── Video trim state is declared above the early return ───

  // Reset trim range when the user swaps the video.
  useEffect(() => {
    if (video) setTrimRange([0, Math.min(MAX_VIDEO_MS, video.durationMs) / 1000]);
    else setTrimRange(null);
  }, [video?.preview]);

  const applyTrim = async () => {
    if (!video || !trimRange) return;
    const [s, e] = trimRange;
    if (e - s < 0.5) { toast.error("Trim selection too short"); return; }
    setTrimming(true);
    setTrimProgress(0);
    try {
      const trimmed = await trimVideo(video.file, s, e, (r) => setTrimProgress(Math.round(r * 100)));
      const meta = await probeVideo(trimmed);
      URL.revokeObjectURL(video.preview);
      if (video.posterPreview) URL.revokeObjectURL(video.posterPreview);
      setVideo({
        file: trimmed,
        preview: URL.createObjectURL(trimmed),
        durationMs: meta.durationMs,
        width: meta.width,
        height: meta.height,
      });
      toast.success(`Trimmed to ${(meta.durationMs / 1000).toFixed(1)}s`);
    } catch (err) {
      logRawError(err, "generic", { feature: "upload_video_trim" });
      toast.error("Couldn't trim this video. Try again.");
    } finally {
      setTrimming(false);
    }
  };

  return (
    <AppShell title="UPLOAD">
      <div
        className="px-4 py-4 space-y-4 relative"
        onDragEnter={onDragEnter}
        onDragOver={onDragOverPage}
        onDragLeave={onDragLeave}
        onDrop={onDropPage}
      >
        {isDragging && (
          <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <div className="border-2 border-dashed border-primary rounded-2xl p-10 text-center bg-card/80">
              <ImagePlus size={48} className="mx-auto text-primary mb-2" />
              <p className="font-display text-xl text-gold">Drop to upload</p>
              <p className="text-xs text-muted-foreground mt-1">Photos (JPG/PNG/WebP) or video (MP4/WebM, ≤30s)</p>
            </div>
          </div>
        )}
        {pickItems && (() => {
          const total = pickItems.length;
          const done = pickItems.filter((it) => it.status === "done" || it.status === "failed" || it.status === "cancelled").length;
          const active = pickItems.find((it) => it.status === "converting" || it.status === "validating");
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <div
              role="status"
              aria-live="polite"
              data-testid="pick-progress"
              className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center px-6"
            >
              <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl space-y-3">
                <div className="text-center">
                  <Loader2 className="mx-auto h-7 w-7 text-primary animate-spin" />
                  <p className="font-display text-base text-gold mt-2">
                    {active?.status === "converting" ? "Converting photo…" : "Preparing photos…"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {done} of {total} processed
                  </p>
                </div>
                <Progress value={pct} className="h-2" />
                <ul className="max-h-48 overflow-y-auto space-y-1 text-[11px]" data-testid="pick-progress-list">
                  {pickItems.map((it, idx) => (
                    <li
                      key={`${it.name}-${idx}`}
                      data-testid="pick-progress-item"
                      data-status={it.status}
                      className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-muted/30"
                    >
                      <span className="truncate flex-1 text-foreground">{it.name}</span>
                      <span
                        className={
                          it.status === "failed"
                            ? "text-destructive"
                            : it.status === "done"
                            ? "text-primary"
                            : it.status === "cancelled"
                            ? "text-muted-foreground italic"
                            : "text-muted-foreground"
                        }
                      >
                        {it.status === "converting"
                          ? "Converting…"
                          : it.status === "validating"
                          ? "Checking…"
                          : it.status === "done"
                          ? "Ready"
                          : it.status === "failed"
                          ? "Failed"
                          : it.status === "cancelled"
                          ? "Cancelled"
                          : "Waiting"}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  data-testid="pick-progress-cancel"
                  onClick={() => { pickCancelRef.current = true; }}
                  className="w-full rounded-lg border border-border bg-muted/40 text-foreground text-sm py-2 hover:bg-muted"
                >
                  Cancel
                </button>
                <p className="text-[10px] text-muted-foreground text-center">HEIC photos from iPhone can take a few seconds.</p>
              </div>
            </div>
          );
        })()}
        {pickError && (
          <div
            role="alertdialog"
            aria-live="assertive"
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center px-6"
          >
            <div className="w-full max-w-xs rounded-2xl border border-destructive/40 bg-card p-5 shadow-xl text-center space-y-3">
              <AlertTriangle className="mx-auto h-7 w-7 text-destructive" />
              <div>
                <p className="font-display text-base text-destructive">Photo couldn't be processed</p>
                <p className="text-xs text-muted-foreground mt-1 break-words">{pickError.message}</p>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPickError(null)}
                  className="flex-1 rounded-lg border border-border bg-muted/40 text-foreground text-sm py-2 hover:bg-muted"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={() => { const r = pickError.retry; setPickError(null); r(); }}
                  className="flex-1 rounded-lg bg-primary text-primary-foreground text-sm py-2 hover:bg-primary/90"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}
        <h1 className="font-display text-2xl text-gold">Enter the race</h1>

        {draftRestored && (
          <div className="text-[11px] text-muted-foreground bg-muted/40 border border-border rounded-lg px-3 py-2 flex items-center justify-between">
            <span>Draft restored from your last session.</span>
            <button onClick={() => { clearDraft(); setDraftRestored(false); }} className="text-primary hover:underline">
              Clear draft
            </button>
          </div>
        )}

        {/* Post vs Scroll selector — determines content_type and the allowed
            sizing/mode. Picking Scroll forces video and surfaces the 9:16 hint. */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setContentType("post")}
            className={`h-12 rounded-lg text-left px-3 border transition ${contentType === "post" ? "bg-gradient-gold text-primary-foreground border-transparent gold-shadow" : "bg-card/60 border-border text-muted-foreground"}`}
            aria-pressed={contentType === "post"}
          >
            <div className="text-xs font-bold uppercase tracking-widest">Post</div>
            <div className="text-[10px] opacity-80">Feed & profile · 1:1 or 4:5</div>
          </button>
          <button
            type="button"
            onClick={() => { setContentType("scroll"); setMode("video"); }}
            className={`h-12 rounded-lg text-left px-3 border transition ${contentType === "scroll" ? "bg-gradient-gold text-primary-foreground border-transparent gold-shadow" : "bg-card/60 border-border text-muted-foreground"}`}
            aria-pressed={contentType === "scroll"}
          >
            <div className="text-xs font-bold uppercase tracking-widest">Scroll</div>
            <div className="text-[10px] opacity-80">Vertical 9:16 · up to 30s</div>
          </button>
        </div>

        {/* Mode toggle — Photos is hidden for Scrolls (scrolls are video-only). */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("photo")}
            disabled={contentType === "scroll"}
            className={`h-10 rounded-lg text-xs font-bold uppercase tracking-widest border transition disabled:opacity-40 disabled:cursor-not-allowed ${mode === "photo" ? "bg-gradient-gold text-primary-foreground border-transparent gold-shadow" : "bg-card/60 border-border text-muted-foreground"}`}
          >
            Photos
          </button>
          <button
            type="button"
            onClick={() => setMode("video")}
            className={`h-10 rounded-lg text-xs font-bold uppercase tracking-widest border transition ${mode === "video" ? "bg-gradient-gold text-primary-foreground border-transparent gold-shadow" : "bg-card/60 border-border text-muted-foreground"}`}
          >
            Video · 30s
          </button>
        </div>


        {/* Capture / upload */}
        {mode === "photo" ? (
          photos.length === 0 ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCameraOpen("photo")}
                className="aspect-square rounded-2xl border-2 border-dashed border-primary/40 bg-card/40 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/70"
              >
                <Camera size={36} />
                <span className="text-sm">Use camera</span>
              </button>
              <label className="aspect-square rounded-2xl border-2 border-dashed border-primary/40 bg-card/40 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/70 cursor-pointer">
                <ImagePlus size={36} />
                <span className="text-sm">Choose photos</span>
                <span className="text-[10px]">JPG/PNG · max 8MB · up to {MAX_PHOTOS}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple className="hidden" onChange={(e) => { onPickPhotos(e.target.files); e.target.value = ""; }} />
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Swipeable preview carousel with live filter */}
              <div className="aspect-square rounded-2xl overflow-hidden border border-primary/40 relative bg-muted">
                <div className="flex h-full w-full overflow-x-auto snap-x snap-mandatory scrollbar-none">
                  {photos.map((p, i) => (
                    <div key={p.id} className="relative shrink-0 w-full h-full snap-center">
                      <img loading="lazy" src={p.preview} alt={p.alt || `Photo ${i + 1}`} className="w-full h-full object-cover" style={{ filter: cssFor(filter) }} />
                      <FilterOverlay filter={filter} />
                    </div>
                  ))}
                </div>
                <span className="pointer-events-none absolute top-2 left-2 px-2 py-1 rounded-full bg-gradient-gold text-primary-foreground text-[10px] font-bold tracking-wider flex items-center gap-1">
                  <Star size={10} fill="currentColor" /> COVER
                </span>
                <span className="pointer-events-none absolute top-2 right-2 px-2 py-1 rounded-full glass text-[10px] font-bold tabular-nums">
                  {photos.length}/{MAX_PHOTOS}
                </span>
                {photos.length > 1 && (
                  <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full glass text-[10px] font-semibold">
                    Swipe ←  →
                  </span>
                )}
              </div>

              {/* Reorder mode toggle (mobile-friendly) */}
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Tap a thumbnail to set as cover.</span>
                <button
                  type="button"
                  onClick={() => setReorderMode((v) => !v)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-full border ${reorderMode ? "bg-gradient-gold text-primary-foreground border-transparent" : "border-border text-muted-foreground"}`}
                >
                  <Move size={11} /> {reorderMode ? "Done" : "Reorder"}
                </button>
              </div>

              {/* Thumbnail strip */}
              <div className="grid grid-cols-5 gap-2">
                {photos.map((p, i) => (
                  <div
                    key={p.id}
                    draggable={!reorderMode}
                    onDragStart={() => onDragStart(p.id)}
                    onDragOver={onDragOver}
                    onDrop={() => onDrop(p.id)}
                    onClick={() => { if (!reorderMode) setAsCover(p.id); }}
                    className={`relative aspect-square rounded-lg overflow-hidden border cursor-pointer ${i === 0 ? "border-primary ring-1 ring-primary" : "border-border"} ${p.error ? "border-destructive" : ""}`}
                    title={reorderMode ? "Use arrows to reorder" : "Tap to set as cover"}
                  >
                    <img loading="lazy" src={p.preview} alt={p.alt || `Photo ${i + 1}`} className="w-full h-full object-cover" style={{ filter: cssFor(filter) }} />
                    <FilterOverlay filter={filter} />
                    {i === 0 && (
                      <span className="absolute top-0.5 left-0.5 px-1 py-0.5 rounded-full bg-gradient-gold text-primary-foreground text-[8px] font-bold tracking-wider flex items-center gap-0.5">
                        <Star size={7} fill="currentColor" /> COVER
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removePhoto(p.id); }}
                      className="absolute top-0.5 right-0.5 size-5 rounded-full bg-background/80 hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center"
                      aria-label={`Remove photo ${i + 1}`}
                    >
                      <X size={11} />
                    </button>
                    {!reorderMode && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); editPhoto(p.id); }}
                        className="absolute bottom-0.5 right-0.5 size-5 rounded-full bg-background/80 hover:bg-primary hover:text-primary-foreground flex items-center justify-center"
                        aria-label={`Re-crop photo ${i + 1}`}
                        title="Re-crop"
                      >
                        <Crop size={10} />
                      </button>
                    )}
                    <span className="absolute bottom-0.5 left-0.5 size-4 rounded-full bg-background/80 text-[9px] font-bold flex items-center justify-center tabular-nums">
                      {i + 1}
                    </span>
                    {reorderMode && (
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-background/85 px-1 py-0.5">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); movePhoto(p.id, -1); }}
                          disabled={i === 0}
                          className="size-5 rounded-full hover:bg-primary/20 disabled:opacity-30 flex items-center justify-center"
                          aria-label={`Move photo ${i + 1} earlier`}
                        >
                          <ArrowUp size={11} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); movePhoto(p.id, 1); }}
                          disabled={i === photos.length - 1}
                          className="size-5 rounded-full hover:bg-primary/20 disabled:opacity-30 flex items-center justify-center"
                          aria-label={`Move photo ${i + 1} later`}
                        >
                          <ArrowDown size={11} />
                        </button>
                      </div>
                    )}
                    {p.uploaded && (
                      <span className="absolute inset-x-0 top-0 h-0.5 bg-emerald-500" aria-label="Uploaded" />
                    )}
                    {p.uploading && (
                      <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                        <Loader2 size={16} className="animate-spin text-primary" />
                      </div>
                    )}
                    {p.error && !p.uploading && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Clear the per-photo error so the next submit retries it.
                          setPhotos((cur) => cur.map((x) => (x.id === p.id ? { ...x, error: undefined } : x)));
                          toast.info("Tap Post to retry this photo");
                        }}
                        className="absolute inset-x-0 bottom-0 bg-destructive text-destructive-foreground text-[9px] font-bold py-0.5 flex items-center justify-center gap-1 hover:bg-destructive/80"
                        title={p.error}
                      >
                        <RotateCw size={9} /> Retry
                      </button>
                    )}
                  </div>
                ))}
                {canAddMore && (
                  <label className="aspect-square rounded-lg border-2 border-dashed border-primary/40 bg-card/40 flex items-center justify-center cursor-pointer text-muted-foreground hover:border-primary/70">
                    <ImagePlus size={20} />
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple className="hidden" onChange={(e) => { onPickPhotos(e.target.files); e.target.value = ""; }} />
                  </label>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">Tap a thumbnail to set as cover. Use Reorder mode for tap-to-move, or drag thumbnails on desktop. The cover (1) shows first on your post.</p>

              {/* Alt text inputs (collapsed list) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] uppercase tracking-widest">Alt text (accessibility)</Label>
                  {photos.some((p) => p.altStatus === "running") && (
                    <span className="text-[10px] flex items-center gap-1 text-muted-foreground">
                      <Loader2 size={10} className="animate-spin" /> Writing alt text…
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">Leave blank to auto-generate with AI after upload.</p>
                {photos.map((p, i) => (
                  <div key={`alt-${p.id}`} className="flex items-center gap-2">
                    <span className="text-[10px] tabular-nums text-muted-foreground w-5">{i + 1}.</span>
                    <Input
                      value={p.alt}
                      onChange={(e) => setAlt(p.id, e.target.value.slice(0, 140))}
                      placeholder={`Describe photo ${i + 1} for screen readers`}
                      className="bg-input h-8 text-xs"
                    />
                    {p.altStatus === "running" && (
                      <span className="text-[10px] flex items-center gap-1 text-muted-foreground shrink-0" aria-label="Generating alt text">
                        <Loader2 size={10} className="animate-spin" /> AI
                      </span>
                    )}
                    {p.altStatus === "done" && p.altAuto && (
                      <span className="text-[10px] flex items-center gap-1 text-emerald-500 shrink-0" aria-label="Alt text auto-generated">
                        <Sparkles size={10} /> Auto
                      </span>
                    )}
                    {p.altStatus === "failed" && (
                      <span className="text-[10px] text-destructive shrink-0" title={p.altError ?? ""} aria-label="Alt text generation failed">
                        Failed
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        ) : (
          /* VIDEO mode */
          video ? (
            <div className="space-y-2">
              <div className="aspect-square rounded-2xl overflow-hidden border border-primary/40 relative bg-black">
                <video src={video.preview} controls playsInline className="w-full h-full object-cover" style={{ filter: cssFor(filter) }} />
                <FilterOverlay filter={filter} />
                <span className="absolute top-2 left-2 px-2 py-1 rounded-full bg-gradient-gold text-primary-foreground text-[10px] font-bold tracking-wider">
                  VIDEO · {(video.durationMs / 1000).toFixed(1)}s
                </span>
                <button
                  type="button"
                  onClick={() => { URL.revokeObjectURL(video.preview); if (video.posterPreview) URL.revokeObjectURL(video.posterPreview); setVideo(null); }}
                  className="absolute top-2 right-2 size-7 rounded-full bg-background/80 hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center"
                  aria-label="Remove video"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Video trim is disabled (audit P0-#9). The in-browser
                  re-encode path was silently stripping the audio track and
                  producing a lossy copy on every re-attempt. Scrolls are
                  bounded to 30s via `validateUploadSelection`; longer clips
                  are rejected outright at pick time instead of being
                  silently cropped. Original audio + bitrate are preserved. */}

              {/* Video poster picker — scrub a frame to become the cover thumbnail */}

              <div className="rounded-xl border border-border bg-card/40 p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
                    Cover frame
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {((video.posterAtSec ?? video.durationMs / 1000 * 0.1) || 0).toFixed(1)}s
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="size-16 shrink-0 rounded-md overflow-hidden border border-border bg-muted">
                    {video.posterPreview ? (
                      <img loading="lazy" src={video.posterPreview} alt="Chosen cover frame" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full grid place-items-center text-[9px] text-muted-foreground text-center px-1">
                        Auto<br/>frame
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0.1, video.durationMs / 1000)}
                      step={0.1}
                      defaultValue={video.durationMs / 1000 * 0.1}
                      onChange={async (e) => {
                        const sec = parseFloat(e.target.value);
                        const file = await captureVideoPoster(video.file, sec);
                        if (!file) { toast.error("Couldn't grab that frame"); return; }
                        setVideo((cur) => {
                          if (!cur) return cur;
                          if (cur.posterPreview) URL.revokeObjectURL(cur.posterPreview);
                          return {
                            ...cur,
                            posterFile: file,
                            posterPreview: URL.createObjectURL(file),
                            posterAtSec: sec,
                            posterUploaded: undefined,
                            posterError: undefined,
                          };
                        });
                      }}
                      className="w-full accent-primary"
                      aria-label="Scrub to choose cover frame"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Slide to pick the frame shown on the feed.
                    </p>
                  </div>
                </div>
              </div>

              {video.posterError && !video.posterUploaded && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs flex items-center gap-2">
                  <span className="flex-1 text-destructive">Preview thumbnail failed: {video.posterError}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!user || !video) return;
                      setVideo((cur) => cur ? { ...cur, posterError: undefined } : cur);
                      try {
                        const poster = await captureVideoPoster(video.file);
                        if (!poster) throw new Error("Could not generate preview frame");
                        const pPath = `${user.id}/poster_${submissionKeyRef.current}.jpg`;
                        const { error: pErr } = await supabase.storage
                          .from("media")
                          .upload(pPath, poster, { upsert: true, contentType: "image/jpeg", cacheControl: "31536000" });
                        if (pErr) throw pErr;
                        const url = supabase.storage.from("media").getPublicUrl(pPath).data.publicUrl;
                        setVideo((cur) => cur ? { ...cur, posterUploaded: { path: pPath, url }, posterError: undefined } : cur);
                        toast.success("Preview thumbnail ready");
                      } catch (e: any) {
                        logRawError(e, "generic", { feature: "upload_poster_retry" });
                        const msg = "Couldn't create the preview thumbnail. Try again.";
                        setVideo((cur) => cur ? { ...cur, posterError: msg } : cur);
                        toast.error(msg);
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90"
                  >
                    Retry poster
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCameraOpen("video")}
                className="aspect-square rounded-2xl border-2 border-dashed border-primary/40 bg-card/40 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/70"
              >
                <VideoIcon size={36} />
                <span className="text-sm">Record · 30s</span>
              </button>
              <label className="aspect-square rounded-2xl border-2 border-dashed border-primary/40 bg-card/40 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/70 cursor-pointer">
                <ImagePlus size={36} />
                <span className="text-sm">Upload video</span>
                <span className="text-[10px]">MP4/WebM · ≤30s · ≤80MB</span>
                <input type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={(e) => { onPickVideo(e.target.files?.[0] ?? null); e.target.value = ""; }} />
              </label>
            </div>
          )
        )}

        {/* Filter picker */}
        {(photos.length > 0 || video) && (
          <FilterPicker
            previewUrl={previewSrc ?? null}
            mediaType={mode === "video" ? "video" : "image"}
            selected={filter}
            onSelect={setFilter}
          />
        )}

        {/* Caption with counter */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label htmlFor="caption">Caption</Label>
            <span className="text-[10px] tabular-nums text-muted-foreground">{caption.length}/500</span>
          </div>
          <Textarea
            id="caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={500}
            placeholder="What makes you royal?"
            className="bg-input min-h-20"
          />
        </div>

        {/* Category — Master Category → Topic → optional tags */}
        <div className="rounded-xl border border-border bg-card/40 p-3">
          <div className="flex items-center justify-between mb-3">
            <Label className="m-0">Category & Topic <span className="text-destructive">*</span></Label>
            {derivedSub && (
              <CategoryBadge category={category} label={derivedSub.label} size="sm" />
            )}
          </div>
          <CategoryPicker value={pickerVal} onChange={setPickerVal} maxTags={8} />
          {!pickerVal.subSlug && (
            <p className="text-[11px] text-amber-500 mt-2">
              Pick a master category and a topic to publish — every post competes inside a topic.
            </p>
          )}
          {derivedMain && derivedSub && (
            <p className="text-[11px] text-muted-foreground mt-2">
              Competing in: <span className="text-primary font-semibold">{derivedMain.label}</span>
              {" → "}<span className="font-semibold">{derivedSub.label}</span>
            </p>
          )}
        </div>

        {/* Location — per-POST, OFF by default. Crown Map pins the crowned
            POST, never the user. Exact GPS only if the creator explicitly
            picks "Use my current location". */}
        <div className="rounded-xl border border-border bg-card/40 p-3 space-y-3">
          <button
            type="button"
            onClick={() => setLocationOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 text-foreground min-w-0">
              <MapPin size={14} className="text-primary shrink-0" />
              <div className="min-w-0 text-left">
                <div className="text-xs font-bold uppercase tracking-widest">Add location</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {locationMode === "none" && "No location — post won't be pinned on the map"}
                  {locationMode === "manual" && (
                    city.trim()
                      ? `City · ${[city.trim(), state.trim(), country.trim()].filter(Boolean).join(", ")}`
                      : "Manual — enter city/state/country below"
                  )}
                  {locationMode === "current" && (
                    postLat != null && postLng != null
                      ? `Current location · ${postLat.toFixed(3)}, ${postLng.toFixed(3)}`
                      : "Use my current location (waiting for permission)"
                  )}
                </div>
              </div>
            </div>
            <ChevronDown
              size={14}
              className={`text-muted-foreground transition-transform ${locationOpen ? "rotate-180" : ""}`}
            />
          </button>

          {locationOpen && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: "none", label: "None" },
                  { id: "manual", label: "City" },
                  { id: "current", label: "Current" },
                ] as const).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setLocationMode(opt.id);
                      setLocationError(null);
                      if (opt.id !== "current") {
                        setPostLat(null);
                        setPostLng(null);
                        setLocationCapturedAt(null);
                      }
                      if (opt.id === "current") {
                        if (typeof navigator === "undefined" || !navigator.geolocation) {
                          setLocationError("Your browser doesn't support location.");
                          return;
                        }
                        setLocationBusy(true);
                        navigator.geolocation.getCurrentPosition(
                          (pos) => {
                            setPostLat(pos.coords.latitude);
                            setPostLng(pos.coords.longitude);
                            setLocationCapturedAt(new Date().toISOString());
                            setLocationBusy(false);
                          },
                          (err) => {
                            setLocationBusy(false);
                            // Stay in "current" mode so the denied banner
                            // renders inline (it explains the raw permission
                            // outcome without ever leaking the browser's
                            // native error text). The user picks the next
                            // step from the banner buttons themselves.
                            setLocationPermissionDenied(err.code === 1);
                            setLocationError(
                              err.code === 1
                                ? "denied"
                                : "unavailable",
                            );
                          },
                          { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
                        );
                      }
                    }}
                    className={`h-9 rounded-lg text-[11px] font-bold uppercase tracking-widest border transition ${
                      locationMode === opt.id
                        ? "bg-gradient-gold text-primary-foreground border-transparent gold-shadow"
                        : "bg-card/60 border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {locationBusy && (
                <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin" /> Getting your location…
                </div>
              )}
              {locationError && (
                <div
                  role="alert"
                  data-testid="location-denied-banner"
                  className="rounded-lg border border-primary/40 bg-primary/10 p-3 space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <MapPin size={14} className="text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold uppercase tracking-widest text-foreground">
                        {locationError === "denied"
                          ? "Location permission was denied"
                          : "Couldn't get your location"}
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug mt-1">
                        No problem — you can still add a city manually and
                        your post can appear on the Crown Map.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLocationMode("manual");
                        setLocationError(null);
                        setLocationPermissionDenied(false);
                        // Give React a tick to mount the manual inputs
                        // before we try to focus the city field.
                        requestAnimationFrame(() => cityInputRef.current?.focus());
                      }}
                      className="text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-md bg-gradient-gold text-primary-foreground gold-shadow"
                    >
                      Choose city manually
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLocationMode("none");
                        setLocationError(null);
                        setLocationPermissionDenied(false);
                        setPostLat(null);
                        setPostLng(null);
                        setLocationCapturedAt(null);
                      }}
                      className="text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground"
                    >
                      Keep location off
                    </button>
                  </div>
                </div>
              )}

              {locationMode === "manual" && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px]">City</Label>
                      <Input ref={cityInputRef} value={city} onChange={(e) => setCity(e.target.value)} className="bg-input h-9 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[11px]">State</Label>
                      <Input value={state} onChange={(e) => setState(e.target.value)} className="bg-input h-9 text-xs" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[11px]">Country</Label>
                    <Input value={country} onChange={(e) => setCountry(e.target.value)} className="bg-input h-9 text-xs" />
                  </div>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground leading-snug">
                Location is attached to this post only. CrownMe does not use this
                to pin your profile or home location.
                {locationMode === "current" && (
                  <> Exact location may place this post close to where it was
                  created — you can choose <b>City</b> instead.</>
                )}
              </p>
            </>
          )}
        </div>


        {/* Tag people */}
        <div className="rounded-xl border border-border bg-card/40 p-3">
          <div className="flex items-center gap-2 mb-2 text-foreground">
            <Users size={14} className="text-primary" />
            <span className="text-xs font-bold uppercase tracking-widest">Tag people</span>
          </div>
          <TagPeopleInput
            value={tagged}
            onChange={setTagged}
            excludeUserId={user?.id}
            max={10}
            label="They'll be notified and shown on the post"
          />
        </div>

        {/* Sensitive content */}
        <div className="rounded-xl border border-border bg-card/40 p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold uppercase tracking-widest text-foreground">Mark as sensitive</div>
              <div className="text-[11px] text-muted-foreground">Viewers will see a content warning and can choose to view.</div>
            </div>
            <Switch checked={isSensitive} onCheckedChange={setIsSensitive} />
          </div>
          {isSensitive && (
            <Input
              value={sensitiveReason}
              onChange={(e) => setSensitiveReason(e.target.value.slice(0, 120))}
              placeholder="Reason (optional, e.g. graphic content)"
              className="bg-input h-9 text-xs"
              maxLength={120}
            />
          )}
        </div>


        {/* Scheduling UI hidden (audit P0-#5). There is no server-side
            release job wired up yet — surfacing a scheduler here caused
            posts to appear "scheduled" and then never publish. When the
            release cron ships, restore the block guarded by a feature
            flag. All posts publish immediately for now. */}

        {validation && (
          <p className="text-[11px] text-destructive">{validation}</p>
        )}

        {/* Upload progress + clear failure/success states */}
        {(submitting || uploadError) && (
          <div
            role="status"
            aria-live="polite"
            data-testid="upload-progress"
            className={`rounded-xl border p-3 text-xs space-y-2 ${
              uploadError
                ? "border-destructive/60 bg-destructive/10 text-destructive"
                : "border-primary/40 bg-card/60 text-foreground"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase tracking-widest">
                {uploadError ? "Upload failed" : uploadStage || "Working…"}
              </span>
              {!uploadError && (
                <span className="tabular-nums text-muted-foreground">{uploadProgress}%</span>
              )}
            </div>
            {!uploadError && (
              <>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-gold transition-[width] duration-200"
                    style={{ width: `${uploadProgress}%` }}
                    data-testid="upload-progress-bar"
                  />
                </div>
                {submitting && uploadProgress < 100 && (
                  <button
                    type="button"
                    onClick={cancelUpload}
                    className="text-[11px] font-bold underline underline-offset-2 text-muted-foreground hover:text-destructive"
                  >
                    Cancel upload
                  </button>
                )}
              </>
            )}
            {uploadError && (
              <div className="space-y-2">
                <p className="text-[11px] leading-relaxed">{uploadError}</p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => { setUploadError(null); submit(); }}
                    className="text-[11px] font-bold underline underline-offset-2"
                  >
                    Retry failed photos
                  </button>
                  <button
                    type="button"
                    onClick={() => { setUploadError(null); setUploadStage(""); setUploadProgress(0); }}
                    className="text-[11px] font-bold underline underline-offset-2 text-muted-foreground"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <Button
          onClick={submit}
          disabled={!canSubmit}
          className="w-full h-14 bg-gradient-gold text-primary-foreground font-bold tracking-widest gold-shadow disabled:opacity-50"
        >
          {submitting ? (<><Loader2 size={16} className="animate-spin mr-2" /> POSTING…</>) : "POST & COMPETE"}
        </Button>

        <Button
          variant="outline"
          onClick={saveCloudDraft}
          disabled={savingDraft || submitting || !user}
          className="w-full mt-2"
        >
          {savingDraft ? (<><Loader2 size={14} className="animate-spin mr-2" /> Saving draft…</>) : (cloudDraftId ? "Update cloud draft" : "Save draft to cloud")}
        </Button>
      </div>

      <CameraCapture
        open={cameraOpen !== null}
        mode={cameraOpen ?? "photo"}
        initialFilter={filter}
        // Default to 9:16 when entering camera from the Scroll/Short (video) CTA,
        // 4:5 when entering from the feed photo CTA. Users can still switch inside.
        initialRatio={cameraOpen === "video" ? "9:16" : "4:5"}
        onCancel={() => setCameraOpen(null)}
        onCapture={onCameraCapture}
      />


      <CropEditor
        open={pendingCrop !== null}
        file={pendingCrop?.file ?? null}
        onConfirm={onCropConfirm}
        onRetake={pendingCrop?.fromCamera ? onCropRetake : undefined}
        onCancel={onCropCancel}
      />
    </AppShell>
  );
}
