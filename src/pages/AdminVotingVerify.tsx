import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Navigate, Link } from "react-router-dom";
import { Loader2, CheckCircle2, AlertTriangle, ShieldCheck, Crown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AdminSessionHint from "@/components/admin/AdminSessionHint";

interface Post {
  id: string;
  user_id: string;
  caption: string | null;
  crown_score: number;
  vote_count: number;
  comment_count: number;
  share_count: number;
  battle_wins: number;
  is_removed: boolean;
  created_at: string;
}

interface VoteRow { post_id: string; vote_type: "crown" | "fire" | "diamond" }
interface CommentRow { post_id: string }
interface BoostRow { post_id: string }

interface Computed {
  post: Post;
  crown: number;
  fire: number;
  diamond: number;
  totalVotes: number;
  comments: number;
  hasBoost: boolean;
  expectedScore: number;
  scoreDelta: number;
  voteDelta: number;
  commentDelta: number;
  problems: { level: "ok" | "warn" | "error"; msg: string }[];
}

const TOLERANCE = 0.01;

function recalcScore(crown: number, fire: number, diamond: number, comments: number, shares: number, battleWins: number, hasBoost: boolean): number {
  const base = crown + fire * 0.5 + diamond * 1.5;
  const boost = hasBoost ? 1.5 : 1.0;
  return (base + base * (comments * 0.01) + shares * 0.25 + battleWins * 5) * boost;
}

export default function AdminVotingVerify() {
  const { isModerator, loading } = useAuth();
  const [busy, setBusy] = useState(true);
  const [limit, setLimit] = useState(100);
  const [filterIssues, setFilterIssues] = useState(true);
  const [rows, setRows] = useState<Computed[]>([]);

  const reload = async () => {
    setBusy(true);

    // Pull recent posts
    const { data: postsData } = await supabase
      .from("posts")
      .select("id, user_id, caption, crown_score, vote_count, comment_count, share_count, battle_wins, is_removed, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    const posts = (postsData as Post[]) || [];
    if (posts.length === 0) { setRows([]); setBusy(false); return; }
    const ids = posts.map((p) => p.id);

    // Fetch live vote/comment/boost data scoped to these posts
    const [votesRes, commentsRes, boostsRes] = await Promise.all([
      supabase.from("votes").select("post_id, vote_type").in("post_id", ids),
      supabase.from("comments").select("post_id").in("post_id", ids).eq("is_removed", false),
      supabase
        .from("boosts")
        .select("post_id")
        .in("post_id", ids)
        .eq("boost_type", "royal_boost")
        .eq("active", true)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
    ]);

    const votes = (votesRes.data as VoteRow[]) || [];
    const comments = (commentsRes.data as CommentRow[]) || [];
    const boosts = (boostsRes.data as BoostRow[]) || [];

    // Aggregate
    const crownByPost = new Map<string, number>();
    const fireByPost = new Map<string, number>();
    const diamondByPost = new Map<string, number>();
    votes.forEach((v) => {
      const m = v.vote_type === "crown" ? crownByPost : v.vote_type === "fire" ? fireByPost : diamondByPost;
      m.set(v.post_id, (m.get(v.post_id) ?? 0) + 1);
    });
    const commentsByPost = new Map<string, number>();
    comments.forEach((c) => commentsByPost.set(c.post_id, (commentsByPost.get(c.post_id) ?? 0) + 1));
    const boostedSet = new Set(boosts.map((b) => b.post_id));

    const computed: Computed[] = posts.map((post) => {
      const crown = crownByPost.get(post.id) ?? 0;
      const fire = fireByPost.get(post.id) ?? 0;
      const diamond = diamondByPost.get(post.id) ?? 0;
      const totalVotes = crown + fire + diamond;
      const cmts = commentsByPost.get(post.id) ?? 0;
      const hasBoost = boostedSet.has(post.id);
      const expectedScore = recalcScore(crown, fire, diamond, cmts, post.share_count, post.battle_wins, hasBoost);
      const scoreDelta = Number(post.crown_score) - expectedScore;
      const voteDelta = post.vote_count - totalVotes;
      const commentDelta = post.comment_count - cmts;

      const problems: Computed["problems"] = [];
      if (Math.abs(voteDelta) > 0) {
        problems.push({ level: "error", msg: `vote_count=${post.vote_count} but actual=${totalVotes} (Δ ${voteDelta > 0 ? "+" : ""}${voteDelta})` });
      }
      if (Math.abs(commentDelta) > 0) {
        problems.push({ level: "error", msg: `comment_count=${post.comment_count} but actual=${cmts} (Δ ${commentDelta > 0 ? "+" : ""}${commentDelta})` });
      }
      if (Math.abs(scoreDelta) > TOLERANCE) {
        problems.push({
          level: "error",
          msg: `crown_score=${Number(post.crown_score).toFixed(3)} but expected=${expectedScore.toFixed(3)} (Δ ${scoreDelta > 0 ? "+" : ""}${scoreDelta.toFixed(3)})`,
        });
      }
      if (post.share_count < 0) problems.push({ level: "warn", msg: `share_count negative (${post.share_count})` });
      if (post.battle_wins < 0) problems.push({ level: "warn", msg: `battle_wins negative (${post.battle_wins})` });
      if (problems.length === 0) problems.push({ level: "ok", msg: "Totals consistent" });

      return { post, crown, fire, diamond, totalVotes, comments: cmts, hasBoost, expectedScore, scoreDelta, voteDelta, commentDelta, problems };
    });

    setRows(computed);
    setBusy(false);
  };

  useEffect(() => { if (isModerator) reload(); }, [isModerator]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useMemo(() => {
    let ok = 0, warn = 0, err = 0;
    rows.forEach((r) => r.problems.forEach((p) => {
      if (p.level === "ok") ok++;
      else if (p.level === "warn") warn++;
      else err++;
    }));
    const flaggedPosts = rows.filter((r) => r.problems.some((p) => p.level !== "ok")).length;
    return { ok, warn, err, flaggedPosts };
  }, [rows]);

  const visible = filterIssues ? rows.filter((r) => r.problems.some((p) => p.level !== "ok")) : rows;

  if (loading) return <AppShell><div className="py-20 text-center">Loading…</div></AppShell>;
  if (!isModerator) return <Navigate to="/feed" replace />;

  return (
    <AppShell title="ADMIN VOTING VERIFY">
      <div className="px-4 py-4 space-y-5 max-w-3xl mx-auto">
        <AdminSessionHint />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="font-display text-2xl text-gold flex items-center gap-2">
            <ShieldCheck size={20} /> Voting / Crown Score Verify
          </h1>
          <Button size="sm" variant="outline" onClick={reload} disabled={busy}>
            {busy ? <Loader2 size={12} className="animate-spin mr-1.5" /> : null} Reload
          </Button>
        </div>

        <div className="royal-card p-3 grid grid-cols-2 gap-3 items-end">
          <div>
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Posts to scan</Label>
            <Input
              type="number"
              min={10}
              max={500}
              value={limit}
              onChange={(e) => setLimit(Math.max(10, Math.min(500, Number(e.target.value) || 100)))}
              className="bg-input h-9"
            />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer h-9">
            <input
              type="checkbox"
              checked={filterIssues}
              onChange={(e) => setFilterIssues(e.target.checked)}
              className="size-4"
            />
            Only show flagged posts
          </label>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <Stat label="Scanned" value={rows.length} tone="text-foreground" />
          <Stat label="Flagged" value={summary.flaggedPosts} tone="text-yellow-500" />
          <Stat label="Errors" value={summary.err} tone="text-destructive" />
          <Stat label="OK" value={summary.ok} tone="text-emerald-500" />
        </div>

        <section className="royal-card overflow-hidden">
          <div className="p-3 border-b border-border/60 flex items-center justify-between">
            <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground">Posts</h2>
            <span className="text-[10px] text-muted-foreground">{visible.length} shown</span>
          </div>
          {busy && (
            <div className="p-8 flex items-center justify-center text-muted-foreground text-sm">
              <Loader2 size={14} className="animate-spin mr-2" /> Recomputing…
            </div>
          )}
          {!busy && visible.length === 0 && (
            <div className="p-8 text-center text-xs text-muted-foreground">
              {filterIssues ? "No inconsistencies found 🎉" : "No posts in scan window."}
            </div>
          )}
          <ul className="divide-y divide-border/60">
            {visible.map((r) => {
              const flagged = r.problems.some((p) => p.level !== "ok");
              return (
                <li key={r.post.id} className="p-3 space-y-2">
                  <div className="flex items-start gap-3">
                    <div className={`size-9 rounded-xl flex items-center justify-center shrink-0 ${flagged ? "bg-destructive/15 text-destructive" : "bg-emerald-500/15 text-emerald-500"}`}>
                      {flagged ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate flex items-center gap-2">
                        <span className="truncate">{r.post.caption?.trim() || "(no caption)"}</span>
                        {r.hasBoost && <span className="text-[9px] px-1 py-0.5 rounded bg-primary/20 text-primary uppercase font-bold">1.5×</span>}
                        {r.post.is_removed && <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground uppercase">removed</span>}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate">
                        {r.post.id.slice(0, 8)} · {new Date(r.post.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <Link
                      to={`/${r.post.user_id}`}
                      className="text-[10px] text-primary hover:underline flex items-center gap-1 shrink-0"
                    >
                      author <ExternalLink size={9} />
                    </Link>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <Cell label="Votes" stored={r.post.vote_count} actual={r.totalVotes} />
                    <Cell label="Comments" stored={r.post.comment_count} actual={r.comments} />
                    <Cell
                      label="Crown Score"
                      stored={Number(r.post.crown_score).toFixed(2)}
                      actual={r.expectedScore.toFixed(2)}
                      icon={<Crown size={10} className="text-gold" />}
                    />
                  </div>

                  <div className="text-[10px] text-muted-foreground">
                    👑 {r.crown} · 🔥 {r.fire} · 💎 {r.diamond} · 💬 {r.comments} · ↗ {r.post.share_count} · ⚔ {r.post.battle_wins}
                  </div>

                  {r.problems.map((p, i) => {
                    const cls = p.level === "ok" ? "text-emerald-500" : p.level === "warn" ? "text-yellow-500" : "text-destructive";
                    const Icon = p.level === "ok" ? CheckCircle2 : AlertTriangle;
                    return (
                      <div key={i} className={`flex items-start gap-1.5 text-[11px] ${cls}`}>
                        <Icon size={11} className="mt-0.5 shrink-0" /> <span>{p.msg}</span>
                      </div>
                    );
                  })}
                </li>
              );
            })}
          </ul>
        </section>

        <p className="text-[10px] text-muted-foreground text-center">
          Formula: <code>(crown + fire×0.5 + diamond×1.5) × (1 + comments×0.01) + shares×0.25 + battle_wins×5</code>, ×1.5 if a royal_boost is active.
        </p>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="royal-card p-2 text-center">
      <div className={`text-xl font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}

function Cell({ label, stored, actual, icon }: { label: string; stored: number | string; actual: number | string; icon?: React.ReactNode }) {
  const match = String(stored) === String(actual);
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${match ? "border-border/60 bg-muted/20" : "border-destructive/40 bg-destructive/5"}`}>
      <div className="flex items-center gap-1 text-muted-foreground uppercase tracking-wider">{icon}{label}</div>
      <div className="tabular-nums text-foreground">
        <span className="font-semibold">{stored}</span>
        <span className="text-muted-foreground"> / {actual}</span>
      </div>
    </div>
  );
}
