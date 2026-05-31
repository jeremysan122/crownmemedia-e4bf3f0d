import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Navigate, Link } from "react-router-dom";
import { Loader2, Crown, Swords, RefreshCcw, Search } from "lucide-react";
import { CATEGORY_LABEL, timeAgo } from "@/lib/crown";
import AdminSessionHint from "@/components/admin/AdminSessionHint";

interface BattleRow {
  id: string;
  status: string;
  winner_id: string | null;
  challenger_id: string;
  opponent_id: string;
  challenger_post_id: string;
  opponent_post_id: string | null;
  challenger_votes: number;
  opponent_votes: number;
  created_at: string;
  ends_at: string | null;
}

interface PostMini {
  id: string;
  user_id: string;
  category: string;
  crown_score: number;
  battle_wins: number;
  caption: string;
}

interface ProfileMini { id: string; username: string }

interface BonusNotification {
  id: string;
  user_id: string;
  created_at: string;
  payload: {
    battle_id?: string;
    post_id?: string;
    battle_win_bonus?: number;
    crown_steal_bonus?: number;
    bonus?: number;
    previous_score?: number;
    score_after_win?: number;
    final_score?: number;
    leader_score?: number;
    crown_stolen?: boolean;
    category?: string;
  };
}

/**
 * Per-post Race Audit:
 *   - Lists completed battles where the post (or its owner) was the winner
 *   - Joins the bonus notification emitted by trg_battle_completed so admins
 *     can verify which battle triggered the +5 win bonus / +25 crown-steal bonus.
 */
