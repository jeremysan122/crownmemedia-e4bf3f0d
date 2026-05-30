import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/crown";
import { toast } from "sonner";
import { Flag, Send, Flame } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

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
  profile: { username: string; profile_photo_url: string | null } | null;
}

export default function CommentsDrawer({ postId, onClose, variant = "sheet" }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [fireCounts, setFireCounts] = useState<Record<string, number>>({});
  const [myFires, setMyFires] = useState<Set<string>>(new Set());

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
      setComments([]);
      return;
    }

    let cancelled = false;
    setInitialLoading(true);

    supabase
      .from("comments")
      .select("id, body, created_at, user_id, profile:profiles!comments_user_id_fkey(username, profile_photo_url)")
      .eq("post_id", postId)
      .eq("is_removed", false)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data as any) || [];
        setComments(rows);
        loadReactions(rows.map((c: CommentRow) => c.id));
        setInitialLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [postId, loadReactions]);

  const toggleFire = async (commentId: string) => {
    if (!user) return toast.error("Sign in to react");
    const hasFired = myFires.has(commentId);

    // Optimistic
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
        toast.error(error.message);
        // revert
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
        toast.error(error.message);
        setMyFires((prev) => {
          const next = new Set(prev);
          next.delete(commentId);
          return next;
        });
        setFireCounts((prev) => ({
          ...prev,
          [commentId]: Math.max(0, (prev[commentId] || 0) - 1),
        }));
      } else {
        trackEvent("comment_fired", { metadata: { commentId } });
      }
    }
  };

  const send = async () => {
    if (!user || !postId || !text.trim()) return;

    setLoading(true);

    const body = text.trim().slice(0, 500);

    const { error } = await supabase.from("comments").insert({
      post_id: postId,
      user_id: user.id,
      body,
    });

    setLoading(false);

    if (error) return toast.error(error.message);

    trackEvent("comment_posted", {
      postId,
      metadata: { length: body.length },
    });

    window.dispatchEvent(
      new CustomEvent("crownme:comment-added", { detail: { postId } }),
    );

    setText("");

    const { data } = await supabase
      .from("comments")
      .select("id, body, created_at, user_id, profile:profiles!comments_user_id_fkey(username, profile_photo_url)")
      .eq("post_id", postId)
      .eq("is_removed", false)
      .order("created_at", { ascending: false });

    const rows = (data as any) || [];
    setComments(rows);
    loadReactions(rows.map((c: CommentRow) => c.id));
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

  return (
    <Sheet open={!!postId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side={isSide ? "right" : "bottom"}
        className={cn(
          "bg-card border-border flex flex-col p-0",
          isSide
            ? "h-[100dvh] w-full sm:max-w-[440px] sm:w-[440px] border-l rounded-none"
            : "h-[85dvh] max-h-[85dvh] rounded-t-2xl",
        )}
      >
        <SheetHeader className="px-4 pt-4 pb-2 shrink-0">
          <SheetTitle className="font-display text-gold">
            Comments{comments.length > 0 ? ` · ${comments.length}` : ""}
          </SheetTitle>
        </SheetHeader>


        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto space-y-3 px-4 py-3">
            {comments.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">
                Be the first to comment
              </p>
            )}

            {comments.map((c) => {
              const fired = myFires.has(c.id);
              const count = fireCounts[c.id] || 0;
              return (
                <div key={c.id} className="flex gap-2">
                  <div className="size-8 rounded-full bg-muted overflow-hidden shrink-0">
                    {c.profile?.profile_photo_url && (
                      <img
                        src={c.profile.profile_photo_url}
                        className="w-full h-full object-cover"
                        alt=""
                      />
                    )}
                  </div>

                  <div className="flex-1">
                    <div className="bg-muted/50 rounded-2xl px-3 py-2">
                      <p className="text-xs font-bold">@{c.profile?.username || "user"}</p>
                      <p className="text-sm">{c.body}</p>
                    </div>

                    <div className="flex gap-3 mt-1 px-1 items-center">
                      <span className="text-[10px] text-muted-foreground">
                        {timeAgo(c.created_at)}
                      </span>

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

                      <button
                        onClick={() => report(c.id)}
                        className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1"
                      >
                        <Flag size={10} /> Report
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="shrink-0 p-3 bg-card border-t border-border flex gap-2 pb-[calc(env(safe-area-inset-bottom,0)+0.75rem)]">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add a comment..."
              className="bg-input"
              maxLength={500}
            />

            <Button
              onClick={send}
              disabled={loading || !text.trim()}
              className="bg-gradient-gold text-primary-foreground"
            >
              <Send size={16} />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
