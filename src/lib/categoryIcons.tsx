import {
  Crown, Sparkles, Palette, Flame, Eye, Smile, Scissors, Sun, Brush,
  Shirt, Footprints, Glasses, Camera, Heart, Award, TrendingUp, Star,
  Users, PawPrint, Plane, Dumbbell, Clock, Wand2, Gem, Waves, Briefcase,
  Aperture, Zap,
} from "lucide-react";
import type { CrownCategory } from "./crown";
import type { LucideIcon } from "lucide-react";

export const CATEGORY_ICON: Record<CrownCategory, LucideIcon> = {
  overall: Crown,
  best_style: Sparkles,
  most_creative: Palette,
  most_popular: Flame,
  best_look: Eye,
  best_outfit: Shirt,
  best_smile: Smile,
  best_eyes: Eye,
  best_hair: Scissors,
  best_glow: Sun,
  best_makeup: Brush,
  best_fit: Shirt,
  best_streetwear: Aperture,
  best_formal: Briefcase,
  best_swimwear: Waves,
  best_accessories: Glasses,
  best_shoes: Footprints,
  best_pose: Camera,
  best_aesthetic: Gem,
  best_vibe: Wand2,
  best_confidence: Award,
  best_glow_up: TrendingUp,
  best_couple: Heart,
  best_pet: PawPrint,
  best_travel: Plane,
  best_fitness: Dumbbell,
  best_throwback: Clock,
  rising_star: Star,
};

// Rich gradient pairings for each category badge
export const CATEGORY_GRADIENT: Record<CrownCategory, string> = {
  overall: "from-amber-400 to-yellow-600",
  best_style: "from-fuchsia-500 to-purple-700",
  most_creative: "from-violet-500 to-indigo-700",
  most_popular: "from-orange-500 to-red-600",
  best_look: "from-rose-400 to-pink-600",
  best_outfit: "from-emerald-400 to-teal-600",
  best_smile: "from-yellow-300 to-amber-500",
  best_eyes: "from-sky-400 to-blue-700",
  best_hair: "from-amber-600 to-orange-800",
  best_glow: "from-yellow-300 to-orange-500",
  best_makeup: "from-pink-400 to-rose-700",
  best_fit: "from-lime-400 to-green-700",
  best_streetwear: "from-zinc-500 to-slate-800",
  best_formal: "from-slate-600 to-stone-900",
  best_swimwear: "from-cyan-400 to-blue-600",
  best_accessories: "from-amber-300 to-yellow-700",
  best_shoes: "from-stone-500 to-zinc-800",
  best_pose: "from-purple-400 to-fuchsia-700",
  best_aesthetic: "from-indigo-400 to-purple-700",
  best_vibe: "from-teal-400 to-cyan-700",
  best_confidence: "from-red-500 to-rose-700",
  best_glow_up: "from-pink-400 to-amber-500",
  best_couple: "from-rose-500 to-red-600",
  best_pet: "from-orange-400 to-amber-700",
  best_travel: "from-sky-400 to-indigo-600",
  best_fitness: "from-emerald-500 to-green-700",
  best_throwback: "from-amber-700 to-stone-900",
  rising_star: "from-yellow-400 to-amber-700",
};

export function CategoryBadge({
  category,
  label,
  size = "sm",
  className = "",
}: {
  category: CrownCategory;
  label: string;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const Icon = CATEGORY_ICON[category] ?? Crown;
  const grad = CATEGORY_GRADIENT[category] ?? "from-amber-400 to-yellow-600";
  const sz =
    size === "xs"
      ? "text-[10px] px-2 py-0.5 gap-1"
      : size === "md"
      ? "text-xs px-3 py-1.5 gap-1.5"
      : "text-[11px] px-2.5 py-1 gap-1.5";
  const ic = size === "xs" ? 10 : size === "md" ? 14 : 12;
  return (
    <span
      className={`inline-flex items-center rounded-full font-bold uppercase tracking-wider bg-gradient-to-br ${grad} text-white shadow-sm ring-1 ring-white/10 ${sz} ${className}`}
    >
      <Icon size={ic} fill="currentColor" strokeWidth={2.2} className="opacity-90" />
      <span className="whitespace-nowrap">{label}</span>
    </span>
  );
}
