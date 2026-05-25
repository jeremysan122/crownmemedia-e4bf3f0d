export type CrownCategory =
  | "overall"
  | "best_style"
  | "most_creative"
  | "most_popular"
  | "best_look"
  | "best_outfit"
  | "best_smile"
  | "best_eyes"
  | "best_hair"
  | "best_glow"
  | "best_makeup"
  | "best_fit"
  | "best_streetwear"
  | "best_formal"
  | "best_swimwear"
  | "best_accessories"
  | "best_shoes"
  | "best_pose"
  | "best_aesthetic"
  | "best_vibe"
  | "best_confidence"
  | "best_glow_up"
  | "best_couple"
  | "best_pet"
  | "best_travel"
  | "best_fitness"
  | "best_throwback"
  | "rising_star";

export const CATEGORY_LABEL: Record<CrownCategory, string> = {
  overall: "Overall Crown",
  best_style: "Best Style",
  most_creative: "Most Creative",
  most_popular: "Most Popular",
  best_look: "Best Look",
  best_outfit: "Best Outfit",
  best_smile: "Best Smile",
  best_eyes: "Best Eyes",
  best_hair: "Best Hair",
  best_glow: "Best Glow",
  best_makeup: "Best Makeup",
  best_fit: "Best Fit",
  best_streetwear: "Best Streetwear",
  best_formal: "Best Formal",
  best_swimwear: "Best Swimwear",
  best_accessories: "Best Accessories",
  best_shoes: "Best Shoes",
  best_pose: "Best Pose",
  best_aesthetic: "Best Aesthetic",
  best_vibe: "Best Vibe",
  best_confidence: "Best Confidence",
  best_glow_up: "Best Glow-Up",
  best_couple: "Best Couple",
  best_pet: "Best Pet",
  best_travel: "Best Travel",
  best_fitness: "Best Fitness",
  best_throwback: "Best Throwback",
  rising_star: "Rising Star",
};

export const CATEGORIES: CrownCategory[] = [
  "overall",
  "best_style",
  "most_creative",
  "most_popular",
  "best_look",
  "best_outfit",
  "best_smile",
  "best_eyes",
  "best_hair",
  "best_glow",
  "best_makeup",
  "best_fit",
  "best_streetwear",
  "best_formal",
  "best_swimwear",
  "best_accessories",
  "best_shoes",
  "best_pose",
  "best_aesthetic",
  "best_vibe",
  "best_confidence",
  "best_glow_up",
  "best_couple",
  "best_pet",
  "best_travel",
  "best_fitness",
  "best_throwback",
  "rising_star",
];

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

export function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

export function calculateAge(dob: string): number {
  const d = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const mDiff = now.getMonth() - d.getMonth();
  if (mDiff < 0 || (mDiff === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export function formatScore(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return Math.round(n).toString();
}

export function locationLabel(p: { city?: string | null; state?: string | null; country?: string | null }): string {
  return [p.city, p.state, p.country].filter(Boolean).join(", ") || "Global";
}
