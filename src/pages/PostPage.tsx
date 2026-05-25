import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import PostCard, { type FeedPost } from "@/components/PostCard";
import CrownLoader from "@/components/CrownLoader";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useSeoMeta, buildPostOgImage } from "@/hooks/useSeoMeta";

export default function PostPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Dynamic per-post meta — updates once the post loads.
  // When post is null (loading) we show generic CrownMe defaults.
  const postUsername = (post as any)?.profile?.username as string | undefined;
  useSeoMeta({
    title: post
      ? `${postUsername ? `@${postUsername}` : "Post"} on CrownMe`
      : "Post · CrownMe",
    description: post?.caption
      ? `${post.caption.slice(0, 150)}${post.caption.length > 150 ? "…" : ""} — Vote on CrownMe`
      : "View this post on CrownMe and cast your vote.",
    image: buildPostOgImage(post?.id, post?.image_url ?? undefined),
    type: "article",
  });

  useEffect(() => {
    if (!id) { setNotFound(true); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("posts")
        .select(`
          id, user_id, image_url, image_urls, caption, category,
          city, state, country, crown_score, vote_count, comment_count,
          share_count, battle_wins, created_at, edited_at, pinned_at,
          scheduled_for, parent_post_id, repost_caption, tagged_user_ids,
          media_type, video_url, video_poster_url, filter, alt_texts,
          profile:profiles!posts_user_id_fkey(
            username, profile_photo_url, crowns_held, gender,
            hide_likes, hide_comments, hide_views
          )
        `)
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) { setNotFound(true); }
      else { setPost(data as unknown as FeedPost); }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <AppShell title="POST">
      <div className="max-w-xl mx-auto px-2 py-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-3 gap-1.5"
          onClick={() => nav(-1)}
        >
          <ArrowLeft size={15} /> Back
        </Button>

        {loading && <CrownLoader label="Loading post…" />}

        {!loading && notFound && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-semibold mb-2">Post not found</p>
            <p className="text-sm">It may have been deleted or made private.</p>
            <Button type="button" className="mt-4" onClick={() => nav("/feed")}>
              Back to Feed
            </Button>
          </div>
        )}

        {!loading && post && <PostCard post={post} />}
      </div>
    </AppShell>
  );
}
