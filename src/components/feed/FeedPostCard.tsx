// Wraps a PostCard with an IntersectionObserver that fires `post_viewed`
// exactly once per session for this post once it has been at least 50%
// visible for ≥500ms. Dedupe + idle-callback scheduling live inside
// trackUsageEvent / a module-level Set, so this component is free to mount
// in lists without spamming analytics.
import { memo, useEffect, useRef } from "react";
import PostCard, { FeedPost } from "@/components/PostCard";
import { trackUsageEvent } from "@/lib/usageTrack";

// Per-session dedupe: even if a post unmounts and remounts (filter changes,
// realtime patch, scroll virtualization in future) we never re-fire its view.
const seenThisSession = new Set<string>();

interface Props {
  post: FeedPost;
  onCommentClick: (postId: string) => void;
  feature?: string; // "Feed"
  tab?: string;
  category?: string | null;
}

const FeedPostCard = memo(function FeedPostCard({ post, onCommentClick, feature = "Feed", tab, category }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (firedRef.current || seenThisSession.has(post.id)) return;
    if (typeof IntersectionObserver === "undefined") return;

    let timer: number | null = null;

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (timer != null) return;
          timer = window.setTimeout(() => {
            if (firedRef.current || seenThisSession.has(post.id)) return;
            firedRef.current = true;
            seenThisSession.add(post.id);
            trackUsageEvent("post_viewed", {
              postId: post.id,
              category: category ?? post.category ?? null,
              metadata: {
                feature,
                tab: tab ?? null,
                // created_at can be useful for "are users seeing fresh content?"
                // but we truncate to the date to avoid high-cardinality metadata.
                post_date: post.created_at ? String(post.created_at).slice(0, 10) : null,
              },
            });
            io.disconnect();
          }, 500);
        } else if (timer != null) {
          window.clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: [0, 0.5, 1] },
    );

    io.observe(el);
    return () => {
      if (timer != null) window.clearTimeout(timer);
      io.disconnect();
    };
  }, [post.id, post.category, post.created_at, feature, tab, category]);

  return (
    <div ref={ref}>
      <PostCard post={post} onCommentClick={onCommentClick} />
    </div>
  );
});

export default FeedPostCard;

/** Test-only: reset the per-session dedupe set. */
export function __resetFeedPostViewSeenForTests(): void {
  seenThisSession.clear();
}
