import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Video as VideoIcon,
  Square,
  RotateCcw,
  Check,
  X,
  Zap,
  ZapOff,
  Grid3x3,
  Image as ImageIcon,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FILTERS, FilterId, cssFor } from "@/lib/filters";
import FilterOverlay from "@/components/FilterOverlay";

export type CameraRatio = "9:16" | "4:5" | "1:1";

interface Props {
  open: boolean;
  /** Initial mode; user can switch inside the camera. */
  mode: "photo" | "video";
  /** Max video length in ms (hard-capped at 30s). */
  maxMs?: number;
  /** Initial filter; user can change live. */
  initialFilter?: FilterId;
  /**
   * Initial output aspect ratio. User can switch inside the camera.
   * - "9:16" → 1080×1920 (Scrolls/Shorts)
   * - "4:5"  → 1080×1350 (feed portrait)
   * - "1:1"  → 1080×1080 (square)
   */
  initialRatio?: CameraRatio;
  onCancel: () => void;
  onCapture: (file: File, kind: "photo" | "video") => void;
}

const MAX_VIDEO_MS = 30_000; // hard cap

/**
 * Returns the target output canvas size for a given social aspect ratio.
 * Width is normalised to 1080px so capture quality is consistent across modes.
 */
const RATIO_DIMS: Record<CameraRatio, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "4:5": { w: 1080, h: 1350 },
  "1:1": { w: 1080, h: 1080 },
};


/**
 * Full-featured in-app camera (Instagram/TikTok-class).
 *
 * Features:
 * - Photo + video modes (toggle inside the camera)
 * - Live filter rail (10 filters, baked into capture via canvas pipeline)
 * - Tap-to-focus + auto-exposure point (where supported)
 * - Pinch-to-zoom (where supported)
 * - Torch / flash toggle (rear camera, where supported)
 * - Front/back camera flip
 * - Optional 3x3 grid overlay
 * - Hold-to-record OR tap-to-toggle
 * - 30s hard cap with progress bar
 * - Output: JPEG photo or WebM/MP4 video with the chosen filter baked in
 *
 * The original raw stream is never uploaded; we always render through a
 * canvas with the active filter so what the user sees IS what gets posted.
 */
