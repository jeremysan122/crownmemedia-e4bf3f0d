import { useEffect } from "react";
import { RoyalGift } from "@/types/gifts";
import { GiftIcon } from "./GiftIcon";

const COLOR_MAP: Record<RoyalGift["rarity"], string> = {
  common: "from-amber-400/30 to-yellow-600/20",
  rare: "from-sky-400/35 to-blue-700/25",
  epic: "from-purple-400/45 to-fuchsia-700/25",
  legendary: "from-yellow-300/55 via-amber-400/45 to-purple-600/40",
  mythic: "from-rose-400/60 via-fuchsia-500/55 to-amber-400/55",
};

const SUBTITLE: Record<string, string> = {
  royal_banner: "ALL HAIL 👑",
  royal_coronation: "A new monarch rises",
  golden_empire: "Bow to the empire",
  legendary_crown: "LEGEND BORN",
  crown_storm: "It's raining crowns",
  kingdom_arrival: "The kingdom awakens",
  global_spotlight: "All eyes on you",
  crown_steal_attempt: "CROWN UNDER THREAT",
  throne_rise: "The throne ascends",
  golden_wings: "Take flight",
  diamond_crown: "Pure brilliance",
  god_emperor_crown: "Reign eternal",
  crown_of_eternity: "Forever and always",
  divine_throne: "The divine descends",
  golden_universe: "All worlds bow",
  royal_godform: "Ascend",
  crown_of_worlds: "Sovereign of realms",
  celestial_dynasty: "Stars align",
  crown_ouroboros: "The eternal cycle",
  immortal_throne: "Undying glory",
  crown_of_creation: "Born of light",
};

/**
 * Royal gift animation overlay. All visuals are custom SVG (GiftIcon) — no emojis.
 * Particles, hero icon, rays and effects scale with rarity.
 */
export default function GiftAnimationOverlay({
  gift,
  quantity,
  onDone,
  anchored = false,
}: {
  gift: RoyalGift | null;
  quantity: number;
  onDone: () => void;
  anchored?: boolean;
}) {
  useEffect(() => {
    if (!gift) return;
    const isHeavy = gift.rarity === "legendary" || gift.rarity === "mythic";
    const t = setTimeout(onDone, isHeavy ? 2800 : 1700);
    return () => clearTimeout(t);
  }, [gift, onDone]);

  if (!gift) return null;

  const subtitle = SUBTITLE[gift.animationType] ?? gift.name;
  const isLegendary = gift.rarity === "legendary";
  const isMythic = gift.rarity === "mythic";
  const isHeavy = isLegendary || isMythic;

  const wrapperClass = anchored
    ? "absolute inset-0 z-30 pointer-events-none flex items-center justify-center overflow-hidden rounded-2xl"
    : "fixed inset-0 z-[100] pointer-events-none flex items-center justify-center overflow-hidden";

  const heroSize = anchored ? "lg" : "xl";
  const titleSize = anchored ? "text-2xl" : "text-3xl";

  // Particle count scales with rarity.
  const particleCount =
    gift.rarity === "common" ? 6 :
    gift.rarity === "rare" ? 10 :
    gift.rarity === "epic" ? 14 :
    isLegendary ? 20 : 28;

  // Pick the animation based on category for the particle behaviour.
  const particleAnim = (i: number) => {
    const base = `${1 + Math.random() * 1.6}s`;
    const delay = `${Math.random() * 0.5}s`;
    if (gift.animationType === "coin_rain" || gift.animationType === "crown_storm") {
      return { animation: `coin-rain ${base} ease-in forwards`, animationDelay: delay };
    }
    if (gift.animationType === "mini_crown_drop" || gift.animationType === "royal_coronation") {
      return { animation: `crown-drop ${base} cubic-bezier(0.22,1,0.36,1) forwards`, animationDelay: delay };
    }
    return { animation: `float-up ${base} ease-out forwards`, animationDelay: delay };
  };

  return (
    <div className={wrapperClass}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-gradient-to-b ${COLOR_MAP[gift.rarity]} animate-[fade-in_0.3s_ease-out]`}
      />
      {isHeavy && (
        <div
          aria-hidden
          className="absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, hsl(43 95% 60% / 0.55), transparent 60%)",
          }}
        />
      )}

      {/* Mythic cosmic ring */}
      {isMythic && !anchored && (
        <div
          className="absolute size-[120%] animate-[cosmic-rotate_8s_linear_infinite] rounded-full border border-[hsl(43_90%_60%/0.35)]"
          style={{ boxShadow: "0 0 80px 10px hsl(290 70% 55% / 0.35) inset" }}
        />
      )}

      {/* Lightning flashes for crown_thunder / crown_storm / crown_eclipse */}
      {(gift.animationType === "crown_thunder" || gift.animationType === "crown_storm") && (
        <div
          className="absolute inset-0 bg-[hsl(45_100%_85%/0.4)] animate-[lightning-flash_1.4s_ease-in-out_infinite] mix-blend-screen"
          aria-hidden
        />
      )}

      {/* Particles use the gift's SVG icon, not emojis */}
      {Array.from({ length: particleCount }).map((_, i) => (
        <span
          key={i}
          className="absolute"
          style={{
            left: `${Math.random() * 90 + 5}%`,
            bottom: `${Math.random() * 30}%`,
            ...particleAnim(i),
          }}
        >
          <GiftIcon
            animationType={gift.animationType}
            tier={gift.category}
            size={anchored ? "xs" : "sm"}
            animated={false}
          />
        </span>
      ))}

      {/* Hero icon */}
      <div className="relative animate-[scale-in_0.35s_ease-out] text-center">
        <div className={isHeavy ? "animate-[crown-pulse_1.6s_ease-in-out_infinite]" : ""}>
          <GiftIcon animationType={gift.animationType} tier={gift.category} size={heroSize} />
        </div>
        <p className={`font-display ${titleSize} text-gold mt-3 drop-shadow-[0_4px_20px_hsl(43_90%_55%/0.6)]`}>
          {gift.name}
        </p>
        <p className="text-[10px] uppercase tracking-[0.3em] text-foreground/80 mt-1">
          {subtitle}
        </p>
        {quantity > 1 && (
          <p className="mt-2 inline-block px-3 py-1 rounded-full bg-gradient-gold text-primary-foreground text-sm font-bold">
            ×{quantity}
          </p>
        )}
      </div>
    </div>
  );
}
