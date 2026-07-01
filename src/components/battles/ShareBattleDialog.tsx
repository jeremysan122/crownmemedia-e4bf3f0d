import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Twitter, Facebook, Link2, Download, Share2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import logo from "@/assets/crownme-logo.png";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  battleId: string;
  challenger: string;
  opponent: string;
  challengerImage?: string | null;
  opponentImage?: string | null;
  challengerVotes?: number;
  opponentVotes?: number;
  filters?: URLSearchParams;
}

const W = 1200;
const H = 630;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 24);
  ctx.clip();
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

export default function ShareBattleDialog({
  open, onOpenChange, battleId, challenger, opponent,
  challengerImage, opponentImage, challengerVotes = 0, opponentVotes = 0, filters,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState(false);
  const prevPngUrlRef = useRef<string | null>(null);

  // Revoke old blob URLs whenever we produce a new one or the dialog closes.
  useEffect(() => {
    return () => {
      if (prevPngUrlRef.current) {
        URL.revokeObjectURL(prevPngUrlRef.current);
        prevPngUrlRef.current = null;
      }
    };
  }, []);
  useEffect(() => {
    if (pngUrl && prevPngUrlRef.current && prevPngUrlRef.current !== pngUrl) {
      URL.revokeObjectURL(prevPngUrlRef.current);
    }
    prevPngUrlRef.current = pngUrl;
  }, [pngUrl]);

  const search = new URLSearchParams(filters ?? "");
  search.set("b", battleId);
  const url = `${window.location.origin}/battles?${search.toString()}`;
  const text = `⚔️ Crown Battle: @${challenger} vs @${opponent} on CrownMe Media — vote now`;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setBuilding(true);
      setBuildError(false);
      setPngUrl(null);
      try {
        const canvas = canvasRef.current ?? document.createElement("canvas");
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext("2d")!;
        const bg = ctx.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, "#0b0712");
        bg.addColorStop(1, "#1a0f24");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        const slotW = 460, slotH = 460, slotY = 110;
        const leftX = 60, rightX = W - 60 - slotW;

        // Never fail the whole card if a photo is CORS-blocked — draw a
        // placeholder instead. The logo is a local asset so it must load.
        const [logoImg, leftImg, rightImg] = await Promise.all([
          loadImage(logo),
          challengerImage ? loadImage(challengerImage).catch(() => null) : Promise.resolve(null),
          opponentImage ? loadImage(opponentImage).catch(() => null) : Promise.resolve(null),
        ]);
        if (cancelled) return;

        if (leftImg) drawCover(ctx, leftImg, leftX, slotY, slotW, slotH);
        else { ctx.fillStyle = "#2a1a3a"; ctx.fillRect(leftX, slotY, slotW, slotH); }
        if (rightImg) drawCover(ctx, rightImg, rightX, slotY, slotW, slotH);
        else { ctx.fillStyle = "#2a1a3a"; ctx.fillRect(rightX, slotY, slotW, slotH); }

        ctx.strokeStyle = "#d4af37";
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.roundRect(leftX, slotY, slotW, slotH, 24); ctx.stroke();
        ctx.beginPath(); ctx.roundRect(rightX, slotY, slotW, slotH, 24); ctx.stroke();

        const vsX = W / 2, vsY = slotY + slotH / 2;
        const vsR = 70;
        const grad = ctx.createRadialGradient(vsX, vsY, 10, vsX, vsY, vsR);
        grad.addColorStop(0, "#fff8d8");
        grad.addColorStop(1, "#d4af37");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(vsX, vsY, vsR, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#1a0f24";
        ctx.font = "bold 56px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("VS", vsX, vsY + 4);

        ctx.drawImage(logoImg, 60, 30, 60, 60);
        ctx.fillStyle = "#d4af37";
        ctx.font = "bold 32px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText("CrownMe Media", 132, 72);
        ctx.fillStyle = "#a89060";
        ctx.font = "600 18px sans-serif";
        ctx.fillText("CROWN BATTLE", 132, 95);

        ctx.textAlign = "center";
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 32px sans-serif";
        ctx.fillText(`@${challenger}`, leftX + slotW / 2, H - 70);
        ctx.fillText(`@${opponent}`, rightX + slotW / 2, H - 70);
        ctx.fillStyle = "#d4af37";
        ctx.font = "600 22px sans-serif";
        ctx.fillText(`${challengerVotes} votes`, leftX + slotW / 2, H - 38);
        ctx.fillText(`${opponentVotes} votes`, rightX + slotW / 2, H - 38);

        ctx.fillStyle = "#a89060";
        ctx.font = "600 16px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText("Vote now → crownmemedia.com", W - 60, 72);

        const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/png", 0.92));
        if (cancelled) return;
        if (blob) setPngUrl(URL.createObjectURL(blob));
        else setBuildError(true);
      } catch (e) {
        console.error("[battles] share card build failed", e);
        if (!cancelled) setBuildError(true);
      } finally {
        if (!cancelled) setBuilding(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, battleId, challengerImage, opponentImage]);

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };
  const open_url = (u: string) => window.open(u, "_blank", "noopener,noreferrer");

  const download = () => {
    if (!pngUrl) return;
    const a = document.createElement("a");
    a.href = pngUrl;
    a.download = `crown-battle-${challenger}-vs-${opponent}.png`;
    a.click();
  };

  const nativeShare = async () => {
    if (!pngUrl) return copy();
    try {
      const blob = await (await fetch(pngUrl)).blob();
      const file = new File([blob], `battle-${challenger}-vs-${opponent}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text, url, title: "Crown Battle on CrownMe Media" });
        return;
      }
    } catch { /* user dismissed or unsupported */ }
    copy();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg bg-card border-border max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-gold">Share this duel</DialogTitle>
          <DialogDescription className="text-xs">
            A custom card with both photos and the CrownMe Media logo.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl overflow-hidden border border-border bg-muted/30 aspect-[1200/630] flex items-center justify-center">
          {building ? (
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          ) : pngUrl ? (
            <img loading="lazy" src={pngUrl} alt="Battle share card preview" className="w-full h-full object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">Preview unavailable</span>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" aria-hidden />

        <div className="rounded-md border border-border bg-muted/30 p-2 flex items-center gap-2 text-[11px] font-mono text-muted-foreground overflow-hidden">
          <Link2 size={12} className="text-primary shrink-0" />
          <span className="truncate">{url}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Button variant="outline" onClick={nativeShare} disabled={building}>
            <Share2 size={14} /> Share
          </Button>
          <Button variant="outline" onClick={download} disabled={!pngUrl}>
            <Download size={14} /> Save
          </Button>
          <Button variant="outline" onClick={copy}>
            <Copy size={14} /> Link
          </Button>
          <Button variant="outline" onClick={() => open_url(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`)}>
            <Twitter size={14} /> X
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
