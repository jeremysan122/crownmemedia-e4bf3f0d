import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Crown, Trophy } from "lucide-react";
import { CATEGORIES, CATEGORY_LABEL, CrownCategory, formatScore } from "@/lib/crown";
import { Link } from "react-router-dom";
import { rankBadgeLabel, type GenderValue } from "@/lib/rankTitle";

type Scope = "nearby" | "city" | "state" | "country" | "global" | "following";

interface Props {
  scope: Scope;
  region: string;
  category: CrownCategory;
  followingIds: string[];
  userId: string | null;
  username: string | null;
  /** Refresh trigger — bump to re-query after vote/battle events. */
  refreshKey?: number;
}

interface RankResult {
  rank: number | null;
  total: number;
  topScore: number | null;
  /** Score and label of the rank immediately above me (1 = King, 2 = Queen, etc.). */
  nextAbove: { score: number; rank: number; label: "King" | "Queen" | string } | null;
  myBest: { score: number; postId: string } | null;
}

interface CrownPosition {
  category: CrownCategory;
  rank: 1 | 2;
  score: number;
}

/**
 * "My Rank" card — always shown on every leaderboard tab. Computes the
 * authenticated user's overall position in the current scope (even when
 * outside the visible top-50) and lists their #1/#2 positions across all
 * categories in this scope. Re-queries on `refreshKey` change so the card
 * stays fresh after vote / battle realtime events.
 */
