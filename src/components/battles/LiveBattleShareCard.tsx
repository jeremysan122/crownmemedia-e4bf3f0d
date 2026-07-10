// Branded share card for the Live Battle results screen. Renders to a
// hidden <canvas>, exports a PNG blob, and offers native share or download.
// Kept in a small self-contained component so the results screen stays lean.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Share2, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export interface ShareCardProps {
  battleId: string;
  winnerLabel: string;              // "Host wins", "Opponent wins", "It's a tie"
  hostName: string;
  opponentName: string;
  hostVotes: number;
  opponentVotes: number;
  category?: string | null;         // slug or human name
  region?: string | null;
  winnerSide: "host" | "opponent" | "tie";
}

// 1200x630 = OG-friendly. Draw everything with canvas primitives so we
// don't need external assets and it's deterministic across devices.
const W = 1200;
const H = 630;

function drawCard(ctx: CanvasRenderingContext2D, p: ShareCardProps) {
  // Background gradient — brand gold on deep navy.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b0b12");
  bg.addColorStop(1, "#1a1226");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle radial gold glow behind winner
  const glow = ctx.createRadialGradient(W / 2, H / 2 - 40, 40, W / 2, H / 2 - 40, 520);
  glow.addColorStop(0, "rgba(255,196,90,0.28)");
  glow.addColorStop(1, "rgba(255,196,90,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Header / brand
  ctx.fillStyle = "#F5CB5C";
  ctx.font = "700 28px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("CROWNME · LIVE BATTLE", 60, 70);

  // Category / region chip
  const chip = [p.category, p.region].filter(Boolean).join(" · ").toUpperCase();
  if (chip) {
    ctx.font = "600 20px system-ui, -apple-system, Segoe UI, sans-serif";
    const w = ctx.measureText(chip).width + 36;
    ctx.fillStyle = "rgba(245,203,92,0.12)";
    roundRect(ctx, W - 60 - w, 44, w, 40, 20);
    ctx.fill();
    ctx.fillStyle = "#F5CB5C";
    ctx.fillText(chip, W - 60 - w + 18, 71);
  }

  // Winner headline
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 84px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(p.winnerLabel, W / 2, H / 2 - 40);

  // Winner name (crown emoji if not tie)
  ctx.font = "700 44px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillStyle = "#F5CB5C";
  const winnerName =
    p.winnerSide === "host" ? `👑 ${p.hostName}`
    : p.winnerSide === "opponent" ? `👑 ${p.opponentName}`
    : "No clear winner";
  ctx.fillText(winnerName, W / 2, H / 2 + 26);

  // Vote totals
  const total = p.hostVotes + p.opponentVotes;
  const hostPct = total ? Math.round((p.hostVotes / total) * 100) : 50;
  const oppPct = 100 - hostPct;

  // Bar
  const barX = 120;
  const barY = H - 200;
  const barW = W - 240;
  const barH = 24;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  roundRect(ctx, barX, barY, barW, barH, 12);
  ctx.fill();
  ctx.fillStyle = "#F5CB5C";
  roundRect(ctx, barX, barY, (barW * hostPct) / 100, barH, 12);
  ctx.fill();
  ctx.fillStyle = "#8b5cf6";
  roundRect(ctx, barX + (barW * hostPct) / 100, barY, (barW * oppPct) / 100, barH, 12);
  ctx.fill();

  // Labels under bar
  ctx.font = "600 26px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`${p.hostName} · ${p.hostVotes} (${hostPct}%)`, barX, barY + barH + 40);
  ctx.textAlign = "right";
  ctx.fillText(`${p.opponentName} · ${p.opponentVotes} (${oppPct}%)`, barX + barW, barY + barH + 40);

  // Footer
  ctx.textAlign = "center";
  ctx.font = "500 22px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText(`${total} total votes · crownmemedia.com`, W / 2, H - 60);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default function LiveBattleShareCard(props: ShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    drawCard(ctx, props);
    setPreviewUrl(c.toDataURL("image/png"));
  }, [props]);

  const getBlob = (): Promise<Blob | null> =>
    new Promise((resolve) => {
      const c = canvasRef.current;
      if (!c) return resolve(null);
      c.toBlob((b) => resolve(b), "image/png", 0.95);
    });

  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/live/${props.battleId}`;
  const text = props.winnerSide === "tie"
    ? "A CrownMe Live Battle ended in a tie!"
    : `${props.winnerSide === "host" ? props.hostName : props.opponentName} just won a CrownMe Live Battle!`;

  const share = async () => {
    setBusy(true);
    try {
      const blob = await getBlob();
      const file = blob ? new File([blob], `crownme-live-battle-${props.battleId.slice(0, 8)}.png`, { type: "image/png" }) : null;
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (file && nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], text, url, title: "CrownMe Live Battle" });
      } else if (navigator.share) {
        await navigator.share({ text, url, title: "CrownMe Live Battle" });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast({ title: "Link copied", description: "Share it anywhere." });
      }
    } catch {
      // user cancelled or share failed silently — no toast noise
    } finally { setBusy(false); }
  };

  const download = async () => {
    const blob = await getBlob();
    if (!blob) return;
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `crownme-live-battle-${props.battleId.slice(0, 8)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(href);
  };

  return (
    <div className="w-full">
      <div className="rounded-xl overflow-hidden border border-border/60 bg-black/40">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={`${props.winnerLabel} — ${props.hostName} vs ${props.opponentName}`}
            className="w-full h-auto block"
          />
        ) : (
          <div className="aspect-[1200/630] flex items-center justify-center text-muted-foreground text-xs">
            Generating card…
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" aria-hidden />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button onClick={share} disabled={busy} className="w-full">
          {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Share2 className="w-4 h-4 mr-1" />}
          Share card
        </Button>
        <Button variant="outline" onClick={download} disabled={busy} className="w-full">
          <Download className="w-4 h-4 mr-1" /> Save image
        </Button>
      </div>
    </div>
  );
}
