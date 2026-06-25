/**
 * Client-side image processing for uploads.
 *
 * - Strips EXIF (incl. GPS) by re-encoding through canvas.
 * - Downscales to max 2048px on the long edge.
 * - Re-encodes JPEGs at quality 0.85 to shrink file size before upload.
 *
 * HEIC/HEIF: browsers can't decode these natively. We detect by extension
 * and ask the user to convert (the file is rejected at pick time).
 */

const MAX_DIM = 2048;
const JPEG_QUALITY = 0.92;
/** Every post must be exactly this size — matches the post-card aspect-square. */
export const POST_SQUARE = 1080;

export function isHeic(file: File): boolean {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  return ext === "heic" || ext === "heif" || file.type === "image/heic" || file.type === "image/heif";
}

/**
 * Converts an iOS HEIC/HEIF photo to a JPEG File client-side.
 * iOS Safari's auto-conversion is unreliable in PWA/standalone mode and in
 * Chrome on iOS, so we always normalize HEIC before validation/upload.
 * Uses a dynamic import so heic2any stays out of the main bundle.
 */
export async function convertHeicToJpeg(file: File): Promise<File> {
  if (!isHeic(file)) return file;
  const mod = (await import("heic2any")) as unknown as { default?: (opts: { blob: Blob; toType?: string; quality?: number }) => Promise<Blob | Blob[]> };
  const heic2any = mod.default ?? (mod as unknown as (opts: { blob: Blob; toType?: string; quality?: number }) => Promise<Blob | Blob[]>);
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
  const blob = Array.isArray(out) ? out[0] : out;
  const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg") || "photo.jpg";
  return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
}


export async function probeImage(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not read image"));
      img.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Returns a new File: EXIF stripped, center-cropped to 1080×1080 square,
 * and re-encoded as JPEG. This guarantees every post matches the post frame.
 *
 * The server enforces 1080×1080 with a DB trigger, so client-side cropping is
 * not just a UX nicety — it's required for the insert to succeed.
 */
export async function stripAndCompressImage(file: File): Promise<File> {
  if (isHeic(file)) {
    throw new Error("HEIC/HEIF photos aren't supported — please convert to JPG or PNG first.");
  }

  // Prefer createImageBitmap with imageOrientation: "from-image" so the EXIF
  // Orientation tag is honored consistently across browsers. Falls back to
  // <img> decoding (which Chrome/Safari auto-orient in recent versions) when
  // the option isn't supported (older Firefox, niche browsers).
  let source: CanvasImageSource;
  let w = 0;
  let h = 0;
  let bitmap: ImageBitmap | null = null;
  const url = typeof createImageBitmap === "function" ? "" : URL.createObjectURL(file);
  try {
    if (typeof createImageBitmap === "function") {
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
      } catch {
        bitmap = await createImageBitmap(file);
      }
      source = bitmap;
      w = bitmap.width;
      h = bitmap.height;
    } else {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Could not decode this image — try a different photo."));
        img.src = url;
      });
      source = img;
      w = img.naturalWidth;
      h = img.naturalHeight;
    }
    if (!w || !h) throw new Error("Image has no readable dimensions.");

    const canvas = document.createElement("canvas");
    canvas.width = POST_SQUARE;
    canvas.height = POST_SQUARE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser blocked the image processor — try a different browser.");

    const side = Math.min(w, h);
    const sx = (w - side) / 2;
    const sy = (h - side) / 2;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, sx, sy, side, side, 0, 0, POST_SQUARE, POST_SQUARE);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) throw new Error("Could not export the cropped image — please try again.");

    const baseName = (file.name.replace(/\.[^.]+$/, "") || "photo").replace(/[^a-zA-Z0-9_-]/g, "_");
    const outFile = new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
    const dims = await probeImage(outFile);
    if (dims.width !== POST_SQUARE || dims.height !== POST_SQUARE) {
      throw new Error(`Image processor produced ${dims.width}×${dims.height} instead of ${POST_SQUARE}×${POST_SQUARE}.`);
    }
    return outFile;
  } finally {
    if (bitmap) try { bitmap.close(); } catch { /* noop */ }
    if (url) URL.revokeObjectURL(url);
  }
}

/**
 * Compute a sha-256 hex digest of any file. Used for client-side dedupe so the
 * same image isn't added twice in the same compose session.
 */
