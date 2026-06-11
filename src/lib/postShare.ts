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
import { resolveSensitiveDecision, type SensitiveViewer } from "@/lib/sensitiveVisibility";

/** Columns to select on the `posts` table for share rendering. */
export const POST_SHARE_COLUMNS =
  "id, user_id, image_url, image_urls, caption, category, vote_count, comment_count, share_count, video_url, video_poster_url, media_type, city, state, country, created_at, edited_at, is_removed, is_sensitive, sensitive_reason";

export interface PostShareLike {
  id: string;
  user_id?: string | null;
  image_url?: string | null;
  image_urls?: string[] | null;
  video_poster_url?: string | null;
  video_url?: string | null;
  media_type?: string | null;
  edited_at?: string | null;
  created_at?: string | null;
  is_removed?: boolean | null;
  is_sensitive?: boolean | null;
  sensitive_reason?: string | null;
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

/**
 * Deterministic cache-bust token tied to the post's last meaningful change.
 * is_sensitive flips are picked up via edited_at — Upload/Edit must touch
 * edited_at when the sensitivity toggle changes so cached share images are
 * invalidated everywhere.
 */
export function getPostShareVersion(post: PostShareLike | null | undefined): string | undefined {
  if (!post) return undefined;
  // Mix the sensitive flag into the token so toggling it busts caches even
  // when edited_at hasn't otherwise changed.
  const base = post.edited_at || post.created_at || undefined;
  if (!base) return undefined;
  return post.is_sensitive ? `${base}|s` : base;
}

/**
 * Resolve the canonical display image for a share card. Picks video poster for
 * video posts, otherwise the latest image_url. Returns null only when the post
 * is confirmed deleted, has no usable media, OR when sensitive-content rules
 * say the viewer must not see the media in clear (callers should render their
 * existing "content warning" placeholder in that case).
 */
export function resolvePostShareImage(
  post: PostShareLike | null | undefined,
  viewer?: SensitiveViewer,
): string | null {
  if (!post || isPostDeleted(post)) return null;
  if (viewer) {
    const d = resolveSensitiveDecision(post, viewer);
    // Share cards never bake an unblurred sensitive image when the viewer's
    // own preference/eligibility says otherwise.
    if (d !== "show") return null;
  }
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
  /** True when the row exists but the current viewer can't read it (RLS/privacy/block). */
  hidden: boolean;
  /** True when the refetch failed for a transient reason (network/RLS/etc.). */
  refreshError: boolean;
}

/**
 * Refetch the freshest post row when `enabled` flips true. Never marks the post
 * deleted on a transient error. When the row comes back empty we call the
 * `get_post_share_status` security-definer RPC to disambiguate three real
 * outcomes: deleted (row gone), removed (moderated), or hidden (RLS/privacy
 * blocks the current viewer but the post still exists for others).
 */
export function usePostShareData<T extends PostShareLike>(
  initial: T,
  enabled: boolean,
): UsePostShareDataResult<T> {
  const [post, setPost] = useState<T>(initial);
  const [loading, setLoading] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const lastIdRef = useRef(initial.id);

  useEffect(() => {
    if (lastIdRef.current !== initial.id) {
      lastIdRef.current = initial.id;
      setDeleted(false);
      setHidden(false);
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
      const { data, error } = await supabase
        .from("posts")
        .select(POST_SHARE_COLUMNS)
        .eq("id", initial.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setLoading(false);
        setRefreshError(true);
        return;
      }
      if (!data) {
        // Disambiguate deleted vs hidden-by-RLS via security-definer RPC.
        const { data: status, error: statusErr } = await supabase.rpc(
          "get_post_share_status",
          { _post_id: initial.id },
        );
        if (cancelled) return;
        setLoading(false);
        if (statusErr) {
          setRefreshError(true);
          return;
        }
        if (status === "deleted" || status === "removed") setDeleted(true);
        else if (status === "visible") setHidden(true);
        return;
      }
      setLoading(false);
      const fresh = data as Partial<T>;
      if (fresh.is_removed === true) {
        setDeleted(true);
        return;
      }
      setPost((prev) => ({ ...prev, ...fresh }) as T);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, initial.id]);

  return { post, loading, deleted, hidden, refreshError };
}