export default function AdminRaceAudit() {
  const { isAdmin, loading } = useAuth();
  const [postId, setPostId] = useState("");
  const [busy, setBusy] = useState(false);
  const [post, setPost] = useState<PostMini | null>(null);
  const [winner, setWinner] = useState<ProfileMini | null>(null);
  const [battles, setBattles] = useState<BattleRow[]>([]);
  const [notifs, setNotifs] = useState<BonusNotification[]>([]);
  const [error, setError] = useState<string | null>(null);

  const inspect = async (id: string) => {
    setBusy(true); setError(null); setPost(null); setBattles([]); setNotifs([]); setWinner(null);
    try {
      const { data: p, error: perr } = await supabase
        .from("posts")
        .select("id, user_id, category, crown_score, battle_wins, caption")
        .eq("id", id)
        .maybeSingle();
      if (perr) throw perr;
      if (!p) { setError("No post found with that id."); return; }
      setPost(p as PostMini);

      const { data: prof } = await supabase
        .from("profiles").select("id, username").eq("id", p.user_id).maybeSingle();
      setWinner((prof as ProfileMini) ?? null);

      // Battles where this post participated and was the winner.
      const { data: bs } = await supabase
        .from("battles")
        .select("id, status, winner_id, challenger_id, opponent_id, challenger_post_id, opponent_post_id, challenger_votes, opponent_votes, created_at, ends_at")
        .eq("status", "completed")
        .eq("winner_id", p.user_id)
        .or(`challenger_post_id.eq.${id},opponent_post_id.eq.${id}`)
        .order("created_at", { ascending: false })
        .limit(50);
      setBattles((bs as BattleRow[]) ?? []);

      // Bonus notifications emitted by the trigger reference the battle + post
      // in their payload. We pull recent vote-type notifications for this user
      // and filter by post_id in the payload to surface the bonus breakdown.
      const { data: ns } = await supabase
        .from("notifications")
        .select("id, user_id, created_at, payload")
        .eq("user_id", p.user_id)
        .eq("type", "vote")
        .order("created_at", { ascending: false })
        .limit(100);
      const filtered = ((ns as BonusNotification[]) ?? []).filter(
        (n) => n.payload?.post_id === id && typeof n.payload?.battle_win_bonus === "number"
      );
      setNotifs(filtered);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit data.");
    } finally {
      setBusy(false);
    }
  };

  // Map battle_id -> notification for quick join
  const notifByBattle = useMemo(() => {
    const m = new Map<string, BonusNotification>();
    for (const n of notifs) if (n.payload?.battle_id) m.set(n.payload.battle_id, n);
    return m;
  }, [notifs]);

  if (loading) return <AppShell><div className="py-20 text-center">Loading…</div></AppShell>;
  if (!isAdmin) return <Navigate to="/feed" replace />;

  return (
    <AppShell title="RACE AUDIT">
      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center gap-2">
          <Swords size={20} className="text-gold" />
          <h1 className="font-display text-2xl text-gold">Battle Win Bonus Audit</h1>
        </div>
        <AdminSessionHint />

        <div className="royal-card p-3 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Paste a post id to see every completed Crown Battle that awarded its +5 Battle Win Bonus
            (and any +25 crown-steal bonus) to that post's owner. Joined with the bonus notification
            emitted by <code className="text-foreground/80">trg_battle_completed</code> for full traceability.
          </p>
          <form
            onSubmit={(e) => { e.preventDefault(); if (postId.trim()) inspect(postId.trim()); }}
            className="flex items-center gap-2"
          >
            <input
              value={postId}
              onChange={(e) => setPostId(e.target.value)}
              placeholder="post uuid…"
              className="flex-1 bg-background/40 border border-border/60 rounded-lg px-3 py-2 text-sm font-mono"
            />
            <button
              type="submit"
              disabled={busy || !postId.trim()}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-xs disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              Audit
            </button>
            {post && (
              <button
                type="button"
                onClick={() => inspect(post.id)}
                className="text-[11px] inline-flex items-center gap-1 px-2 py-2 rounded-lg bg-muted/40 hover:bg-muted/60 border border-border/50"
                title="Refresh"
              >
                <RefreshCcw size={12} />
              </button>
            )}
          </form>
          {error && <p className="text-[11px] text-destructive">{error}</p>}
        </div>

        {post && (
          <div className="royal-card p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                Post · {CATEGORY_LABEL[post.category as keyof typeof CATEGORY_LABEL] ?? post.category}
              </span>
              <Link to={`/post/${post.id}`} className="text-[11px] text-primary hover:underline">View in feed →</Link>
            </div>
            <div className="text-sm font-semibold truncate">{post.caption || "(no caption)"}</div>
            <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              <span>Owner: @{winner?.username ?? post.user_id.slice(0, 8)}</span>
              <span className="tabular-nums">Crown Score: <span className="text-foreground">{post.crown_score.toFixed(2)}</span></span>
              <span className="tabular-nums">Battle Wins: <span className="text-foreground">{post.battle_wins}</span></span>
            </div>
          </div>
        )}

        {post && (
          <div className="space-y-2">
            <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground">
              Completed Battles · {battles.length} win{battles.length === 1 ? "" : "s"}
            </h2>
            {battles.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">
                No completed battle wins for this post.
              </p>
            ) : (
              battles.map((b) => {
                const n = notifByBattle.get(b.id);
                const stolen = !!n?.payload?.crown_stolen;
                const totalBonus = n?.payload?.bonus ?? n?.payload?.battle_win_bonus ?? 5;
                return (
                  <div key={b.id} className="royal-card p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                        stolen
                          ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                          : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                      }`}>
                        {stolen ? <span className="inline-flex items-center gap-1"><Crown size={10} fill="currentColor" /> Crown stolen</span> : "Battle won"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{timeAgo(b.created_at)}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground break-all">battle_id {b.id}</div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <Stat label="Challenger votes" value={b.challenger_votes.toString()} />
                      <Stat label="Opponent votes" value={b.opponent_votes.toString()} />
                      <Stat label="Battle win bonus" value={`+${(n?.payload?.battle_win_bonus ?? 5).toFixed(0)}`} accent />
                      <Stat label="Crown-steal bonus" value={`+${(n?.payload?.crown_steal_bonus ?? 0).toFixed(0)}`} accent={stolen} />
                      {typeof n?.payload?.previous_score === "number" && (
                        <Stat label="Score before" value={n.payload.previous_score.toFixed(2)} />
                      )}
                      {typeof n?.payload?.final_score === "number" && (
                        <Stat label="Score after" value={n.payload.final_score.toFixed(2)} accent />
                      )}
                      {typeof n?.payload?.leader_score === "number" && (
                        <Stat label="Region leader at win" value={n.payload.leader_score.toFixed(2)} />
                      )}
                      <Stat label="Total bonus" value={`+${Number(totalBonus).toFixed(0)}`} accent />
                    </div>
                    {!n && (
                      <p className="text-[10px] text-amber-300/80">
                        ⚠ No matching bonus notification found — bonus was applied by the trigger but the notification may have been pruned.
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1 rounded-md bg-muted/30 border border-border/40">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-[12px] font-bold tabular-nums ${accent ? "text-primary" : "text-foreground"}`}>{value}</span>
    </div>
  );
}
