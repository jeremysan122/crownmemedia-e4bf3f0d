import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { rarityLabel } from "@/hooks/useAchievementRarity";

interface ShowcaseRow {
  achievement_id: string;
  slug: string;
  name: string;
  description: string;
  rarity: string;
  completed_at: string;
  rarity_pct: number;
  avatar_frame_id: string | null;
}

/**
 * Renders a user's rarest completed achievements at the top of their profile.
 * Server-side ranked by rarity_pct so it stays cheap; hidden entirely when
 * the user has no completed achievements.
 */
export default function ProfileAchievementsShowcase({
  userId,
  isMe = false,
  limit = 3,
}: { userId: string; isMe?: boolean; limit?: number }) {
  const [rows, setRows] = useState<ShowcaseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase.rpc("profile_showcased_achievements", {
        _user_id: userId,
        _limit: limit,
      });
      if (cancel) return;
      setRows(((data ?? []) as unknown) as ShowcaseRow[]);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [userId, limit]);

  if (loading || rows.length === 0) return null;

  return (
    <section aria-label="Rare achievements" className="royal-card p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Trophy size={14} className="text-gold" />
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-gold/80">Rare Achievements</h2>
        </div>
        {isMe && (
          <Link to="/achievements" className="text-[10px] text-gold/80 hover:text-gold">
            View all →
          </Link>
        )}
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {rows.map((r) => (
          <li
            key={r.achievement_id}
            className="rounded-lg border border-gold/20 bg-background/40 p-2.5"
            title={r.description}
          >
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-gold/80 mb-1">
              <Sparkles size={10} />
              {rarityLabel(r.rarity_pct)} · {r.rarity_pct}%
            </div>
            <div className="font-display text-sm text-foreground leading-tight truncate">
              {r.name}
            </div>
            <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
              {r.description}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
