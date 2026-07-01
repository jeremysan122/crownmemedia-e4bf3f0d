// ============================================================================
// Canonical post query.
//
// IMPORTANT: All post display surfaces must use this canonical post query.
// Do not create separate feed/profile/leaderboard/shorts post SELECT shapes —
// when a field is missing from a surface-specific select, shared components
// (PostCard / PostDetailDialog) silently render the old/empty version and the
// post looks "different" between pages.
//
// REPOST PARENT HYDRATION
// -----------------------
// We intentionally do NOT use a nested self-join (parent:posts!...) in
// POST_SELECT. PostgREST's schema cache has been observed to fail resolving
// the posts→posts self-relationship in production ("Could not find a
// relationship between 'posts' and 'posts' in the schema cache"), which
// crashes the entire Feed. Instead, fetch posts with POST_SELECT, then call
// `hydrateParents()` to batch-load parent metadata in a single follow-up
// query and merge it client-side. This avoids the self-join entirely while
// still giving PostCard / PostDetailDialog the `parent` field for repost
// attribution.
// ============================================================================
import { supabase } from "@/integrations/supabase/client";
import type { FeedPost } from "@/components/PostCard";

export const POST_SELECT = `
  id, user_id, image_url, image_urls, caption, category,
  city, state, country, crown_score, vote_count, comment_count,
  share_count, battle_wins, created_at, edited_at, pinned_at,
  scheduled_for, parent_post_id, repost_caption, tagged_user_ids,
  media_type, video_url, video_poster_url, duration_ms, filter, alt_texts,
  aspect_ratio, is_sensitive, sensitive_reason, content_type,
  profile:profiles!posts_user_id_fkey(
    username, profile_photo_url, crowns_held, gender,
    hide_likes, hide_comments, hide_views, verified
  )
`;

// Subset of POST_SELECT used when batch-loading parent (original) posts for
// repost attribution. Wider than just header fields because reposts must
// display the ORIGINAL post's stats, media, filter, category, and location
// (interactions target the original — see PostCard `interactionPostId`).
const PARENT_SELECT = `
  id, user_id, image_url, image_urls, caption, category,
  city, state, country, created_at, is_removed, is_archived,
  crown_score, vote_count, comment_count, share_count, battle_wins,
  media_type, video_url, video_poster_url, filter, alt_texts,
  aspect_ratio, tagged_user_ids, is_sensitive, sensitive_reason,
  profile:profiles!posts_user_id_fkey(
    username, profile_photo_url, crowns_held, gender,
    hide_likes, hide_comments, hide_views, verified
  )
`;

/**
 * Batch-load and attach `parent` metadata to any rows that have a
 * `parent_post_id`. Mutates the passed-in array in place AND returns it so it
 * can be chained. Silently leaves `parent = null` for any unresolved id
 * (deleted, RLS-blocked, banned author, etc.) — the UI must treat a missing
 * parent as "Original post is no longer available."
 */
export async function hydrateParents<T extends { parent_post_id?: string | null; parent?: any }>(
  rows: T[],
): Promise<T[]> {
  if (!rows || rows.length === 0) return rows;
  const ids = Array.from(
    new Set(
      rows
        .map((r) => r.parent_post_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );
  if (ids.length === 0) return rows;
  const { data, error } = await supabase
    .from("posts")
    .select(PARENT_SELECT)
    .in("id", ids);
  if (error || !data) return rows;
  const byId = new Map<string, any>();
  for (const p of data as any[]) {
    // Respect visibility: don't attach removed/archived originals — the UI
    // will render the "Original post is no longer available" fallback.
    if (p.is_removed || p.is_archived) continue;
    byId.set(p.id, p);
  }
  for (const r of rows) {
    if (r.parent_post_id) {
      r.parent = byId.get(r.parent_post_id) ?? null;
    }
  }
  return rows;
}

export async function fetchPostById(id: string): Promise<FeedPost | null> {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as FeedPost;
  await hydrateParents([row as any]);
  return row;
}

/**
 * Shorts (vertical scroll) feed.
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
  const rows = (data ?? []) as unknown as FeedPost[];
  await hydrateParents(rows as any[]);
  return rows;
}
