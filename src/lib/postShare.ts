/**
 * Central source of truth for share-card data.
 *
 * Every share surface (post card, post detail, profile, native share, downloaded
 * PNG) must go through this module so that:
 *   - The same image URL is resolved everywhere.
 *   - Cache-bust tokens are deterministic (edited_at → created_at), never Date.now().
 *   - "Post deleted" is ONLY set on a confirmed missing row or is_removed=true —
 *     never on transient network / RLS / storage / image-load errors.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withCacheBust } from "@/lib/cacheBust";

/** Columns to select on the `posts` table for share rendering. */
export const POST_SHARE_COLUMNS =
  "id, user_id, image_url, image_urls, caption, category, vote_count, comment_count, share_count, video_url, video_poster_url, media_type, city, state, country, created_at, edited_at, is_removed";

export interface PostShareLike {
  id: string;
  image_url?: string | null;
  image_urls?: string[] | null;
  video_poster_url?: string | null;
  video_url?: string | null;
  media_type?: string | null;
  edited_at?: string | null;
  created_at?: string | null;
  is_removed?: boolean | null;
}

/** True only when the database confirms the post is gone or removed. */
export function isPostDeleted(
  post: PostShareLike | null | undefined,
  meta?: { rowMissing?: boolean },
): boolean {
  if (meta?.rowMissing) return true;
  if (!post) return false; // unknown != deleted
  return post.is_removed === true;
}

/** Deterministic cache-bust token tied to the post's last meaningful change. */
export function getPostShareVersion(post: PostShareLike | null | undefined): string | undefined {
  if (!post) return undefined;
  return (post.edited_at || post.created_at || undefined) ?? undefined;
}

/**
 * Resolve the canonical display image for a share card. Picks video poster for
 * video posts, otherwise the latest image_url. Returns null only when the post
 * is confirmed deleted or has no usable media at all.
 */
export function resolvePostShareImage(post: PostShareLike | null | undefined): string | null {
  if (!post || isPostDeleted(post)) return null;
  const raw =
    (post.media_type === "video" && post.video_poster_url) ||
    post.image_url ||
    post.image_urls?.[0] ||
    post.video_poster_url ||
    null;
  if (!raw) return null;
  return withCacheBust(raw, getPostShareVersion(post));
}

export interface UsePostShareDataResult<T extends PostShareLike> {
  post: T;
  loading: boolean;
  /** True only when the row is confirmed missing or is_removed. */
  deleted: boolean;
  /** True when the refetch failed for a transient reason (network/RLS/etc.). */
  refreshError: boolean;
}

/**
 * Refetch the freshest post row when `enabled` flips true. Never marks the post
 * deleted on a transient error — only on a clean "row not found" response or an
 * is_removed=true flag.
 */
export function usePostShareData<T extends PostShareLike>(
  initial: T,
  enabled: boolean,
): UsePostShareDataResult<T> {
  const [post, setPost] = useState<T>(initial);
  const [loading, setLoading] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const lastIdRef = useRef(initial.id);

  // Reset local state when the underlying post identity changes.
  useEffect(() => {
    if (lastIdRef.current !== initial.id) {
      lastIdRef.current = initial.id;
      setDeleted(false);
      setRefreshError(false);
    }
    setPost(initial);
  }, [initial]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setRefreshError(false);
    (async () => {
      const { data, error, status } = await supabase
        .from("posts")
        .select(POST_SHARE_COLUMNS)
        .eq("id", initial.id)
        .maybeSingle();
      if (cancelled) return;
      setLoading(false);
      if (error) {
        // Transient (network, RLS, schema). Keep last known data, surface a
        // soft refresh error — never set deleted.
        setRefreshError(true);
        return;
      }
      if (!data && status === 200) {
        setDeleted(true);
        return;
      }
      if (data) {
        const fresh = data as Partial<T>;
        if (fresh.is_removed === true) {
          setDeleted(true);
          return;
        }
        setPost((prev) => ({ ...prev, ...fresh }) as T);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, initial.id]);

  return { post, loading, deleted, refreshError };
}
