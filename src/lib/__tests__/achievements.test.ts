import { describe, it, expect } from "vitest";
import {
  matchesRarity,
  matchesSearch,
  maskSecret,
  pickNextUp,
  rewardChipLabel,
  sortAchievements,
  statusMatches,
  endsInDays,
  RARITY_ORDER,
} from "@/lib/achievements";
import type { AchievementRow } from "@/hooks/useMyAchievements";

const mk = (over: Partial<AchievementRow>): AchievementRow => ({
  achievement_id: over.slug ?? "id",
  slug: over.slug ?? "s",
  name: over.name ?? "Name",
  description: over.description ?? "Desc",
  collection_id: null,
  collection_slug: null,
  rarity: "rare",
  is_founder_only: false,
  is_secret: false,
  avatar_frame_id: null,
  requirement_logic: {},
  checkpoint_rewards: [],
  progress: {},
  completion_percent: 0,
  highest_checkpoint: 0,
  status: "in_progress",
  started_at: null,
  completed_at: null,
  rewards: [],
  gates: { account_age_days: 0, required_account_age_days: 0, qualified_active_days: 0, required_qualified_active_days: 0, distinct_active_weeks: 0, required_distinct_active_weeks: 0, gates_ok: true },
  starts_at: null,
  ends_at: null,
  ...over,
} as AchievementRow);

describe("achievements helpers", () => {
  it("statusMatches handles all four filters", () => {
    const done = mk({ status: "completed", completion_percent: 100 });
    const inProg = mk({ completion_percent: 40 });
    const locked = mk({ gates: { ...done.gates, gates_ok: false } });
    expect(statusMatches(done, "completed")).toBe(true);
    expect(statusMatches(inProg, "in_progress")).toBe(true);
    expect(statusMatches(locked, "locked")).toBe(true);
    expect(statusMatches(inProg, "all")).toBe(true);
  });

  it("matchesSearch is case-insensitive and hits name or description", () => {
    const a = mk({ name: "Champion", description: "Win 25 battles" });
    expect(matchesSearch(a, "champ")).toBe(true);
    expect(matchesSearch(a, "BATTLES")).toBe(true);
    expect(matchesSearch(a, "nope")).toBe(false);
    expect(matchesSearch(a, "")).toBe(true);
  });

  it("matchesRarity respects the filter set", () => {
    const a = mk({ rarity: "epic" });
    expect(matchesRarity(a, new Set())).toBe(true);
    expect(matchesRarity(a, new Set(["epic"]))).toBe(true);
    expect(matchesRarity(a, new Set(["rare"]))).toBe(false);
  });

  it("maskSecret hides incomplete secrets and reveals completed ones", () => {
    const secret = mk({ is_secret: true, name: "Real", description: "Real desc" });
    expect(maskSecret(secret).name).toBe("???");
    const done = mk({ is_secret: true, status: "completed", name: "Real" });
    expect(maskSecret(done).name).toBe("Real");
  });

  it("sortAchievements sorts by rarity descending, then progress", () => {
    const rows = [
      mk({ slug: "a", rarity: "rare", completion_percent: 10 }),
      mk({ slug: "b", rarity: "mythic", completion_percent: 5 }),
      mk({ slug: "c", rarity: "epic", completion_percent: 80 }),
    ];
    const sorted = sortAchievements(rows, "rarity");
    expect(sorted.map((r) => r.slug)).toEqual(["b", "c", "a"]);
    expect(RARITY_ORDER.mythic).toBeGreaterThan(RARITY_ORDER.rare);
  });

  it("sortAchievements 'closest' surfaces closest-to-complete first, gated below in-progress, completed last", () => {
    const gated = mk({ slug: "gated", completion_percent: 95, gates: { ...mk({}).gates, gates_ok: false } });
    const rows = [
      mk({ slug: "done", status: "completed", completion_percent: 100 }),
      gated,
      mk({ slug: "far", completion_percent: 10 }),
      mk({ slug: "near", completion_percent: 90 }),
    ];
    const sorted = sortAchievements(rows, "closest");
    expect(sorted[0].slug).toBe("near");
    expect(sorted[1].slug).toBe("far");
    // Gated demoted below in-progress rows even with higher raw progress
    expect(sorted[2].slug).toBe("done");
    expect(sorted[3].slug).toBe("gated");
  });

  it("pickNextUp returns the most-progressed eligible row", () => {
    const rows = [
      mk({ slug: "done", status: "completed", completion_percent: 100 }),
      mk({ slug: "gated", gates: { ...mk({}).gates, gates_ok: false }, completion_percent: 99 }),
      mk({ slug: "near", completion_percent: 80 }),
      mk({ slug: "far", completion_percent: 20 }),
    ];
    expect(pickNextUp(rows)?.slug).toBe("near");
  });

  it("pickNextUp returns null when nothing is actionable", () => {
    const rows = [mk({ slug: "done", status: "completed", completion_percent: 100 })];
    expect(pickNextUp(rows)).toBeNull();
  });

  it("rewardChipLabel maps every reward type", () => {
    expect(rewardChipLabel(mk({ avatar_frame_id: "f" }))).toBe("Frame reward");
    expect(rewardChipLabel(mk({ rewards: [{ checkpoint: 100, reward_type: "badge", reward_id: null, granted_at: "", expires_at: null, is_revoked: false }] }))).toBe("Badge reward");
    expect(rewardChipLabel({ ...mk({}), achievement_type: "title_unlock" } as any)).toBe("Title reward");
    expect(rewardChipLabel({ ...mk({}), achievement_type: "shekel_grant" } as any)).toBe("Shekel reward");
    expect(rewardChipLabel({ ...mk({}), achievement_type: "boost_grant" } as any)).toBe("Boost reward");
  });

  it("endsInDays returns null when not seasonal or already ended", () => {
    expect(endsInDays(mk({ ends_at: null }))).toBeNull();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(endsInDays(mk({ ends_at: past }))).toBeNull();
  });

  it("endsInDays rounds up remaining full days", () => {
    const now = Date.UTC(2026, 6, 14, 0, 0, 0);
    const in3d = new Date(now + 3 * 86_400_000 + 60_000).toISOString();
    expect(endsInDays(mk({ ends_at: in3d }), now)).toBe(4);
    const in12h = new Date(now + 12 * 3600_000).toISOString();
    expect(endsInDays(mk({ ends_at: in12h }), now)).toBe(1);
  });
});
