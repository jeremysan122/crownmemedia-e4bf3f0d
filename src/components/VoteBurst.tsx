import { useEffect, useState } from "react";
import { Crown, Flame, Gem } from "lucide-react";
import { BrokenCrown } from "@/components/icons/BrokenCrown";
import type { VoteType } from "@/lib/votes";

interface BurstProps {
  type: VoteType | null;
  /** Score delta to display floating up (e.g. "+1", "+1.5"). Omit to hide. */
  delta?: string;
  onDone?: () => void;
}

const ICON: Record<VoteType, any> = {
  crown: Crown,
  fire: Flame,
  diamond: Gem,
  dislike: BrokenCrown,
};

const COLOR: Record<VoteType, string> = {
  crown: "text-amber-400",
  fire: "text-orange-500",
  diamond: "text-cyan-400",
  dislike: "text-zinc-400",
};

const PARTICLES = 10;

/**
 * Premium vote burst — radiating particles + floating "+x" delta + glow ring.
 * Pure CSS animation; no external libs.
 */
export default function VoteBurst({ type, delta, onDone }: BurstProps) {
  const [active, setActive] = useState<VoteType | null>(null);

  useEffect(() => {
    if (!type) return;
    setActive(type);
    const t = setTimeout(() => {
      setActive(null);
      onDone?.();
    }, 900);
    return () => clearTimeout(t);
  }, [type, onDone]);

  if (!active) return null;
  const Icon = ICON[active];
  const color = COLOR[active];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible flex items-center justify-center z-20">
      {/* Glow ring */}
      <span
        className={`absolute size-12 rounded-full ${color} opacity-70`}
        style={{
          background: "radial-gradient(circle, currentColor 0%, transparent 70%)",
          animation: "vote-ring 700ms ease-out forwards",
        }}
      />
      {/* Center icon pop */}
      <Icon
        size={28}
        className={`${color} drop-shadow-lg`}
        fill="currentColor"
        style={{ animation: "vote-pop 700ms cubic-bezier(.2,1.6,.4,1) forwards" }}
      />
      {/* Floating delta */}
      {delta && (
        <span
          className={`absolute font-display text-base font-bold ${color}`}
          style={{ animation: "vote-delta 900ms ease-out forwards" }}
        >
          {delta}
        </span>
      )}
      {/* Radiating particles */}
      {Array.from({ length: PARTICLES }).map((_, i) => {
        const angle = (i / PARTICLES) * Math.PI * 2;
        const tx = Math.cos(angle) * 36;
        const ty = Math.sin(angle) * 36;
        return (
          <span
            key={i}
            className={`absolute size-1.5 rounded-full ${color} bg-current`}
            style={{
              animation: "vote-particle 700ms ease-out forwards",
              ["--tx" as any]: `${tx}px`,
              ["--ty" as any]: `${ty}px`,
            }}
          />
        );
      })}
    </div>
  );
}