export async function sha256File(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(digest);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

/**
 * Trim a video to [startSec, endSec] by playing it through a MediaRecorder
 * that records a canvas. Output is a WebM (VP9/Opus when supported).
 *
 * Intentionally browser-only — no ffmpeg.wasm. Trade-off: trimming plays the
 * slice in real-time, so a 30s clip takes ~30s. Use onProgress for UI.
 */
export async function trimVideo(
  file: File,
  startSec: number,
  endSec: number,
  onProgress?: (ratio: number) => void,
): Promise<File> {
  if (endSec <= startSec) throw new Error("Trim end must be after start.");
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Could not read video for trim"));
    });

    const w = video.videoWidth || 720;
    const h = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable for trim");

    const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    const mime = candidates.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "video/webm";

    const stream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    await new Promise<void>((resolve) => { video.onseeked = () => resolve(); video.currentTime = Math.max(0, startSec); });
    recorder.start(100);
    await video.play().catch(() => { /* tab-backgrounded plays may reject */ });

    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      try { video.pause(); } catch { /* noop */ }
      try { recorder.stop(); } catch { /* noop */ }
    };

    let raf = 0;
    const totalSpan = endSec - startSec;
    const draw = () => {
      ctx.drawImage(video, 0, 0, w, h);
      const elapsed = Math.max(0, video.currentTime - startSec);
      onProgress?.(Math.min(1, elapsed / totalSpan));
      if (video.currentTime >= endSec || video.ended) { stop(); return; }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    await new Promise<void>((resolve) => {
      recorder.onstop = () => { cancelAnimationFrame(raf); resolve(); };
    });

    const blob = new Blob(chunks, { type: mime });
    const baseName = (file.name.replace(/\.[^.]+$/, "") || "video").replace(/[^a-zA-Z0-9_-]/g, "_");
    return new File([blob], `${baseName}_trim.webm`, { type: mime });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Convenience wrapper that returns a friendly error suitable for `toast.error`
 * when the file isn't a usable image. Used by upload entry points that need
 * to validate before mutating component state.
 */
export async function validateAndPrepareImage(
  file: File,
  opts: { maxBytes?: number } = {},
): Promise<File> {
  const max = opts.maxBytes ?? 12 * 1024 * 1024;
  if (!file.type.startsWith("image/") && !isHeic(file)) {
    throw new Error(`${file.name} isn't a supported image.`);
  }
  if (file.size > max) {
    throw new Error(`${file.name} is too large (max ${(max / 1024 / 1024).toFixed(0)}MB).`);
  }
  return stripAndCompressImage(file);
}

// Suppress "MAX_DIM unused" — kept exported in case callers want a sanity ceiling.
export { MAX_DIM };

/**
 * Reads video metadata (duration, dimensions) without loading entire file.
 */
export async function probeVideo(file: File): Promise<{ durationMs: number; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      v.onloadedmetadata = () => resolve();
      v.onerror = () => reject(new Error("Could not read video"));
      v.src = url;
    });
    return {
      durationMs: Math.round((v.duration || 0) * 1000),
      width: v.videoWidth,
      height: v.videoHeight,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Capture a poster frame (~10% into the video, max 1s) as a JPEG file.
 */
export async function captureVideoPoster(file: File, atSeconds?: number): Promise<File | null> {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement("video");
    v.preload = "auto";
    v.muted = true;
    v.playsInline = true;
    v.crossOrigin = "anonymous";
    v.src = url;
    await new Promise<void>((resolve, reject) => {
      v.onloadedmetadata = () => resolve();
      v.onerror = () => reject(new Error("Could not read video"));
    });
    const duration = v.duration || 0;
    const target =
      typeof atSeconds === "number" && isFinite(atSeconds)
        ? Math.max(0, Math.min(duration > 0 ? duration - 0.05 : atSeconds, atSeconds))
        : Math.min(1, duration * 0.1);
    await new Promise<void>((resolve) => {
      v.onseeked = () => resolve();
      try { v.currentTime = target; } catch { resolve(); }
    });
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth || 720;
    canvas.height = v.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) return null;
    return new File([blob], `poster-${Date.now()}.jpg`, { type: "image/jpeg" });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Sample N evenly spaced frames across a video as JPEG files. Used to feed
 * the safety classifier so unsafe content in the middle of a clip is caught,
 * not just the auto-picked poster.
 */
export async function sampleVideoFrames(file: File, count = 5): Promise<File[]> {
  const url = URL.createObjectURL(file);
  const out: File[] = [];
  try {
    const v = document.createElement("video");
    v.preload = "auto";
    v.muted = true;
    v.playsInline = true;
    v.src = url;
    await new Promise<void>((resolve, reject) => {
      v.onloadedmetadata = () => resolve();
      v.onerror = () => reject(new Error("Could not read video"));
    });
    const duration = Math.max(0.1, v.duration || 0);
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth || 720;
    canvas.height = v.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return out;

    for (let i = 0; i < count; i++) {
      // Spread samples across the clip — first/last 5% trimmed to avoid black frames.
      const ratio = count <= 1 ? 0.5 : 0.05 + (0.9 * i) / (count - 1);
      const target = Math.min(duration - 0.05, ratio * duration);
      await new Promise<void>((resolve) => {
        v.onseeked = () => resolve();
        try { v.currentTime = target; } catch { resolve(); }
      });
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.75));
      if (blob) out.push(new File([blob], `frame_${i}_${Date.now()}.jpg`, { type: "image/jpeg" }));
    }
    return out;
  } catch {
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
