import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Crown, Flame, Gem, Gift, MessageCircle, Share2, MapPin, Send, Flag, Reply, TrendingUp, ArrowLeft, Bell, BellOff, Pencil, Check, Sparkles, Repeat2, } from "lucide-react";
import { BrokenCrown } from "@/components/icons/BrokenCrown";
import VoteBurst from "@/components/VoteBurst";
import PostMedia from "./PostMedia";
import { postMediaFrameClass } from "@/lib/postMediaFrame";
import { FilterId, isValidFilter, FILTER_BY_ID } from "@/lib/filters";
import { useThreadMute } from "@/hooks/useThreadMute";
import { classifyBlock } from "@/lib/commentBlockReason";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABEL, formatScore, locationLabel, timeAgo } from "@/lib/crown";
import { CategoryBadge } from "@/lib/categoryIcons";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toggleVote, VoteType } from "@/lib/votes";
import { ShareDialog } from "./ShareDialog";
import RepostDialog from "./RepostDialog";
import GiftPanel from "./gifts/GiftPanel";
import GiftAnimationOverlay from "./gifts/GiftAnimationOverlay";
import type { RoyalGift } from "@/types/gifts";
import { fxVote } from "@/lib/giftFx";
import type { FeedPost } from "./PostCard";
import { toast } from "sonner";
import MentionInput, { MentionInputHandle, MentionUser, renderMentions } from "./MentionInput";
import { useLiveRank } from "@/hooks/useLiveRank";
import RankHistoryTimeline from "./RankHistoryTimeline";
import { useFilterStreaks } from "@/hooks/useFilterStreak";
import ReportDialog from "./ReportDialog";
import { useMentionParticipants } from "@/hooks/useMentionParticipants";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { checkCommentRate, recordComment, validateComment } from "@/lib/commentSafety";
import { useCountdown } from "@/hooks/useCountdown";
import { AlertCircle, Clock } from "lucide-react";
import CommentsDrawer from "./CommentsDrawer";
import { useIsBelowDesktop } from "@/hooks/use-below-desktop";

const draftKey = (postId: string, replyToId: string | null) =>
  `crownme:draft:${postId}:${replyToId ?? "root"}`;

const readDraft = (postId: string, replyToId: string | null) => {
  try {
    return localStorage.getItem(draftKey(postId, replyToId)) ?? "";
  } catch {
    return "";
  }
};

const writeDraft = (postId: string, replyToId: string | null, value: string) => {
  try {
    if (value) localStorage.setItem(draftKey(postId, replyToId), value);
    else localStorage.removeItem(draftKey(postId, replyToId));
  } catch {}
};

interface CommentRow {
  id: string;
  body: string;
  created_at: string;
  edited_at?: string | null;
  user_id: string;
  parent_id: string | null;
  mention_user_ids: string[] | null;
  profile: { username: string; profile_photo_url: string | null } | null;
}

interface Props {
  post: FeedPost | null;
  onClose: () => void;
}

const COMMENT_COLUMNS = "id, body, created_at, edited_at, user_id, parent_id, mention_user_ids, profile:profiles!comments_user_id_fkey(username, profile_photo_url)";

