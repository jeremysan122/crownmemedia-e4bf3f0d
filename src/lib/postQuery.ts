// ============================================================================
// Canonical post query.
//
// IMPORTANT: All post display surfaces must use this canonical post query.
// Do not create separate feed/profile/leaderboard/shorts post SELECT shapes —
// when a field is missing from a surface-specific select, shared components
// (PostCard / PostDetailDialog) silently render the old/empty version and the
// post looks "different" between pages.
//
// If you need a new field on any post surface, add it here so every surface
// picks it up at once.
// ============================================================================
import { supabase } from "@/integrations/supabase/client";
import type { FeedPost } from "@/components/PostCard";

export const POST_SELECT = `
  id, user_id, image_url, image_urls, caption, category,
  city, state, country, crown_score, vote_count, comment_count,
  share_count, battle_wins, created_at, edited_at, pinned_at,
  scheduled_for, parent_post_id, repost_caption, tagged_user_ids,
  media_type, video_url, video_poster_url, duration_ms, filter, alt_texts,
  is_sensitive, sensitive_reason, content_type,
  profile:profiles!posts_user_id_fkey(
    username, profile_photo_url, crowns_held, gender,
    hide_likes, hide_comments, hide_views, verified
  )
`;

export async function fetchPostById(id: string): Promise<FeedPost | null> {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as FeedPost;
}

/**
 * Shorts (vertical scroll) feed.
 *
 * Reads rows with `content_type='scroll'` (authoritative under the new model)
 * OR — for rows inserted before the column existed — legacy `media_type='video'`
 * rows. The OR clause keeps backfilled and pre-backfill scrolls visible during
 * the rollout. Uses the canonical POST_SELECT so the same row shape powers the
 * Shorts player, the feed, and the post detail dialog.
 */
export async function fetchShortsPage(opts: { limit: number; beforeCreatedAt?: string }) {
  let q = supabase
    .from("posts")
    .select(POST_SELECT)
    .or("content_type.eq.scroll,media_type.eq.video")
    .eq("is_removed", false)
    .eq("is_archived", false)
    .not("video_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(opts.limit);
  if (opts.beforeCreatedAt) q = q.lt("created_at", opts.beforeCreatedAt);
  const { data, error } = await q;
  if (error) return [] as FeedPost[];
  return (data ?? []) as unknown as FeedPost[];
}