export default function CameraCapture({
  open,
  mode: initialMode,
  maxMs = MAX_VIDEO_MS,
  initialFilter = "none",
  onCancel,
  onCapture,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  const [mode, setMode] = useState<"photo" | "video">(initialMode);
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [filter, setFilter] = useState<FilterId>(initialFilter);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<{ blob: Blob; kind: "photo" | "video" } | null>(null);

  // Capabilities
  const [supportsTorch, setSupportsTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomCaps, setZoomCaps] = useState<{ min: number; max: number; step: number } | null>(null);
  const [zoom, setZoom] = useState(1);

  const [showGrid, setShowGrid] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number; ts: number } | null>(null);

  const cap = Math.min(maxMs, MAX_VIDEO_MS);

  useEffect(() => { setMode(initialMode); }, [initialMode]);
  useEffect(() => { setFilter(initialFilter); }, [initialFilter]);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  };

  const startStream = async () => {
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1920 },
          frameRate: { ideal: 30, max: 60 },
        },
        audio: mode === "video" ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 2,
        } : false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      // Probe capabilities
      const track = stream.getVideoTracks()[0];
      const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
        torch?: boolean;
        zoom?: { min: number; max: number; step: number };
        focusMode?: string[];
      };
      setSupportsTorch(!!caps.torch);
      setTorchOn(false);
      if (caps.zoom && typeof caps.zoom.min === "number" && typeof caps.zoom.max === "number") {
        setZoomCaps({ min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step ?? 0.1 });
        setZoom(caps.zoom.min);
      } else {
        setZoomCaps(null);
        setZoom(1);
      }
      // Try continuous autofocus by default (iPhone Safari supports it)
      try {
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] });
        }
      } catch { /* noop */ }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Camera unavailable";
      toast.error(msg);
      onCancel();
    }
  };

  // (Re)start stream when opened, when facing changes, or when video mode toggles
  // (audio track is only requested in video mode).
  useEffect(() => {
    if (!open) return;
    setPreviewUrl(null);
    setPreviewBlob(null);
    setElapsed(0);
    startStream();
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      try { recorderRef.current?.state === "recording" && recorderRef.current.stop(); } catch { /* noop */ }
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing, mode]);

  // ─────────────── Tap to focus ───────────────
  const handleTapFocus = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (!videoRef.current || previewUrl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setFocusPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top, ts: Date.now() });
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
      focusMode?: string[];
      pointsOfInterest?: unknown;
      exposureMode?: string[];
    };
    const advanced: MediaTrackConstraintSet[] = [];
    if (Array.isArray(caps.focusMode) && (caps.focusMode.includes("single-shot") || caps.focusMode.includes("manual"))) {
      const mode = caps.focusMode.includes("single-shot") ? "single-shot" : "manual";
      advanced.push({ focusMode: mode, pointsOfInterest: [{ x, y }] } as unknown as MediaTrackConstraintSet);
    }
    if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes("continuous")) {
      advanced.push({ exposureMode: "continuous", pointsOfInterest: [{ x, y }] } as unknown as MediaTrackConstraintSet);
    }
    if (advanced.length) {
      try { await track.applyConstraints({ advanced }); } catch { /* noop */ }
    }
  };

  // ─────────────── Pinch to zoom ───────────────
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  const distance = (a: React.Touch, b: React.Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && zoomCaps) {
      pinchRef.current = { startDist: distance(e.touches[0], e.touches[1]), startZoom: zoom };
    }
  };
  const onTouchMove = async (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinchRef.current || !zoomCaps) return;
    const d = distance(e.touches[0], e.touches[1]);
    const ratio = d / pinchRef.current.startDist;
    const target = Math.min(zoomCaps.max, Math.max(zoomCaps.min, pinchRef.current.startZoom * ratio));
    setZoom(target);
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) {
      try {
        await track.applyConstraints({ advanced: [{ zoom: target } as unknown as MediaTrackConstraintSet] });
      } catch { /* noop */ }
    }
  };
  const onTouchEnd = () => { pinchRef.current = null; };

  // ─────────────── Torch / flash ───────────────
  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !supportsTorch) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as unknown as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      toast.error("Flash not available");
    }
  };

  // ─────────────── Canvas pipeline (filter bake) ───────────────
  /**
   * Paints one video frame onto a SQUARE offscreen canvas with the chosen filter.
   * The square output (1080x1080) matches the post frame's aspect-square layout
   * so captured media always fills the post card with no letterboxing.
   * The source video is center-cropped using cover-fit math.
   */
  const SQUARE = 1080;
  const paintFrame = (canvas: HTMLCanvasElement, video: HTMLVideoElement, currentFilter: FilterId, t: number) => {
    const vw = video.videoWidth || SQUARE;
    const vh = video.videoHeight || SQUARE;
    if (canvas.width !== SQUARE) canvas.width = SQUARE;
    if (canvas.height !== SQUARE) canvas.height = SQUARE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Center-crop source to a square (object-cover behavior)
    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;

    ctx.save();
    ctx.filter = cssFor(currentFilter) || "none";
    if (facing === "user") {
      ctx.translate(SQUARE, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, sx, sy, side, side, 0, 0, SQUARE, SQUARE);
    ctx.restore();
    paintAnimatedOverlay(ctx, SQUARE, SQUARE, currentFilter, t);
  };

  const paintAnimatedOverlay = (
    _ctx: CanvasRenderingContext2D,
    _w: number,
    _h: number,
    _id: FilterId,
    _t: number,
  ) => {
    /* Royal Filter System: animated video overlays are now rendered at display
       time (CSS), not baked into the recording. Originals stay clean and the
       chosen filter id is stored as post metadata. */
  };

  // ─────────────── Photo capture ───────────────
  const snapPhoto = () => {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    paintFrame(canvas, v, filter, performance.now());
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setPreviewBlob({ blob, kind: "photo" });
      },
      "image/jpeg",
      0.95,
    );
  };

  // ─────────────── Video capture (canvas-based with filter bake) ───────────────
  const startRecording = () => {
    const v = videoRef.current;
    const stream = streamRef.current;
    if (!v || !stream) return;
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;

    // RAF render loop into canvas
    const start = performance.now();
    const loop = () => {
      paintFrame(canvas, v, filter, performance.now() - start);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    // Build composite stream: video from canvas + audio from mic
    const fps = 30;
    const composite = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(fps);
    const audioTracks = stream.getAudioTracks();
    audioTracks.forEach((t) => composite.addTrack(t));

    chunksRef.current = [];
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : MediaRecorder.isTypeSupported("video/webm")
          ? "video/webm"
          : "video/mp4";
    const rec = new MediaRecorder(composite, { mimeType: mime, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 192_000 });
    recorderRef.current = rec;
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      const blob = new Blob(chunksRef.current, { type: mime });
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewBlob({ blob, kind: "video" });
      setRecording(false);
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    };
    rec.start(250);
    startedAtRef.current = Date.now();
    setRecording(true);
    setElapsed(0);
    tickRef.current = setInterval(() => {
      setElapsed(Date.now() - startedAtRef.current);
    }, 100);
    stopTimerRef.current = setTimeout(() => stopRecording(), cap);
  };

  const stopRecording = () => {
    if (stopTimerRef.current) { clearTimeout(stopTimerRef.current); stopTimerRef.current = null; }
    try { recorderRef.current?.state === "recording" && recorderRef.current.stop(); } catch { /* noop */ }
  };

  const accept = () => {
    if (!previewBlob) return;
    const ext = previewBlob.kind === "photo" ? "jpg" : (previewBlob.blob.type.includes("mp4") ? "mp4" : "webm");
    const file = new File([previewBlob.blob], `capture-${Date.now()}.${ext}`, { type: previewBlob.blob.type });
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    onCapture(file, previewBlob.kind);
  };

  const retake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setElapsed(0);
  };

  /**
   * Save the captured photo/video to the device's gallery.
   * - On Capacitor (iOS/Android native), uses the Filesystem plugin to write
   *   into the user's Documents directory (where the OS surfaces it in Photos).
   * - On web (incl. mobile web), triggers a download. iOS Safari will prompt
   *   "Save to Photos" automatically for image/video downloads.
   */
  const saveToGallery = async () => {
    if (!previewBlob) return;
    const ext = previewBlob.kind === "photo" ? "jpg" : (previewBlob.blob.type.includes("mp4") ? "mp4" : "webm");
    const filename = `crownme-${Date.now()}.${ext}`;
    try {
      // Try native save via Capacitor if available at runtime (won't break web build).
      const cap = (globalThis as any).Capacitor;
      if (cap?.isNativePlatform?.()) {
        // Use Function-based dynamic import so Vite's dependency scanner ignores it
        // (the package is only present in native builds).
        const dynImport = new Function("s", "return import(s)") as (s: string) => Promise<unknown>;
        const fs: any = await dynImport("@capacitor/" + "filesystem").catch(() => null);
        if (fs?.Filesystem) {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onerror = () => reject(reader.error);
            reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
            reader.readAsDataURL(previewBlob.blob);
          });
          await fs.Filesystem.writeFile({
            path: filename,
            data: base64,
            directory: fs.Directory.Documents,
            recursive: true,
          });
          toast.success("Saved to your gallery");
          return;
        }
      }
      // Web fallback: trigger a download (iOS prompts Save to Photos).
      const url = URL.createObjectURL(previewBlob.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast.success(previewBlob.kind === "photo" ? "Saved — choose Save Image" : "Saved — choose Save Video");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  };

  const filteredCss = useMemo(() => cssFor(filter), [filter]);

  if (!open) return null;
  const pct = Math.min(100, (elapsed / cap) * 100);
  const seconds = Math.floor(elapsed / 1000);
  const focusVisible = focusPoint && Date.now() - focusPoint.ts < 900;

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col select-none">
      {/* Top bar */}
      <header className="flex items-center justify-between p-3 text-white">
        <button type="button" onClick={onCancel} aria-label="Close camera" className="p-2 rounded-full bg-white/10 hover:bg-white/20">
          <X size={20} />
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGrid((g) => !g)}
            aria-label="Toggle grid"
            className={`p-2 rounded-full ${showGrid ? "bg-white/30" : "bg-white/10 hover:bg-white/20"}`}
          >
            <Grid3x3 size={18} />
          </button>
          {supportsTorch && facing === "environment" && (
            <button
              onClick={toggleTorch}
              aria-label="Toggle flash"
              className={`p-2 rounded-full ${torchOn ? "bg-yellow-400 text-black" : "bg-white/10 hover:bg-white/20"}`}
            >
              {torchOn ? <Zap size={18} fill="currentColor" /> : <ZapOff size={18} />}
            </button>
          )}
          <button
            onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
            aria-label="Flip camera"
            className="p-2 rounded-full bg-white/10 hover:bg-white/20"
            disabled={recording}
          >
            <RotateCcw size={20} />
          </button>
        </div>
      </header>

      {/* Stage */}
      <div
        className="flex-1 relative flex items-center justify-center overflow-hidden touch-none"
        onPointerDown={handleTapFocus}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {previewUrl ? (
          previewBlob?.kind === "video" ? (
            <video src={previewUrl} controls playsInline className="max-h-full max-w-full" />
          ) : (
            <img loading="lazy" src={previewUrl} alt="Preview" className="max-h-full max-w-full" />
          )
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className={`max-h-full max-w-full ${facing === "user" ? "scale-x-[-1]" : ""}`}
              style={{ filter: filteredCss }}
            />
            {/* Animated overlay preview (FX filters) */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative w-full h-full">
                <FilterOverlay filter={filter} />
              </div>
            </div>
          </>
        )}

        {/* Grid overlay */}
        {showGrid && !previewUrl && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="border border-white/15" />
              ))}
            </div>
          </div>
        )}

        {/* Tap focus ring */}
        {focusVisible && focusPoint && (
          <div
            className="pointer-events-none absolute size-16 rounded-full border-2 border-yellow-300 animate-ping"
            style={{ left: focusPoint.x - 32, top: focusPoint.y - 32 }}
          />
        )}

        {/* Zoom indicator */}
        {zoomCaps && !previewUrl && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 rounded-full bg-black/50 text-white text-[10px] font-bold">
            {zoom.toFixed(1)}x
          </div>
        )}

        {/* REC chip */}
        {recording && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-600/90 text-white text-xs font-bold">
            <span className="size-2 rounded-full bg-white animate-pulse" />
            REC {seconds}s / {Math.floor(cap / 1000)}s
          </div>
        )}
        {recording && (
          <div className="absolute bottom-44 inset-x-6 h-1 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-red-500 transition-[width] duration-100" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      {/* Filter rail (hidden when reviewing) */}
      {!previewUrl && (
        <div className="px-3 pt-2 pb-1">
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
            {FILTERS.map((f) => {
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  aria-pressed={active}
                  aria-label={`${f.label} filter`}
                  className={`shrink-0 px-3 h-8 rounded-full text-[10px] font-bold uppercase tracking-widest border transition flex items-center gap-1.5 ${
                    active
                      ? "bg-gradient-to-r from-yellow-300 to-amber-500 text-black border-transparent"
                      : "bg-white/10 text-white/80 border-white/20 hover:bg-white/20"
                  }`}
                >
                  <span>{f.label}</span>
                  {f.animated && (
                    <span className={`px-1 rounded-full text-[8px] ${active ? "bg-black/15" : "bg-yellow-400/90 text-black"}`}>FX</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <footer className="px-6 pt-3 pb-6 flex flex-col items-center gap-3">
        {!previewUrl && (
          <div className="flex items-center gap-1 p-1 rounded-full bg-white/10 text-[11px] font-bold uppercase tracking-widest">
            <button
              type="button"
              onClick={() => !recording && setMode("photo")}
              disabled={recording}
              className={`px-3 py-1 rounded-full flex items-center gap-1.5 ${mode === "photo" ? "bg-white text-black" : "text-white/80"}`}
            >
              <ImageIcon size={12} /> Photo
            </button>
            <button
              type="button"
              onClick={() => !recording && setMode("video")}
              disabled={recording}
              className={`px-3 py-1 rounded-full flex items-center gap-1.5 ${mode === "video" ? "bg-white text-black" : "text-white/80"}`}
            >
              <VideoIcon size={12} /> Video · 30s
            </button>
          </div>
        )}

        <div className="flex items-center justify-center gap-6 w-full">
          {previewUrl ? (
            <>
              <Button variant="outline" size="lg" onClick={retake} className="bg-white/10 text-white border-white/30 hover:bg-white/20">
                Retake
              </Button>
              <Button variant="outline" size="lg" onClick={saveToGallery} className="bg-white/10 text-white border-white/30 hover:bg-white/20">
                <Download size={18} className="mr-1" /> Save
              </Button>
              <Button size="lg" onClick={accept} className="bg-gradient-gold text-primary-foreground gold-shadow">
                <Check size={18} className="mr-1" /> Use this
              </Button>
            </>
          ) : mode === "photo" ? (
            <button
              onClick={snapPhoto}
              aria-label="Take photo"
              className="size-20 rounded-full bg-white border-4 border-white/30 active:scale-95 transition flex items-center justify-center"
            >
              <Camera size={28} className="text-black" />
            </button>
          ) : recording ? (
            <button
              onClick={stopRecording}
              aria-label="Stop recording"
              className="size-20 rounded-full bg-red-600 border-4 border-white/30 active:scale-95 transition flex items-center justify-center"
            >
              <Square size={28} className="text-white" fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={startRecording}
              aria-label="Start recording"
              className="size-20 rounded-full bg-white border-4 border-red-500 active:scale-95 transition flex items-center justify-center"
            >
              <VideoIcon size={28} className="text-red-600" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
