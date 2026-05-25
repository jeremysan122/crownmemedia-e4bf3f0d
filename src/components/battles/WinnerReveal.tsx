import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { Crown, Trophy, TrendingUp } from "lucide-react";

interface Props {
  margin: number; // 0-100
  side: "L" | "R";
  fresh?: boolean; // trigger confetti on mount
}

/**
 * Premium winner reveal: glowing crown + ranked-riser banner.
 * Confetti fires when `fresh` is true (e.g. battle just ended in this session).
 */
export default function WinnerReveal({ margin, side, fresh }: Props) {
  const fired = useRef(false);

  useEffect(() => {
    if (!fresh || fired.current) return;
    fired.current = true;
    const end = Date.now() + 900;
    const colors = ["#F4C430", "#FFD86B", "#9333ea", "#FFFFFF"];
    (function frame() {
      confetti({
        particleCount: 4,
        angle: side === "L" ? 60 : 120,
        spread: 70,
        origin: { x: side === "L" ? 0.2 : 0.8, y: 0.4 },
        colors,
        scalar: 0.9,
        zIndex: 9999,
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }, [fresh, side]);

  const dominant = margin >= 40;

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-start pt-2 z-10">
      {/* Glow halo */}
      <div className="absolute inset-0 bg-gradient-to-t from-primary/40 via-primary/10 to-transparent animate-fade-in" />

      {/* Crown */}
      <div className="relative animate-scale-in" style={{ animationDuration: "0.5s" }}>
        <div className="absolute inset-0 blur-xl bg-primary/60 rounded-full" />
        <Crown
          size={32}
          className="relative text-primary drop-shadow-[0_0_12px_hsl(45_95%_60%/0.8)]"
          fill="currentColor"
          style={{ animation: "crown-pulse 1.6s ease-in-out infinite" }}
        />
      </div>

      {/* Winner banner */}
      <div className="mt-1 bg-gradient-gold text-primary-foreground text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-[0.15em] gold-shadow flex items-center gap-1 animate-fade-in">
        <Trophy size={10} /> Winner
      </div>

      {/* Ranked riser */}
      {dominant && (
        <div className="mt-1 bg-background/80 backdrop-blur text-primary text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border border-primary/40 flex items-center gap-1 animate-fade-in">
          <TrendingUp size={9} /> Crown +5 score
        </div>
      )}
    </div>
  );
}
