/**
 * Shared pure helpers for the achievements surface. Kept UI-free so they are
 * trivially unit-testable and reusable across the page + admin author.
 */
import type { AchievementRow } from "@/hooks/useMyAchievements";

export type SortKey = "rarity" | "progress" | "recent" | "closest";
export type StatusFilter = "all" | "in_progress" | "completed" | "locked";

export const RARITY_ORDER: Record<string, number> = {
  mythic: 5,
  legendary: 4,
  epic: 3,
  rare: 2,
  common: 1,
};

export function statusMatches(a: AchievementRow, f: StatusFilter): boolean {
  if (f === "completed") return a.status === "completed";
  if (f === "in_progress") return a.status !== "completed" && a.gates?.gates_ok !== false && (a.completion_percent || 0) > 0;
  if (f === "locked") return a.gates?.gates_ok === false;
  return true;
}

export function matchesSearch(a: AchievementRow, q: string): boolean {
  if (!q.trim()) return true;
  const needle = q.toLowerCase();
  return a.name.toLowerCase().includes(needle) || a.description.toLowerCase().includes(needle);
}

export function matchesRarity(a: AchievementRow, rarities: Set<string>): boolean {
  if (rarities.size === 0) return true;
  return rarities.has(a.rarity);
}

/**
 * Secret achievements are hidden until completed. Callers receive a masked
 * placeholder so they can render "???" cards uniformly.
 */
export function maskSecret(a: AchievementRow): AchievementRow {
  if (!a.is_secret) return a;
  if (a.status === "completed") return a;
  return { ...a, name: "???", description: "Hidden — unlock to reveal." };
}

export function sortAchievements(rows: AchievementRow[], sort: SortKey): AchievementRow[] {
  const copy = rows.slice();
  copy.sort((a, b) => {
    if (sort === "rarity") {
      const d = (RARITY_ORDER[b.rarity] ?? 0) - (RARITY_ORDER[a.rarity] ?? 0);
      if (d !== 0) return d;
      return (b.completion_percent || 0) - (a.completion_percent || 0);
    }
    if (sort === "progress") return (b.completion_percent || 0) - (a.completion_percent || 0);
    if (sort === "recent") {
      const at = a.completed_at ? new Date(a.completed_at).getTime() : 0;
      const bt = b.completed_at ? new Date(b.completed_at).getTime() : 0;
      return bt - at;
    }
    if (sort === "closest") {
      const ap = a.status === "completed" ? -1 : (a.completion_percent || 0);
      const bp = b.status === "completed" ? -1 : (b.completion_percent || 0);
      return bp - ap;
    }
    return 0;
  });
  return copy;
}

/**
 * Picks the single most-actionable "next up" achievement: incomplete, gates
 * satisfied, highest completion percent.
 */
export function pickNextUp(rows: AchievementRow[]): AchievementRow | null {
  const eligible = rows.filter(
    (a) => a.status !== "completed" && a.gates?.gates_ok !== false && (a.completion_percent || 0) > 0,
  );
  if (eligible.length === 0) return null;
  return eligible.slice().sort((a, b) => (b.completion_percent || 0) - (a.completion_percent || 0))[0];
}

/**
 * Best-effort mapping from a founder-only + rarity signal to a human unlock
 * hint. Used to distinguish gated cards from "in progress".
 */
export function unlockHint(a: AchievementRow): string {
  if (a.is_founder_only) return "Founder-only achievement.";
  if (a.gates?.required_account_age_days > 0) return `Account must be ${a.gates.required_account_age_days}+ days old.`;
  if (a.gates?.required_qualified_active_days > 0) return `Requires ${a.gates.required_qualified_active_days} qualified active days.`;
  return "Keep playing to make progress.";
}

export function rewardChipLabel(a: AchievementRow): string {
  const t = ((a as any).achievement_type as string | undefined) ?? a.rewards?.[0]?.reward_type;
  if (t === "badge_unlock" || t === "badge") return "Badge reward";
  if (t === "title_unlock" || t === "title") return "Title reward";
  if (t === "shekel_grant") return "Shekel reward";
  if (t === "boost_grant") return "Boost reward";
  return a.avatar_frame_id ? "Frame reward" : "Reward";
}
