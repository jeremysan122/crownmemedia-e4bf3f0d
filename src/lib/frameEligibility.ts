// Pure eligibility logic mirroring public.check_and_award_frames() so we can
// unit-test threshold behavior without hitting the database.

export interface FrameRewardStats {
  crowns: number;
  battles_won: number;
  longest_streak: number;
  shields_used: number;
  is_royal: boolean;
  is_founder: boolean;
}

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

export const FRAME_THRESHOLDS: Record<FrameKey, (s: FrameRewardStats) => boolean> = {
  "crown-prestige":  (s) => s.crowns >= 100,
  "royal-purple":    (s) => !!s.is_royal,
  "golden-majesty":  (s) => s.battles_won >= 100,
  "royal-laurel":    (s) => s.battles_won >= 500,
  "diamond-royal":   (s) => s.crowns >= 1000,
  "royal-sovereign": (s) => s.crowns >= 10000,
  "midnight-royal":  (s) => s.longest_streak >= 100,
  "royal-shield":    (s) => s.shields_used >= 100,
  "imperial-glow":   (s) => !!s.is_founder,
};

/** Returns every frame key the given stats bundle qualifies for. */
export function eligibleFrames(stats: FrameRewardStats): FrameKey[] {
  return (Object.keys(FRAME_THRESHOLDS) as FrameKey[]).filter((k) =>
    FRAME_THRESHOLDS[k](stats),
  );
}
