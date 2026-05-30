// ============================================================================
// Canonical post query.
//
// IMPORTANT: Posts must use ONE canonical post row across CrownMe (feed,
// profile grid, post detail dialog, post page, leaderboard cards). Do NOT
// create separate feed/profile copies or alternate select shapes that omit
// fields the shared `PostCard` / `PostDetailDialog` components rely on —
// when a field is missing, those components silently render the old/empty
// version and the post looks "different" between pages.
//
// If you need a new field on the post detail view, add it here so every
// surface picks it up at once.
// ============================================================================
import { supabase } from "@/integrations/supabase/client";
import type { FeedPost } from "@/components/PostCard";

export const POST_SELECT = `
  id, user_id, image_url, image_urls, caption, category,
  city, state, country, crown_score, vote_count, comment_count,
  share_count, battle_wins, created_at, edited_at, pinned_at,
  scheduled_for, parent_post_id, repost_caption, tagged_user_ids,
  media_type, video_url, video_poster_url, filter, alt_texts,
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
