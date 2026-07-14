import { Sparkles } from "lucide-react";

const RARITY_CLS: Record<string, string> = {
  common:    "border-border text-muted-foreground",
  rare:      "border-blue-500/40 text-blue-400",
  epic:      "border-purple-500/40 text-purple-300",
  legendary: "border-gold/50 text-gold",
  mythic:    "border-fuchsia-500/50 text-fuchsia-300",
};

/**
 * Small chip showing a user's currently equipped title. Renders nothing when
 * no title is equipped.
 */
export default function EquippedTitleChip({
  text,
  rarity,
  className = "",
}: { text: string | null | undefined; rarity: string | null | undefined; className?: string }) {
  if (!text) return null;
  const cls = RARITY_CLS[rarity ?? "rare"] || RARITY_CLS.rare;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls} ${className}`}>
      <Sparkles size={10} /> {text}
    </span>
  );
}
