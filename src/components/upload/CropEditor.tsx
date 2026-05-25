import { useCallback, useEffect, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Loader2, RefreshCw, Check, RotateCw, Undo2 } from "lucide-react";
import { POST_SQUARE } from "@/lib/mediaProcess";

/**
 * Square crop editor for a captured/picked photo.
 *
 * Outputs a 1080×1080 JPEG (matches the server-side dimension trigger and the
 * storage allowlist). Exposes a "Retake" action so the user can jump straight
 * back to the camera without manually closing the dialog.
 */
export interface CropEditorProps {
  open: boolean;
  /** Source file to crop. Object URL is created internally. */
  file: File | null;
  /** User confirmed crop — receives a 1080×1080 JPEG. */
  onConfirm: (file: File) => void;
  /** User wants to retake the photo (camera flow). Optional — if omitted, the button is hidden. */
  onRetake?: () => void;
  /** User dismissed the editor without confirming. */
  onCancel: () => void;
  /** Crop overlay shape — "round" for avatars, "rect" (default) for posts. */
  cropShape?: "rect" | "round";
}

const JPEG_QUALITY = 0.92;

async function getCroppedFile(
  src: string,
  area: Area,
  rotation: number,
  baseName: string,
): Promise<File> {
  const img = new Image();
  img.src = src;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not load image for cropping"));
  });

  // Render rotation onto an intermediate canvas first, then crop from it.
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const rotW = img.width * cos + img.height * sin;
  const rotH = img.width * sin + img.height * cos;

  const rotCanvas = document.createElement("canvas");
  rotCanvas.width = rotW;
  rotCanvas.height = rotH;
  const rotCtx = rotCanvas.getContext("2d");
  if (!rotCtx) throw new Error("Canvas unavailable");
  rotCtx.translate(rotW / 2, rotH / 2);
  rotCtx.rotate(rad);
  rotCtx.drawImage(img, -img.width / 2, -img.height / 2);

  const out = document.createElement("canvas");
  out.width = POST_SQUARE;
  out.height = POST_SQUARE;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    rotCanvas,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    POST_SQUARE,
    POST_SQUARE,
  );

  const blob: Blob | null = await new Promise((resolve) =>
    out.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("Could not export cropped image");
  const safeName = baseName.replace(/[^a-zA-Z0-9_-]/g, "_") || "photo";
  return new File([blob], `${safeName}.jpg`, { type: "image/jpeg" });
}

export default function CropEditor({ open, file, onConfirm, onRetake, onCancel, cropShape = "rect" }: CropEditorProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pixels, setPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !file) {
      if (src) URL.revokeObjectURL(src);
      setSrc(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
      setPixels(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, file]);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setPixels(areaPixels);
  }, []);

  const handleConfirm = async () => {
    if (!src || !pixels || !file) return;
    setBusy(true);
    try {
      const baseName = (file.name.replace(/\.[^.]+$/, "") || "photo");
      const out = await getCroppedFile(src, pixels, rotation, baseName);
      onConfirm(out);
    } catch {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-base font-display text-gold">Adjust framing</DialogTitle>
          <DialogDescription className="text-[11px]">
            Pinch or drag to reposition. Posts are saved as 1080×1080.
          </DialogDescription>
        </DialogHeader>

        <div className="relative w-full aspect-square bg-black">
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={1}
              cropShape={cropShape}
              showGrid
              objectFit="cover"
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        <div className="px-4 py-3 space-y-3 border-t border-border">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>Zoom</span>
              <span className="tabular-nums">{zoom.toFixed(2)}×</span>
            </div>
            <Slider min={1} max={4} step={0.01} value={[zoom]} onValueChange={(v) => setZoom(v[0] ?? 1)} />
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="flex-1"
            >
              <RotateCw size={14} className="mr-1" /> Rotate
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setCrop({ x: 0, y: 0 }); setZoom(1); setRotation(0); }}
              className="flex-1"
              title="Reset framing"
            >
              <Undo2 size={14} className="mr-1" /> Reset
            </Button>
            {onRetake && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRetake}
                className="flex-1"
              >
                <RefreshCw size={14} className="mr-1" /> Retake
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={busy || !pixels}
              className="bg-gradient-gold text-primary-foreground font-bold"
            >
              {busy ? (<><Loader2 size={14} className="mr-1 animate-spin" /> Working…</>) : (<><Check size={14} className="mr-1" /> Use photo</>)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
