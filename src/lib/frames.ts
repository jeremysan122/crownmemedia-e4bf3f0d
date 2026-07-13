// Catalog of achievement-unlockable avatar frames. Keep FRAME_KEYS in sync
// with public.check_and_award_frames() and public.my_frame_progress().

import crownPrestige from "@/assets/frames/crown-prestige.png.asset.json";
import royalPurple from "@/assets/frames/royal-purple.png.asset.json";
import goldenMajesty from "@/assets/frames/golden-majesty.png.asset.json";
import royalLaurel from "@/assets/frames/royal-laurel.png.asset.json";
import diamondRoyal from "@/assets/frames/diamond-royal.png.asset.json";
import royalSovereign from "@/assets/frames/royal-sovereign.png.asset.json";
import midnightRoyal from "@/assets/frames/midnight-royal.png.asset.json";
import royalShield from "@/assets/frames/royal-shield.png.asset.json";
import imperialGlow from "@/assets/frames/imperial-glow.png.asset.json";

export type FrameKey =
  | "crown-prestige"
  | "royal-purple"
  | "golden-majesty"
  | "royal-laurel"
  | "diamond-royal"
  | "royal-sovereign"
  | "midnight-royal"
  | "royal-shield"
  | "imperial-glow";

export interface FrameDef {
  key: FrameKey;
  label: string;
  tagline: string;
  requirement: string;
  target: number;
  url: string;
  /** True if progress is a binary flag (0/1) rather than an accumulating count. */
  binary?: boolean;
}

export const FRAMES: FrameDef[] = [
  { key: "crown-prestige",  label: "Crown Prestige",  tagline: "Century of crowns.",             requirement: "Earn 100 crowns",              target: 100,   url: crownPrestige.url },
  { key: "royal-purple",    label: "Royal Purple",    tagline: "Reserved for pass holders.",     requirement: "Activate Royal Pass",          target: 1,     url: royalPurple.url, binary: true },
  { key: "golden-majesty",  label: "Golden Majesty",  tagline: "A proven battler.",              requirement: "Win 100 battles",              target: 100,   url: goldenMajesty.url },
  { key: "royal-laurel",    label: "Royal Laurel",    tagline: "Decorated in victory.",          requirement: "Win 500 battles",              target: 500,   url: royalLaurel.url },
  { key: "diamond-royal",   label: "Diamond Royal",   tagline: "A thousand-crown legend.",       requirement: "Earn 1,000 crowns",            target: 1000,  url: diamondRoyal.url },
  { key: "royal-sovereign", label: "Royal Sovereign", tagline: "Elite of the leaderboard.",      requirement: "Earn 10,000 crowns",           target: 10000, url: royalSovereign.url },
  { key: "midnight-royal",  label: "Midnight Royal",  tagline: "One hundred nights in a row.",   requirement: "100-day login streak",         target: 100,   url: midnightRoyal.url },
  { key: "royal-shield",    label: "Royal Shield",    tagline: "Defender of the crown.",         requirement: "Use 100 Crown Shields",        target: 100,   url: royalShield.url },
  { key: "imperial-glow",   label: "Imperial Glow",   tagline: "For the founding royals.",       requirement: "Founding Royal Member",        target: 1,     url: imperialGlow.url, binary: true },
];

export const FRAME_MAP: Record<FrameKey, FrameDef> = Object.fromEntries(
  FRAMES.map((f) => [f.key, f]),
) as Record<FrameKey, FrameDef>;

export function getFrameUrl(key?: string | null): string | null {
  if (!key) return null;
  return FRAME_MAP[key as FrameKey]?.url ?? null;
}