export default function PostDetailDialog({ post, onClose }: Props) {
  const { user } = useAuth();
  const open = !!post;
  const isBelowDesktop = useIsBelowDesktop();
  const [commentsOverlayOpen, setCommentsOverlayOpen] = useState(false);
  // Canonical target IDs for repost attribution. Interactions (votes, comments,
  // gifts, share, reports, realtime) must always target the ORIGINAL post so a
  // repost never fragments engagement, while display data (author, media,
  // caption, category, location, stats) comes from the original when present.
  const interactionPostId = (post?.parent_post_id ?? post?.id) ?? null;
  const displayPost: any = (post as any)?.parent ?? post;
  const displayProfile = displayPost?.profile ?? post?.profile;
  const [activeImage, setActiveImage] = useState(0);
  const [myVotes, setMyVotes] = useState<Set<VoteType>>(new Set());
  const [counts, setCounts] = useState({ crown: 0, fire: 0, diamond: 0, dislike: 0, total: 0, score: 0, comments: 0 });
  const [burst, setBurst] = useState<VoteType | null>(null);
  const [filterBoost, setFilterBoost] = useState<VoteType | null>(null);
  const [overlayBurst, setOverlayBurst] = useState<{ type: VoteType; delta: string } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [repostOpen, setRepostOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [activeGift, setActiveGift] = useState<RoyalGift | null>(null);
  const [activeGiftQty, setActiveGiftQty] = useState(1);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<MentionUser[]>([]);
  const [replyTo, setReplyTo] = useState<CommentRow | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Map<string, number>>(new Map());
  const [blockReason, setBlockReason] = useState<ReturnType<typeof classifyBlock> | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const retrySec = useCountdown(retryAt, () => {
    setRetryAt(null);
    setBlockReason(null);
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editError, setEditError] = useState<ReturnType<typeof classifyBlock> | null>(null);
  const [commentFireCounts, setCommentFireCounts] = useState<Record<string, number>>({});
  const [myCommentFires, setMyCommentFires] = useState<Set<string>>(new Set());
  const inputRef = useRef<MentionInputHandle>(null);
  const lastTapRef = useRef<number>(0);
  const doubleTapHandlers = {
    onPointerUp: (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        lastTapRef.current = 0;
        if (!myVotes.has("crown")) onVote("crown");
      } else {
        lastTapRef.current = now;
      }
    },
  };

  const loadCommentReactions = useCallback(async (commentIds: string[]) => {
    if (commentIds.length === 0) {
      setCommentFireCounts({});
      setMyCommentFires(new Set());
      return;
    }
    const { data } = await supabase
      .from("comment_reactions")
      .select("comment_id, user_id")
      .in("comment_id", commentIds);
    const counts: Record<string, number> = {};
    const mine = new Set<string>();
    (data || []).forEach((r: { comment_id: string; user_id: string }) => {
      counts[r.comment_id] = (counts[r.comment_id] || 0) + 1;
      if (user && r.user_id === user.id) mine.add(r.comment_id);
    });
    setCommentFireCounts(counts);
    setMyCommentFires(mine);
  }, [user]);

  const toggleCommentFire = async (commentId: string) => {
    if (!user) return toast.error("Sign in to react");
    const hasFired = myCommentFires.has(commentId);
    setMyCommentFires((prev) => {
      const next = new Set(prev);
      if (hasFired) next.delete(commentId); else next.add(commentId);
      return next;
    });
    setCommentFireCounts((prev) => ({
      ...prev,
      [commentId]: Math.max(0, (prev[commentId] || 0) + (hasFired ? -1 : 1)),
    }));
    if (hasFired) {
      const { error } = await supabase
        .from("comment_reactions")
        .delete()
        .eq("comment_id", commentId)
        .eq("user_id", user.id);
      if (error) toast.error(error.message);
    } else {
      const { error } = await supabase
        .from("comment_reactions")
        .insert({ comment_id: commentId, user_id: user.id });
      if (error) toast.error(error.message);
    }
  };

  const liveRank = useLiveRank(post);
  const priorityUsers = useMentionParticipants(post);
  const { muted, toggle: toggleMute } = useThreadMute(post?.id ?? null);

  // Smoothly tween rank + score so live updates feel fluid, not jarring.
  const animatedRank = useAnimatedNumber(liveRank?.rank ?? 0, 700);
  const animatedScore = useAnimatedNumber(counts.score, 600);

  // Live tracking of caption / cover / filter so edits made from PostCard or
  // Profile reflect immediately inside the detail dialog.
  const [liveCaption, setLiveCaption] = useState<string>(post?.caption ?? "");
  const [liveCover, setLiveCover] = useState<string>(post?.image_url ?? "");
  const [liveFilter, setLiveFilter] = useState<FilterId | null>(
    isValidFilter(post?.filter ?? null) ? (post!.filter as FilterId) : null
  );
  const [liveEditedAt, setLiveEditedAt] = useState<string | null>(post?.edited_at ?? null);
  const images = post
    ? ((post.image_urls && post.image_urls.length > 0)
        ? [liveCover || post.image_urls[0], ...post.image_urls.slice(1)]
        : [liveCover || post.image_url])
    : [];
  const isMulti = images.length > 1;

  // Build threaded view: top-level comments newest-first, replies oldest-first
  const thread = useMemo(() => {
    const top = comments.filter((c) => !c.parent_id);
    const repliesByParent = new Map<string, CommentRow[]>();

    for (const c of comments) {
      if (!c.parent_id) continue;
      const list = repliesByParent.get(c.parent_id) ?? [];
      list.push(c);
      repliesByParent.set(c.parent_id, list);
    }

    for (const list of repliesByParent.values()) {
      list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }

    return top.map((c) => ({ comment: c, replies: repliesByParent.get(c.id) ?? [] }));
  }, [comments]);

  useEffect(() => {
    if (!post) return;

    setActiveImage(0);
    setReplyTo(null);
    setText(readDraft(post.id, null));
    setMentions([]);
    setError(null);
    setExpandedReplies(new Map());
    setBlockReason(null);
    setRetryAt(null);
    setCounts((c) => ({ ...c, total: post.vote_count, score: post.crown_score, comments: post.comment_count }));

    (async () => {
      const { data: stats } = await supabase.rpc("get_post_vote_stats", { _post_id: post.id });
      if (stats) {
        const c2 = ((stats as { counts?: Record<string, number> }).counts) ?? {};
        const byType = { crown: c2.crown ?? 0, fire: c2.fire ?? 0, diamond: c2.diamond ?? 0, dislike: c2.dislike ?? 0 };
        const mine = new Set<VoteType>(((stats as { my_votes?: string[] }).my_votes ?? []) as VoteType[]);
        setMyVotes(mine);
        setCounts((c) => ({ ...c, ...byType, total: byType.crown + byType.fire + byType.diamond }));
      }

      const { data: cmts } = await supabase
        .from("comments")
        .select(COMMENT_COLUMNS)
        .eq("post_id", post.id)
        .eq("is_removed", false)
        .order("created_at", { ascending: false });

      setComments((cmts as any) || []);
      loadCommentReactions(((cmts as any) || []).map((c: CommentRow) => c.id));

      // Mark reply / mention notifications for this post as read once viewed.
      if (user) {
        await supabase
          .from("notifications")
          .update({ read: true })
          .eq("user_id", user.id)
          .eq("read", false)
          .eq("type", "comment")
          .contains("payload", { post_id: post.id });
      }
    })();
  }, [post, user]);

  useEffect(() => {
    if (!post) return;

    let cancelled = false;

    const ch = supabase.channel(`post-detail-${post.id}-${Math.random().toString(36).slice(2, 9)}`);

    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "comments", filter: `post_id=eq.${post.id}` },
      async () => {
        const { data } = await supabase
          .from("comments")
          .select(COMMENT_COLUMNS)
          .eq("post_id", post.id)
          .eq("is_removed", false)
          .order("created_at", { ascending: false });

        if (!cancelled) {
          const rows = (data as any) || [];
          setComments(rows);
          loadCommentReactions(rows.map((c: CommentRow) => c.id));
        }
      },
    ).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "votes", filter: `post_id=eq.${post.id}` },
      async () => {
        const { data: stats } = await supabase.rpc("get_post_vote_stats", { _post_id: post.id });
        if (cancelled || !stats) return;
        const c2 = ((stats as { counts?: Record<string, number> }).counts) ?? {};
        const byType = { crown: c2.crown ?? 0, fire: c2.fire ?? 0, diamond: c2.diamond ?? 0, dislike: c2.dislike ?? 0 };
        setCounts((c) => ({ ...c, ...byType, total: byType.crown + byType.fire + byType.diamond }));
      },
    ).on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "posts", filter: `id=eq.${post.id}` },
      (payload) => {
        const row: any = payload.new;

        if (!row || cancelled) return;

        setCounts((c) => ({
          ...c,
          score: row.crown_score ?? c.score,
          comments: row.comment_count ?? c.comments,
        }));
      },
    ).subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [post]);

  // Re-sync live state when the active post changes.
  useEffect(() => {
    if (!post) return;
    setLiveCaption(post.caption);
    setLiveCover(post.image_url);
    setLiveFilter(isValidFilter(post.filter ?? null) ? (post.filter as FilterId) : null);
    setLiveEditedAt(post.edited_at ?? null);
  }, [post?.id, post?.caption, post?.image_url, post?.filter, post?.edited_at]);
  useEffect(() => {
    if (!post) return;
    const onUpdated = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d || d.id !== post.id) return;
      if (typeof d.caption === "string") setLiveCaption(d.caption);
      if (typeof d.image_url === "string") setLiveCover(d.image_url);
      if (d.filter !== undefined) setLiveFilter(isValidFilter(d.filter) ? d.filter : null);
      if ("edited_at" in d) setLiveEditedAt(d.edited_at ?? new Date().toISOString());
    };
    window.addEventListener("post:updated", onUpdated);
    return () => window.removeEventListener("post:updated", onUpdated);
  }, [post?.id]);

  const { bump: bumpFilterStreak } = useFilterStreaks();

  const VOTE_WEIGHT: Record<VoteType, number> = { crown: 1, fire: 0.5, diamond: 1.5, dislike: 0 };
  const [scoreBump, setScoreBump] = useState(false);

  const onVote = async (t: VoteType) => {
    if (!user || !post) return;

    setBurst(t);
    setTimeout(() => setBurst(null), 500);

    const had = myVotes.has(t);
    // Mutual exclusivity: swap out any previously-selected reaction.
    const previous: VoteType | null = !had
      ? ((["crown", "fire", "diamond", "dislike"] as VoteType[]).find((x) => myVotes.has(x)) ?? null)
      : null;

    if (!had) {
      setOverlayBurst({ type: t, delta: t === "dislike" ? "" : `+${VOTE_WEIGHT[t]}` });
      if (t !== "dislike") fxVote(t);

      const f = liveFilter;
      if (f && f !== "none" && t !== "dislike") {
        setFilterBoost(t);
        setTimeout(() => setFilterBoost(null), 650);
        bumpFilterStreak(f);
      }
    }
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try { navigator.vibrate(had ? 8 : 14); } catch { /* noop */ }
    }

    const next = new Set(myVotes);
    if (had) next.delete(t);
    else {
      if (previous) next.delete(previous);
      next.add(t);
    }
    setMyVotes(next);
    const addDelta = had ? -1 : 1;
    const prevWeight = previous ? VOTE_WEIGHT[previous] : 0;
    const scoreDelta = VOTE_WEIGHT[t] * addDelta - prevWeight;
    setCounts((c) => {
      const nextC: any = {
        ...c,
        [t]: c[t] + addDelta,
        score: Math.max(0, c.score + scoreDelta),
      };
      if (previous) nextC[previous] = Math.max(0, c[previous] - 1);
      const totalDelta =
        (t === "dislike" ? 0 : addDelta) - (previous && previous !== "dislike" ? 1 : 0);
      nextC.total = Math.max(0, c.total + totalDelta);
      return nextC;
    });
    setScoreBump(true);
    setTimeout(() => setScoreBump(false), 700);

    await toggleVote(post.id, user.id, t);
  };

  const startReply = (c: CommentRow) => {
    setReplyTo(c);

    const handle = `@${c.profile?.username ?? "user"} `;
    setText((prev) => (prev.startsWith(handle) ? prev : handle + prev));

    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const cancelReply = () => setReplyTo(null);

  // Persist draft per (post, replyTo) so blocks/refreshes never lose user text.
  useEffect(() => {
    if (!post) return;
    writeDraft(post.id, replyTo?.id ?? null, text);
  }, [text, post, replyTo]);

  // When switching reply target, restore that thread's saved draft (if any).
  useEffect(() => {
    if (!post) return;

    const saved = readDraft(post.id, replyTo?.id ?? null);

    if (replyTo) {
      const handle = `@${replyTo.profile?.username ?? "user"} `;
      setText(saved && saved.startsWith(handle) ? saved : handle + (saved || ""));
    } else if (saved) {
      setText(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyTo?.id]);

  const sendComment = async () => {
    if (!user || !post) return;
    if (retrySec > 0) return; // still cooling down

    setError(null);
    setBlockReason(null);
    setRetryAt(null);

    const validation = validateComment(text);

    if (validation.ok === false) {
      setBlockReason(classifyBlock(validation.message));
      return;
    }

    const rate = checkCommentRate();

    if (!rate.ok) {
      setBlockReason(classifyBlock(rate.message ?? `Please wait ${rate.retryInSec ?? 1}s.`));
      if (rate.retryInSec) setRetryAt(Date.now() + rate.retryInSec * 1000);
      return;
    }

    setSending(true);

    const mentionIds = Array.from(new Set(mentions.map((m) => m.id))).filter(Boolean);

    const { error: insertErr } = await supabase.from("comments").insert({
      post_id: post.id,
      user_id: user.id,
      body: validation.value,
      parent_id: replyTo?.id ?? null,
      mention_user_ids: mentionIds,
    });

    setSending(false);

    if (insertErr) {
      setBlockReason(classifyBlock(insertErr.message));
      return;
    }

    recordComment();

    // Optimistic UI: notify PostCard to apply the +1% Crown Score bonus immediately
    window.dispatchEvent(
      new CustomEvent("crownme:comment-added", { detail: { postId: post.id } }),
    );

    // Clear persisted draft for this thread context
    if (post) writeDraft(post.id, replyTo?.id ?? null, "");

    setText("");
    setMentions([]);
    setReplyTo(null);
  };

  const [reportCommentId, setReportCommentId] = useState<string | null>(null);

  const report = (commentId: string) => {
    if (!user?.id) return toast.error("Sign in to report");
    setReportCommentId(commentId);
  };

  const startEdit = (c: CommentRow) => {
    setEditingId(c.id);
    setEditText(c.body);
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!editingId || !user) return;

    const v = validateComment(editText);

    if (v.ok === false) {
      setEditError(classifyBlock(v.message));
      return;
    }

    const { error: upErr } = await supabase
      .from("comments")
      .update({ body: v.value })
      .eq("id", editingId)
      .eq("user_id", user.id);

    if (upErr) {
      setEditError(classifyBlock(upErr.message));
      return;
    }

    toast.success("Comment updated");
    cancelEdit();
  };

  const onScrollImages = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== activeImage) setActiveImage(idx);
  };

  if (!post) return null;

  const VoteBtn = ({ type, icon: Icon, color }: { type: VoteType; icon: typeof Crown; color: string }) => {
    const active = myVotes.has(type);
    // Double-tap on touch devices fires a vote (mirrors the image double-tap).
    // We keep single-tap voting too so non-touch users still work normally.
    const lastTap = useRef<number>(0);
    const supportsDoubleTap = type === "crown" || type === "fire" || type === "diamond";

    return (
      <button
        type="button"
        onClick={() => onVote(type)}
        onPointerUp={(e) => {
          if (!supportsDoubleTap) return;
          if (e.pointerType !== "touch") return;
          const now = Date.now();
          if (now - lastTap.current < 300) {
            lastTap.current = 0;
            if (!myVotes.has(type)) onVote(type);
          } else {
            lastTap.current = now;
          }
        }}
        aria-pressed={active}
        aria-label={`${type} vote`}
        className={`flex items-center gap-1.5 px-3 py-2 md:px-3.5 md:py-2.5 min-h-[44px] rounded-full transition-all touch-manipulation select-none ${
          active ? `bg-gradient-to-br ${color} text-white shadow-lg` : "bg-muted/50 text-muted-foreground hover:text-foreground"
        }`}
      >
        <Icon size={16} className={burst === type ? "animate-vote-burst" : ""} fill={active ? "currentColor" : "none"} />
        <span className="text-xs font-bold tabular-nums">{counts[type]}</span>
      </button>
    );
  };

  const CommentBody = ({ body }: { body: string }) => (
    <p className="text-sm leading-snug whitespace-pre-wrap break-words">
      {renderMentions(body).map((part, i) =>
        typeof part === "string"
          ? <span key={i}>{part}</span>
          : (
            <Link
              key={i}
              to={`/${part.mention}`}
              onClick={onClose}
              className="text-primary font-semibold hover:underline"
            >
              @{part.mention}
            </Link>
          )
      )}
    </p>
  );

  const CommentItem = ({ c, depth = 0 }: { c: CommentRow; depth?: number }) => {
    const isMine = user?.id === c.user_id;
    const isEditing = editingId === c.id;

    return (
      <div className={`flex gap-2 ${depth ? "ml-9" : ""}`}>
        <Link to={`/${c.profile?.username}`} onClick={onClose} className="size-8 rounded-full bg-muted overflow-hidden shrink-0">
          {c.profile?.profile_photo_url && <img loading="lazy" src={c.profile.profile_photo_url} className="w-full h-full object-cover" alt="" />}
        </Link>

        <div className="flex-1 min-w-0">
          <div className="bg-muted/50 rounded-2xl px-3 py-2">
            <Link to={`/${c.profile?.username}`} onClick={onClose} className="text-xs font-bold hover:underline">
              @{c.profile?.username || "user"}
            </Link>

            {isEditing ? (
              <div className="mt-1 space-y-1.5">
                <textarea
                  value={editText}
                  onChange={(e) => {
                    setEditText(e.target.value.slice(0, 500));
                    if (editError) setEditError(null);
                  }}
                  rows={2}
                  className={`w-full resize-none rounded-md bg-input text-sm px-2 py-1.5 border outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    editError ? "border-destructive ring-2 ring-destructive/40 animate-pulse" : "border-input"
                  }`}
                  autoFocus
                />

                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={saveEdit} className="h-7 px-3 bg-gradient-gold text-primary-foreground">
                    <Check size={12} className="mr-1" /> Save
                  </Button>

                  <button type="button" onClick={cancelEdit} className="text-[11px] text-muted-foreground hover:text-foreground">
                    Cancel
                  </button>

                  <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                    {editText.length}/500
                  </span>
                </div>

                {editError && (
                  <div role="alert" className="text-[10px] text-destructive flex items-start gap-1">
                    <AlertCircle size={10} className="mt-0.5 shrink-0" />
                    <span>
                      <span className="font-bold">{editError.title}</span> — {editError.hint}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <CommentBody body={c.body} />
            )}
          </div>

          {!isEditing && (
            <div className="flex gap-3 mt-1 px-1 items-center">
              <span className="text-[10px] text-muted-foreground">{timeAgo(c.created_at)}</span>

              {c.edited_at && <span className="text-[10px] text-muted-foreground italic">(edited)</span>}

              <button type="button" onClick={() => startReply(c)} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                <Reply size={10} /> Reply
              </button>

              {(() => {
                const fired = myCommentFires.has(c.id);
                const count = commentFireCounts[c.id] || 0;
                return (
                  <button
                    onClick={() => toggleCommentFire(c.id)}
                    aria-pressed={fired}
                    aria-label={fired ? "Remove fire reaction" : "Fire reaction"}
                    className={`text-[10px] flex items-center gap-1 transition-colors ${
                      fired ? "text-orange-500" : "text-muted-foreground hover:text-orange-500"
                    }`}
                  >
                    <Flame size={11} className={fired ? "fill-orange-500" : ""} />
                    {count > 0 && <span className="tabular-nums">{count}</span>}
                  </button>
                );
              })()}

              {isMine ? (
                <button type="button" onClick={() => startEdit(c)} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1">
                  <Pencil size={10} /> Edit
                </button>
              ) : (
                <button type="button" onClick={() => report(c.id)} className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1">
                  <Flag size={10} /> Report
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="p-0 gap-0 max-w-[100vw] w-full h-[100svh] md:w-[min(96vw,1280px)] md:max-w-[1280px] md:h-[min(90vh,800px)] md:rounded-2xl md:my-3 bg-card border-border overflow-hidden flex flex-col md:flex-row [&>button]:hidden overscroll-contain"
      >
        <VisuallyHidden>
          <DialogTitle>Post details</DialogTitle>
          <DialogDescription>View post media, comments, and reactions.</DialogDescription>
        </VisuallyHidden>
        <div
          className="absolute right-3 z-50"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
            right: "calc(env(safe-area-inset-right, 0px) + 0.75rem)",
          }}
        >
          <button
            onClick={onClose}
            aria-label="Back"
            className="h-9 pl-2.5 pr-3.5 rounded-full bg-black/60 backdrop-blur text-white flex items-center gap-1.5 hover:bg-black/80 transition shadow-lg"
          >
            <ArrowLeft size={16} />
            <span className="text-xs font-semibold">Back</span>
          </button>
        </div>

        {/* Media side — canonical aspect ratio, identical on mobile and desktop.
            On desktop the media region is a fixed square sized to dialog height
            (Instagram-web layout); the comments column flexes to the remaining width. */}
        <div
          className={`relative w-full ${postMediaFrameClass(post)} shrink-0 md:w-auto md:h-full md:aspect-square md:flex-none flex items-center justify-center min-h-0 overflow-hidden bg-card`}
          onDoubleClick={() => !myVotes.has("crown") && onVote("crown")}
          {...doubleTapHandlers}
        >
          {/* Soft blurred backdrop sampled from the active image — replaces harsh black letterbox */}
          {images[activeImage] && (
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `url(${images[activeImage]})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                filter: "blur(36px) saturate(1.2) brightness(0.55)",
                transform: "scale(1.15)",
              }}
            />
          )}
          <div aria-hidden className="absolute inset-0 bg-background/30 pointer-events-none" />
          {(() => {
            const postFilter: FilterId | null = liveFilter;
            const filterDef = postFilter ? FILTER_BY_ID[postFilter] : null;

            return (
              <>
                {post.media_type === "video" && post.video_url ? (
                  <div className="w-full h-full max-w-full max-h-full">
                    <PostMedia
                      src={post.video_url}
                      poster={post.video_poster_url ?? images[0]}
                      mediaType="video"
                      autoPlay
                      filter={postFilter}
                      alt={post.caption || "Video post"}
                      className="w-full h-full object-cover"
                      boost={!!filterBoost}
                      boostType={filterBoost ?? undefined}
                    />
                  </div>
                ) : isMulti ? (
                  <div
                    className="flex h-full w-full overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar"
                    onScroll={onScrollImages}
                  >
                    {images.map((src, i) => (
                      <div key={src + i} className="w-full h-full flex-shrink-0 snap-center">
                        <PostMedia
                          src={src}
                          alt={post.alt_texts?.[i] || (post.caption ? `${post.caption} (${i + 1}/${images.length})` : `Photo ${i + 1}`)}
                          filter={postFilter}
                          className="w-full h-full object-cover"
                          boost={!!filterBoost && i === activeImage}
                          boostType={filterBoost ?? undefined}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <PostMedia
                    src={images[0]}
                    alt={post.alt_texts?.[0] || post.caption || "Post"}
                    filter={postFilter}
                    className="w-full h-full object-cover"
                    boost={!!filterBoost}
                    boostType={filterBoost ?? undefined}
                  />
                )}

                <div
                  className="absolute top-3 left-3 glass px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs"
                  style={{
                    top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
                    left: "calc(env(safe-area-inset-left, 0px) + 0.75rem)",
                  }}
                >
                  <Crown size={12} className="text-primary" fill="currentColor" />
                  <span className={`font-bold tabular-nums transition-all ${scoreBump ? "text-primary scale-110" : ""}`}>{formatScore(animatedScore)}</span>
                  <span className="text-muted-foreground">Crown Score</span>
                </div>

                {filterDef && filterDef.id !== "none" && (
                  <div
                    className="absolute top-3 right-3 glass px-2.5 py-1 rounded-full flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider pointer-events-none"
                    style={{
                      top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
                      right: "calc(env(safe-area-inset-right, 0px) + 3.75rem)",
                    }}
                    role="img"
                    aria-label={`Filter applied: ${filterDef.label}${filterDef.animated ? ", animated effect" : ""}`}
                  >
                    <Sparkles size={11} className="text-primary" aria-hidden="true" />
                    <span aria-hidden="true">{filterDef.label}</span>

                    {filterDef.animated && (
                      <span aria-hidden="true" className="ml-0.5 px-1 py-px rounded-full bg-primary/90 text-primary-foreground text-[8px] tracking-tight">
                        FX
                      </span>
                    )}
                  </div>
                )}

                {/* SR-only live announcement for the premium vote animation */}
                {filterBoost && (
                  <span className="sr-only" role="status" aria-live="polite">
                    {filterBoost === "crown" && "Crown vote cast — filter glowing gold"}
                    {filterBoost === "fire" && "Fire vote cast — filter heating up"}
                    {filterBoost === "diamond" && "Diamond vote cast — filter sparkling"}
                  </span>
                )}

                {isMulti && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
                    {images.map((_, i) => (
                      <span key={i} className={`size-1.5 rounded-full transition-all ${i === activeImage ? "bg-primary w-4" : "bg-white/60"}`} />
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Side panel */}
        <div className="flex flex-col flex-1 md:basis-[40%] min-h-0 md:min-w-0 border-t md:border-t-0 md:border-l border-border">
          {/* Posts must use the canonical post ID and shared PostDetailDialog.
              Profile and feed must display the same database row — load via
              fetchPostById() from src/lib/postQuery.ts. */}
          {/* Header */}
          <header className="flex items-center justify-between gap-2 p-3 border-b border-border">
            <Link to={`/${post.profile.username}`} onClick={onClose} className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className={post.profile.crowns_held > 0 ? "crown-ring shrink-0" : "shrink-0"}>
                <div className="size-9 rounded-full bg-muted overflow-hidden ring-1 ring-border">
                  {post.profile.profile_photo_url ? (
                    <img loading="lazy" src={post.profile.profile_photo_url} alt={post.profile.username} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
                      {post.profile.username[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="font-semibold text-sm truncate">@{post.profile.username}</span>
                  {post.profile.crowns_held > 0 && <Crown size={11} className="text-primary shrink-0" fill="currentColor" />}
                </div>

                <div className="flex items-center gap-1 text-[11px] text-muted-foreground min-w-0">
                  <MapPin size={9} className="shrink-0" />
                  <span className="truncate">{locationLabel(post)}</span>
                </div>
              </div>
            </Link>

            <button
              onClick={async () => {
                await toggleMute();
                toast.success(muted ? "Thread unmuted" : "Thread muted — no reply or mention alerts");
              }}
              aria-label={muted ? "Unmute thread" : "Mute thread"}
              title={muted ? "Unmute thread" : "Mute thread"}
              className={`shrink-0 size-9 rounded-full flex items-center justify-center transition ${
                muted ? "bg-destructive/15 text-destructive hover:bg-destructive/25" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              {muted ? <BellOff size={16} /> : <Bell size={16} />}
            </button>
          </header>

          {/* Live ranking line */}
          <div className="px-3 py-2 border-b border-border bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 flex items-center gap-2 text-[11px]">
            <TrendingUp size={12} className="text-primary shrink-0" />

            {liveRank == null ? (
              <span className="text-muted-foreground">Calculating royal rank…</span>
            ) : liveRank.rank == null ? (
              <span className="text-muted-foreground">
                Unranked in <span className="text-foreground font-semibold">{CATEGORY_LABEL[post.category]}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">
                Ranked{" "}
                <span
                  key={liveRank.rank}
                  className="font-bold text-primary tabular-nums inline-block transition-transform duration-500 animate-fade-in"
                >
                  #{Math.max(1, Math.round(animatedRank))}
                </span>
                {liveRank.total ? <span className="opacity-70"> / {liveRank.total}</span> : null}
                {" "}in{" "}
                <span className="text-foreground font-semibold">{CATEGORY_LABEL[post.category]}</span>
                {" · "}
                <span className="text-foreground">{liveRank.region}</span>
              </span>
            )}

            <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> live
            </span>
          </div>

          {/* Rank-over-time timeline. On mobile we render it inside a collapsed <details>
              so the comments thread leads the view; on sm+ it stays fully visible. */}
          {liveRank && (
            <>
              <details className="sm:hidden px-3 pt-3 group">
                <summary className="list-none cursor-pointer text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/40 border border-border/60">
                  <span className="flex items-center gap-1.5">
                    <TrendingUp size={11} className="text-primary" /> Rank history
                  </span>
                  <span className="text-[10px] opacity-70 group-open:hidden">Tap to expand</span>
                  <span className="text-[10px] opacity-70 hidden group-open:inline">Tap to hide</span>
                </summary>
                <div className="mt-2">
                  <RankHistoryTimeline
                    postId={post.id}
                    scope={liveRank.scope}
                    region={liveRank.region}
                    category={post.category}
                    subcategorySlug={(post as any).subcategory_slug ?? null}
                    mainCategorySlug={(post as any).main_category_slug ?? null}
                  />
                </div>
              </details>
              <div className="hidden sm:block px-3 pt-3">
                <RankHistoryTimeline
                  postId={post.id}
                  scope={liveRank.scope}
                  region={liveRank.region}
                  category={post.category}
                  subcategorySlug={(post as any).subcategory_slug ?? null}
                  mainCategorySlug={(post as any).main_category_slug ?? null}
                />
              </div>
            </>
          )}

          {/* Caption + comments */}
          <div
            className="flex-1 overflow-y-auto px-3 py-3 space-y-3 overscroll-contain"
            style={{ scrollPaddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
          >
            {liveCaption && (
              <div className="flex gap-2">
                <Link to={`/${post.profile.username}`} onClick={onClose} className="size-8 rounded-full bg-muted overflow-hidden shrink-0">
                  {post.profile.profile_photo_url && (
                    <img loading="lazy" src={post.profile.profile_photo_url} className="w-full h-full object-cover" alt="" />
                  )}
                </Link>

                <div className="flex-1">
                  <p className="text-sm leading-snug">
                    <Link to={`/${post.profile.username}`} onClick={onClose} className="font-bold mr-1.5 hover:underline">
                      @{post.profile.username}
                    </Link>
                    {liveCaption}
                  </p>

                  <span className="text-[10px] text-muted-foreground">
                    {timeAgo(post.created_at)}{liveEditedAt && <span className="ml-1 italic">· edited</span>}
                  </span>
                </div>
              </div>
            )}

            {!isBelowDesktop && thread.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">Be the first to comment</p>
            )}

            {!isBelowDesktop && (<>


            {thread.map(({ comment, replies }) => {
              const REPLY_PAGE = 3;
              const shown = expandedReplies.get(comment.id) ?? Math.min(REPLY_PAGE, replies.length);
              const visibleReplies = replies.slice(0, shown);
              const remaining = replies.length - shown;

              return (
                <div key={comment.id} className="space-y-2">
                  <CommentItem c={comment} />

                  {visibleReplies.map((r) => <CommentItem key={r.id} c={r} depth={1} />)}

                  {remaining > 0 && (
                    <button
                      onClick={() => setExpandedReplies((m) => {
                        const n = new Map(m);
                        n.set(comment.id, Math.min(replies.length, shown + REPLY_PAGE));
                        return n;
                      })}
                      className="ml-9 text-[11px] text-primary font-semibold hover:underline flex items-center gap-1.5"
                    >
                      <span className="h-px w-6 bg-border" />
                      View {Math.min(REPLY_PAGE, remaining)} more {remaining === 1 ? "reply" : "replies"}
                      <span className="text-muted-foreground font-normal">({remaining} hidden)</span>
                    </button>
                  )}

                  {shown > REPLY_PAGE && (
                    <button
                      onClick={() => setExpandedReplies((m) => {
                        const n = new Map(m);
                        n.set(comment.id, REPLY_PAGE);
                        return n;
                      })}
                      className="ml-9 text-[11px] text-muted-foreground hover:text-foreground font-medium"
                    >
                      Hide replies
                    </button>
                  )}
                </div>
              );
            })}
            </>)}
          </div>

          {/* Actions */}
          <div className="border-t border-border">
            <div className="px-3 pt-3 pb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-2 min-w-0">
              <div className="flex items-center gap-1.5 md:gap-2 relative flex-wrap min-w-0">
                <VoteBtn type="crown" icon={Crown} color="from-amber-500 to-yellow-600" />
                <VoteBtn type="fire" icon={Flame} color="from-orange-500 to-red-600" />
                <VoteBtn type="diamond" icon={Gem} color="from-cyan-400 to-blue-600" />
                <VoteBtn type="dislike" icon={BrokenCrown} color="from-zinc-500 to-zinc-700" />
                <VoteBurst
                  type={overlayBurst?.type ?? null}
                  delta={overlayBurst?.delta}
                  onDone={() => setOverlayBurst(null)}
                />
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => isBelowDesktop && setCommentsOverlayOpen(true)}
                  aria-label={`Open comments${counts.comments ? ` (${counts.comments})` : ""}`}
                  className="flex items-center gap-1.5 px-2 min-h-[44px] rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 touch-manipulation transition"
                >
                  <MessageCircle size={18} />
                  <span className="text-xs tabular-nums font-semibold">{counts.comments}</span>
                  {isBelowDesktop && <span className="sr-only">Open comments</span>}
                </button>


                <button
                  onClick={() => setGiftOpen(true)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-primary hover:opacity-80 animate-[crown-pulse_3s_ease-in-out_infinite] touch-manipulation"
                  aria-label="Send Gift"
                >
                  <Gift size={18} />
                </button>

                <button
                  onClick={() => setShareOpen(true)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground touch-manipulation"
                  aria-label="Share"
                >
                  <Share2 size={18} />
                </button>

                {user && post.user_id !== user.id && (
                  <button
                    onClick={() => setRepostOpen(true)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-primary touch-manipulation"
                    aria-label="Repost"
                  >
                    <Repeat2 size={18} />
                  </button>
                )}
              </div>
            </div>

            <div className="px-4 pb-2 pt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
              <CategoryBadge category={post.category} label={CATEGORY_LABEL[post.category]} size="xs" />
              <span className="opacity-70">competing in</span>
              <span className="font-semibold text-foreground">{CATEGORY_LABEL[post.category]}</span>
            </div>

            {!isBelowDesktop && (<>
            {/* Reply context */}
            {replyTo && (
              <div className="px-3 pt-1 pb-1 flex items-center gap-2 text-[11px] text-muted-foreground border-t border-border bg-muted/30">
                <Reply size={11} className="text-primary" />
                <span>
                  Replying to <span className="text-foreground font-semibold">@{replyTo.profile?.username}</span>
                </span>
                <button type="button" onClick={cancelReply} className="ml-auto hover:text-foreground">
                  Cancel
                </button>
              </div>
            )}

            {/* Comment input with @mentions */}
            <div className="p-3 border-t border-border" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
              <div className="flex gap-2 items-center">
                <MentionInput
                  ref={inputRef}
                  value={text}
                  onChange={(v) => {
                    setText(v);
                    if (error) setError(null);
                    if (blockReason && retrySec === 0) setBlockReason(null);
                  }}
                  onSubmit={sendComment}
                  onMentionsChange={setMentions}
                  priorityUsers={priorityUsers}
                  placeholder={replyTo ? `Reply to @${replyTo.profile?.username}…` : "Add a comment… use @ to mention"}
                  maxLength={500}
                  className={blockReason ? "border-destructive ring-2 ring-destructive/40 bg-destructive/5 animate-[crown-pulse_1.2s_ease-in-out_2]" : ""}
                />

                <Button
                  onClick={sendComment}
                  disabled={sending || !text.trim() || retrySec > 0}
                  className="bg-gradient-gold text-primary-foreground min-w-[44px]"
                >
                  {retrySec > 0 ? <span className="text-xs font-bold tabular-nums">{retrySec}s</span> : <Send size={16} />}
                </Button>
              </div>

              {blockReason && (
                <div
                  role="alert"
                  className="mt-2 flex items-start gap-2 text-[11px] rounded-lg border border-destructive/40 bg-destructive/10 text-destructive p-2"
                >
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />

                  <div className="min-w-0 flex-1">
                    <div className="font-bold flex items-center gap-1.5 flex-wrap">
                      {blockReason.title}
                      <span className="text-[9px] uppercase tracking-wider opacity-70">[{blockReason.code}]</span>

                      {retrySec > 0 && (
                        <span className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-destructive/20 text-destructive font-mono tabular-nums">
                          <Clock size={10} />
                          {retrySec}s
                        </span>
                      )}
                    </div>

                    <div className="opacity-80">{blockReason.hint}</div>

                    <div className="opacity-60 mt-0.5 italic">
                      Your draft is saved — try again {retrySec > 0 ? `in ${retrySec}s` : "now"}.
                    </div>
                  </div>
                </div>
              )}

              {error && !blockReason && (
                <div role="alert" className="mt-2 flex items-start gap-1.5 text-[11px] text-destructive">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
            </>)}
          </div>
        </div>

        <ShareDialog open={shareOpen} onOpenChange={setShareOpen} post={post} />

        <RepostDialog open={repostOpen} onOpenChange={setRepostOpen} parent={post} />

        <GiftPanel
          isOpen={giftOpen}
          onClose={() => setGiftOpen(false)}
          recipient={{
            id: post.user_id,
            username: post.profile.username,
            avatarUrl: post.profile.profile_photo_url ?? undefined,
          }}
          postId={post.id}
          onSent={(gift, qty) => {
            setActiveGift(gift);
            setActiveGiftQty(qty);
          }}
        />

        <GiftAnimationOverlay
          gift={activeGift}
          quantity={activeGiftQty}
          onDone={() => setActiveGift(null)}
          anchored
        />
      </DialogContent>

      <ReportDialog
        open={!!reportCommentId}
        onOpenChange={(v) => {
          if (!v) setReportCommentId(null);
        }}
        commentId={reportCommentId ?? undefined}
        postId={post?.id}
      />

      {/* Universal mobile/tablet comments popup. Same component used in Feed,
          Profile, Scrolls/Shorts so commenting feels identical everywhere. */}
      <CommentsDrawer
        postId={commentsOverlayOpen && post ? ((post as any).parent_post_id ?? post.id) : null}
        onClose={() => setCommentsOverlayOpen(false)}
      />
    </Dialog>
  );
}
