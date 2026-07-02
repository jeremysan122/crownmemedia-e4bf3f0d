import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/crown";
import { toast } from "sonner";
import { toFriendlyMessage, logRawError } from "@/lib/settingsSecurityErrors";
import { Flag, Send, Flame, X, ChevronDown, ChevronUp } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  postId: string | null;
  onClose: () => void;
  /**
   * Layout variant.
   * - "sheet" (default): bottom slide-up — mobile/tablet.
   * - "side": right-docked panel — desktop / wide screens (≥1024px). Used by
   *   Scrolls/Shorts so the user never leaves the current video to comment.
   */
  variant?: "sheet" | "side";
}

interface CommentRow {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  parent_id: string | null;
  reply_count: number;
  profile: { username: string; profile_photo_url: string | null } | null;
}

const SURFACE_KEYS = new Set([
  "comments", "comment-count", "post", "posts", "feed", "feed-posts",
  "profile", "profile-posts", "profile-stats", "shorts", "shorts-posts",
  "scrolls", "post-detail", "post-page", "leaderboard", "leaderboard-posts",
  "battles", "battle-posts",
]);

export default function CommentsDrawer({ postId, onClose, variant = "sheet" }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // Top-level comments only (parent_id IS NULL)
  const [topComments, setTopComments] = useState<CommentRow[]>([]);
  // Replies keyed by parent comment id
  const [repliesByParent, setRepliesByParent] = useState<Record<string, CommentRow[]>>({});
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [fireCounts, setFireCounts] = useState<Record<string, number>>({});
  const [myFires, setMyFires] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; username: string } | null>(null);

  const totalCount = useMemo(() => {
    return topComments.length + Object.values(repliesByParent).reduce((n, r) => n + r.length, 0);
  }, [topComments, repliesByParent]);

  const invalidateSurfaces = useCallback(() => {
    try {
      queryClient.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey;
          if (!Array.isArray(key)) return false;
          if (postId && key.some((seg) => seg === postId)) return true;
          return key.some((seg) => typeof seg === "string" && SURFACE_KEYS.has(seg));
        },
      });
    } catch { /* react-query may not be mounted in tests */ }
  }, [queryClient, postId]);

  const loadReactions = useCallback(async (commentIds: string[]) => {
    if (commentIds.length === 0) {
      setFireCounts({});
      setMyFires(new Set());
      return;
    }
    const { data } = await supabase
      .from("comment_reactions")
      .select("comment_id, user_id")
      .in("comment_id", commentIds);
    const counts: Record<string, number> = {};
    const mine = new Set<string>();
    (data || []).forEach((r: any) => {
      counts[r.comment_id] = (counts[r.comment_id] || 0) + 1;
      if (user && r.user_id === user.id) mine.add(r.comment_id);
    });
    setFireCounts(counts);
    setMyFires(mine);
  }, [user]);

  useEffect(() => {
    if (!postId) {
      setTopComments([]);
      setRepliesByParent({});
      setExpandedParents(new Set());
      setReplyingTo(null);
      return;
    }

    let cancelled = false;
    setInitialLoading(true);

    supabase
      .from("comments")
      .select("id, body, created_at, user_id, parent_id, reply_count, profile:profiles!comments_user_id_fkey(username, profile_photo_url)")
      .eq("post_id", postId)
      .eq("is_removed", false)
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data as any) || [];
        setTopComments(rows);
        loadReactions(rows.map((c: CommentRow) => c.id));
        setInitialLoading(false);
      });

    return () => { cancelled = true; };
  }, [postId, loadReactions]);

  const loadReplies = useCallback(async (parentId: string) => {
    const { data } = await supabase
      .from("comments")
      .select("id, body, created_at, user_id, parent_id, reply_count, profile:profiles!comments_user_id_fkey(username, profile_photo_url)")
      .eq("parent_id", parentId)
      .eq("is_removed", false)
      .order("created_at", { ascending: true })
      .limit(50);
    const rows = (data as any) || [];
    setRepliesByParent((prev) => ({ ...prev, [parentId]: rows }));
    // Fold reply ids into reactions cache
    const ids = rows.map((r: CommentRow) => r.id);
    if (ids.length) {
      const { data: rdata } = await supabase
        .from("comment_reactions")
        .select("comment_id, user_id")
        .in("comment_id", ids);
      setFireCounts((prev) => {
        const next = { ...prev };
        (rdata || []).forEach((r: any) => { next[r.comment_id] = (next[r.comment_id] || 0) + 1; });
        return next;
      });
      if (user) {
        setMyFires((prev) => {
          const next = new Set(prev);
          (rdata || []).forEach((r: any) => { if (r.user_id === user.id) next.add(r.comment_id); });
          return next;
        });
      }
    }
  }, [user]);

  const toggleReplies = (parentId: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
        if (!repliesByParent[parentId]) loadReplies(parentId);
      }
      return next;
    });
  };

  const startReply = (commentId: string, username: string) => {
    if (!user) return toast.error("Sign in to reply");
    setReplyingTo({ commentId, username });
    if (!expandedParents.has(commentId)) toggleReplies(commentId);
  };

  const toggleFire = async (commentId: string) => {
    if (!user) return toast.error("Sign in to react");
    const hasFired = myFires.has(commentId);

    setMyFires((prev) => {
      const next = new Set(prev);
      hasFired ? next.delete(commentId) : next.add(commentId);
      return next;
    });
    setFireCounts((prev) => ({
      ...prev,
      [commentId]: Math.max(0, (prev[commentId] || 0) + (hasFired ? -1 : 1)),
    }));

    if (hasFired) {
      const { error } = await supabase
        .from("comment_reactions")
        .delete()
        .eq("comment_id", commentId)
        .eq("user_id", user.id);
      if (error) {
        { logRawError(error, "generic"); toast.error(toFriendlyMessage(error, "generic")); }
        setMyFires((prev) => new Set(prev).add(commentId));
        setFireCounts((prev) => ({ ...prev, [commentId]: (prev[commentId] || 0) + 1 }));
      } else {
        trackEvent("comment_fire_removed", { metadata: { commentId } });
      }
    } else {
      const { error } = await supabase
        .from("comment_reactions")
        .insert({ comment_id: commentId, user_id: user.id });
      if (error) {
        { logRawError(error, "generic"); toast.error(toFriendlyMessage(error, "generic")); }
        setMyFires((prev) => { const next = new Set(prev); next.delete(commentId); return next; });
        setFireCounts((prev) => ({ ...prev, [commentId]: Math.max(0, (prev[commentId] || 0) - 1) }));
      } else {
        trackEvent("comment_fired", { metadata: { commentId } });
      }
    }
  };

  const send = async () => {
    if (!postId || !text.trim()) return;
    if (!user) {
      toast.error("Sign in to comment");
      return;
    }

    const body = text.trim().slice(0, 500);
    const parentId = replyingTo?.commentId ?? null;

    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticRow: CommentRow = {
      id: optimisticId,
      body,
      created_at: new Date().toISOString(),
      user_id: user.id,
      parent_id: parentId,
      reply_count: 0,
      profile: {
        username: (user.user_metadata as any)?.username || "you",
        profile_photo_url: (user.user_metadata as any)?.profile_photo_url || null,
      },
    };

    if (parentId) {
      setRepliesByParent((prev) => ({
        ...prev,
        [parentId]: [...(prev[parentId] || []), optimisticRow],
      }));
      // bump local reply_count so "View N replies" updates instantly
      setTopComments((prev) => prev.map((c) => c.id === parentId ? { ...c, reply_count: c.reply_count + 1 } : c));
    } else {
      setTopComments((prev) => [optimisticRow, ...prev]);
    }
    setText("");
    setLoading(true);

    const { error } = await supabase.from("comments").insert({
      post_id: postId,
      user_id: user.id,
      body,
      parent_id: parentId,
    });

    setLoading(false);

    if (error) {
      // Roll back optimistic insert
      if (parentId) {
        setRepliesByParent((prev) => ({
          ...prev,
          [parentId]: (prev[parentId] || []).filter((c) => c.id !== optimisticId),
        }));
        setTopComments((prev) => prev.map((c) => c.id === parentId ? { ...c, reply_count: Math.max(0, c.reply_count - 1) } : c));
      } else {
        setTopComments((prev) => prev.filter((c) => c.id !== optimisticId));
      }
      setText(body);
      { logRawError(error, "generic"); toast.error(toFriendlyMessage(error, "generic") || "Could not post comment"); }
      return;
    }

    trackEvent("comment_posted", {
      postId,
      metadata: { length: body.length, isReply: !!parentId, parentId: parentId || undefined },
    });

    window.dispatchEvent(
      new CustomEvent("crownme:comment-added", { detail: { postId, parentId } }),
    );

    invalidateSurfaces();

    setReplyingTo(null);

    // Reconcile from server (replaces optimistic rows with real ones).
    if (parentId) {
      await loadReplies(parentId);
    } else {
      const { data } = await supabase
        .from("comments")
        .select("id, body, created_at, user_id, parent_id, reply_count, profile:profiles!comments_user_id_fkey(username, profile_photo_url)")
        .eq("post_id", postId)
        .eq("is_removed", false)
        .is("parent_id", null)
        .order("created_at", { ascending: false });
      const rows = (data as any) || [];
      setTopComments(rows);
      loadReactions(rows.map((c: CommentRow) => c.id));
    }
  };

  const report = async (commentId: string) => {
    if (!user) return;
    await supabase.from("reports").insert({
      reporter_id: user.id,
      comment_id: commentId,
      reason: "User reported comment",
    });
    toast.success("Reported. Moderators will review.");
  };

  const isSide = variant === "side";

  const renderComment = (c: CommentRow, isReply = false) => {
    const fired = myFires.has(c.id);
    const count = fireCounts[c.id] || 0;
    return (
      <div key={c.id} className={cn("flex gap-2", isReply && "ml-9")}>
        <div className={cn("rounded-full bg-muted overflow-hidden shrink-0", isReply ? "size-7" : "size-8")}>
          {c.profile?.profile_photo_url && (
            <img src={c.profile.profile_photo_url} className="w-full h-full object-cover" alt="" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="bg-muted/50 rounded-2xl px-3 py-2">
            <p className="text-xs font-bold">@{c.profile?.username || "user"}</p>
            <p className="text-sm break-words">{c.body}</p>
          </div>
          <div className="flex gap-3 mt-1 px-1 items-center flex-wrap">
            <span className="text-[10px] text-muted-foreground">{timeAgo(c.created_at)}</span>

            <button
              onClick={() => toggleFire(c.id)}
              aria-pressed={fired}
              aria-label={fired ? "Remove fire reaction" : "Fire reaction"}
              className={cn(
                "text-[10px] flex items-center gap-1 transition-colors",
                fired ? "text-orange-500" : "text-muted-foreground hover:text-orange-500",
              )}
            >
              <Flame size={12} className={cn(fired && "fill-orange-500")} />
              {count > 0 && <span>{count}</span>}
            </button>

            {!isReply && (
              <button
                onClick={() => startReply(c.id, c.profile?.username || "user")}
                className="text-[10px] text-muted-foreground hover:text-primary font-semibold"
                aria-label={`Reply to @${c.profile?.username || "user"}`}
              >
                Reply
              </button>
            )}

            <button
              onClick={() => report(c.id)}
              className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1"
            >
              <Flag size={10} /> Report
            </button>
          </div>

          {!isReply && c.reply_count > 0 && (
            <button
              onClick={() => toggleReplies(c.id)}
              className="mt-1 px-1 text-[11px] text-primary hover:text-primary/80 font-semibold inline-flex items-center gap-1"
            >
              {expandedParents.has(c.id) ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {expandedParents.has(c.id) ? "Hide replies" : `View ${c.reply_count} ${c.reply_count === 1 ? "reply" : "replies"}`}
            </button>
          )}

          {!isReply && expandedParents.has(c.id) && (
            <div className="mt-2 space-y-2">
              {(repliesByParent[c.id] || []).map((r) => renderComment(r, true))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Sheet open={!!postId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side={isSide ? "right" : "bottom"}
        className={cn(
          "bg-card border-border flex flex-col p-0",
          isSide
            ? "h-[100dvh] w-full sm:max-w-[440px] sm:w-[440px] border-l rounded-none"
            : "h-[85dvh] max-h-[calc(100dvh-env(safe-area-inset-top,0px)-0.5rem)] rounded-t-2xl",
        )}
      >
        {!isSide && (
          <div className="pt-2 pb-1 flex justify-center shrink-0" aria-hidden="true">
            <div className="h-1.5 w-10 rounded-full bg-muted-foreground/40" />
          </div>
        )}
        <SheetHeader className={cn("px-4 pb-2 shrink-0", isSide ? "pt-4" : "pt-1")}>
          <SheetTitle className="font-display text-gold">
            Comments{totalCount > 0 ? ` · ${totalCount}` : ""}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Read and add comments and replies for this post.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto space-y-3 px-4 py-3" data-testid="comments-list">
            {initialLoading && topComments.length === 0 && (
              <div className="space-y-3" data-testid="comments-loading">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex gap-2 animate-pulse">
                    <div className="size-8 rounded-full bg-muted shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-24 bg-muted rounded" />
                      <div className="h-10 bg-muted/60 rounded-2xl" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!initialLoading && topComments.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">Be the first to comment</p>
            )}

            {topComments.map((c) => renderComment(c, false))}
          </div>

          {!user ? (
            <div className="shrink-0 p-3 bg-card border-t border-border text-center pb-[calc(env(safe-area-inset-bottom,0)+0.75rem)]">
              <p className="text-sm text-muted-foreground">
                <a href="/auth" className="text-gold font-semibold underline">Sign in</a> to join the conversation.
              </p>
            </div>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); send(); }}
              className="shrink-0 bg-card border-t border-border pb-[calc(env(safe-area-inset-bottom,0)+0.75rem)]"
            >
              {replyingTo && (
                <div className="flex items-center justify-between gap-2 px-3 pt-2 text-[11px] text-muted-foreground">
                  <span>Replying to <span className="text-primary font-semibold">@{replyingTo.username}</span></span>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="size-5 rounded-full hover:bg-muted/60 flex items-center justify-center"
                    aria-label="Cancel reply"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
              <div className="p-3 flex gap-2">
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={replyingTo ? `Reply to @${replyingTo.username}…` : "Add a comment..."}
                  className="bg-input"
                  maxLength={500}
                  aria-label={replyingTo ? "Reply to comment" : "Add a comment"}
                />
                <Button
                  type="submit"
                  disabled={loading || !text.trim()}
                  className="bg-gradient-gold text-primary-foreground"
                  aria-label={replyingTo ? "Send reply" : "Send comment"}
                >
                  <Send size={16} />
                </Button>
              </div>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
