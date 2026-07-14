import { Trophy, CheckCircle2 } from "lucide-react";
import { useRecentUnlocks } from "@/hooks/useRecentUnlocks";

const RARITY_CLS: Record<string, string> = {
  common:    "text-muted-foreground",
  rare:      "text-blue-400",
  epic:      "text-purple-400",
  legendary: "text-gold",
  mythic:    "text-fuchsia-400",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Chronological list of a user's recent achievement unlocks.
 */
export default function ProfileUnlockFeed({ userId }: { userId?: string | null }) {
  const { rows, loading } = useRecentUnlocks(userId, 20);
  if (!userId) return null;
  if (loading) return <div className="royal-card p-4 text-xs text-muted-foreground">Loading unlocks…</div>;
  if (rows.length === 0) {
    return (
      <div className="royal-card p-4 text-center">
        <Trophy size={20} className="mx-auto mb-2 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">No achievements unlocked yet.</p>
      </div>
    );
  }
  return (
    <ul className="royal-card divide-y divide-border">
      {rows.map((r) => (
        <li key={r.achievement_id} className="flex items-center justify-between gap-2 p-3">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 size={14} className="text-gold shrink-0" />
            <div className="min-w-0">
              <div className={`text-sm font-medium truncate ${RARITY_CLS[r.rarity] ?? ""}`}>{r.name}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.rarity}</div>
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground tabular-nums shrink-0">{r.completed_at ? timeAgo(r.completed_at) : ""}</div>
        </li>
      ))}
    </ul>
  );
}