export default function MyRankCard({
  scope, region, category, followingIds, userId, username, refreshKey = 0,
}: Props) {
  const [data, setData] = useState<RankResult | null>(null);
  const [positions, setPositions] = useState<CrownPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [myGender, setMyGender] = useState<GenderValue>(null);

  useEffect(() => {
    if (!userId) return;
    supabase.from("profiles").select("gender").eq("id", userId).maybeSingle()
      .then(({ data }) => setMyGender((data?.gender as GenderValue) ?? null));
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    if (!userId) { setData(null); setPositions([]); setLoading(false); return; }

    const scopeOk = (): boolean => {
      if (scope === "city" || scope === "nearby") return !!region;
      if (scope === "state") return !!region;
      if (scope === "country") return !!region;
      if (scope === "following") return followingIds.length > 0;
      return true; // global
    };

    const applyScope = <T,>(q: T): T => {
      let qq: any = (q as any).eq("is_removed", false);
      if (scope === "city" || scope === "nearby") qq = qq.eq("city", region);
      else if (scope === "state") qq = qq.eq("state", region);
      else if (scope === "country") qq = qq.eq("country", region);
      else if (scope === "following") qq = qq.in("user_id", followingIds);
      return qq as T;
    };

    const run = async () => {
      setLoading(true);
      if (!scopeOk()) {
        if (!cancelled) { setData({ rank: null, total: 0, topScore: null, nextAbove: null, myBest: null }); setPositions([]); setLoading(false); }
        return;
      }

      // 1) My best post in this scope+category
      const mineQ: any = applyScope(supabase.from("posts").select("id, crown_score"));
      const { data: mine } = await mineQ
        .eq("category", category).eq("user_id", userId)
        .order("crown_score", { ascending: false }).limit(1);
      const myBest = mine && mine.length > 0
        ? { score: Number(mine[0].crown_score), postId: mine[0].id as string }
        : null;

      // 2) Total + count above me in this scope+category
      let rank: number | null = null;
      let topScore: number | null = null;
      let nextAbove: RankResult["nextAbove"] = null;
      const totalQ: any = applyScope(supabase.from("posts").select("id", { count: "exact", head: true }));
      const { count: totalCount } = await totalQ.eq("category", category);
      const total = totalCount ?? 0;

      if (myBest) {
        const aboveQ: any = applyScope(supabase.from("posts").select("id", { count: "exact", head: true }));
        const { count: above } = await aboveQ.eq("category", category).gt("crown_score", myBest.score);
        rank = (above ?? 0) + 1;

        const topQ: any = applyScope(supabase.from("posts").select("crown_score"));
        const { data: top } = await topQ.eq("category", category).order("crown_score", { ascending: false }).limit(1);
        topScore = top && top.length ? Number(top[0].crown_score) : null;

        // Score of the post directly above me — the King/Queen I'm chasing.
        if (rank > 1) {
          const nextQ: any = applyScope(supabase.from("posts").select("crown_score"));
          const { data: next } = await nextQ
            .eq("category", category)
            .gt("crown_score", myBest.score)
            .order("crown_score", { ascending: true })
            .limit(1);
          if (next && next.length) {
            const nextRank = rank - 1;
            const label = nextRank === 1 ? "King" : nextRank === 2 ? "Queen" : `#${nextRank}`;
            nextAbove = { score: Number(next[0].crown_score), rank: nextRank, label };
          }
        }
      }

      // 3) King/Queen positions across ALL categories in this scope
      const found: CrownPosition[] = [];
      await Promise.all(
        CATEGORIES.map(async (cat) => {
          const q: any = applyScope(supabase.from("posts").select("user_id, crown_score"));
          const { data: top2 } = await q
            .eq("category", cat)
            .order("crown_score", { ascending: false })
            .limit(2);
          if (!top2) return;
          top2.forEach((row: any, i: number) => {
            if (row.user_id === userId) {
              found.push({ category: cat, rank: (i + 1) as 1 | 2, score: Number(row.crown_score) });
            }
          });
        }),
      );

      if (cancelled) return;
      setData({ rank, total, topScore, nextAbove, myBest });
      setPositions(found.sort((a, b) => a.rank - b.rank || b.score - a.score));
      setLoading(false);
    };

    run();
    return () => { cancelled = true; };
  }, [scope, region, category, followingIds, userId, refreshKey]);

  if (!userId) return null;

  return (
    <div className="royal-card border-primary/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy size={14} className="text-gold" fill="currentColor" />
          <span className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground">
            My Rank
          </span>
        </div>
        {username && (
          <span className="text-[11px] text-muted-foreground truncate max-w-[40%]">@{username}</span>
        )}
      </div>

      {loading ? (
        <div className="h-10 animate-pulse bg-muted/40 rounded-md" />
      ) : !data?.myBest ? (
        <p className="text-xs text-muted-foreground">
          You haven't posted in <span className="text-foreground font-semibold">{CATEGORY_LABEL[category]}</span> for this scope yet.{" "}
          <Link to="/upload" className="text-gold font-bold underline">Claim it</Link>.
        </p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="font-display text-3xl text-gold tabular-nums leading-none">
                #{data.rank}
                <span className="text-xs text-muted-foreground font-sans tabular-nums"> / {data.total}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                in {CATEGORY_LABEL[category]}
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 justify-end">
                <Crown size={12} className="text-primary" fill="currentColor" />
                <span className="text-sm font-bold tabular-nums">{formatScore(data.myBest.score)}</span>
              </div>
              {data.rank === 1 && (
                <p className="text-[10px] text-gold font-bold uppercase tracking-widest">You wear the crown</p>
              )}
            </div>
          </div>

          {/* Gap to next rank above (King/Queen/#N) */}
          {data.nextAbove && data.myBest && (() => {
            const gap = data.nextAbove.score - data.myBest.score;
            return (
              <div className="rounded-md bg-muted/40 border border-border/60 px-2.5 py-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <Crown size={11} className="text-primary" fill="currentColor" />
                  <span className="text-muted-foreground">Catch the</span>
                  <span className="font-bold">{data.nextAbove.label}</span>
                </div>
                <div className="text-right tabular-nums">
                  <span className="text-gold font-display text-base font-bold">+{formatScore(gap)}</span>
                  <span className="text-[10px] text-muted-foreground ml-1">to overtake</span>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {positions.length > 0 && (
        <div className="pt-2 border-t border-border/60">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1.5">
            Your royal positions
          </p>
          <div className="flex flex-wrap gap-1.5">
            {positions.map((p) => (
              <span
                key={p.category + p.rank}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  p.rank === 1
                    ? "bg-gradient-gold text-primary-foreground"
                    : "bg-muted text-foreground border border-border"
                }`}
              >
                <Crown size={9} fill="currentColor" />
                {rankBadgeLabel(myGender, p.rank)} · {CATEGORY_LABEL[p.category]}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
