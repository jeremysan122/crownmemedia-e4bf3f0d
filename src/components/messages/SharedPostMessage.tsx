// Renders a shared post/Scroll or profile card inside a DM thread.
//
// Routing contract:
//   - The destination URL is ALWAYS built from the stored content id
//     (postId / profileId) — never from the DM message id or notification id.
//   - Scrolls are stored as posts with content_type === "scroll"; both route
//     through /p/:id which resolves to the correct detail view.
//
// Safety:
//   - If required metadata is missing, or the target row is unreachable
//     (deleted, hidden, banned, RLS-blocked, moderation removed, fetch
//     failure), we render a neutral "This content is no longer available."
//     fallback. We never expose the underlying reason, raw DB errors, or
//     private fields. Malformed metadata is logged with safe fields only.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ImageOff, UserRound, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isScroll } from "@/lib/contentType";
import PostMedia from "@/components/PostMedia";
import type { FilterId } from "@/lib/filters";

interface SharedRow {
  kind: "post_share" | "profile_share";
  postId?: string | null;
  profileId?: string | null;
  body?: string | null;
  mine: boolean;
  /** Optional — only used for safe diagnostic logging. */
  messageId?: string | null;
}

type PostPreview = {
  id: string;
  user_id: string;
  image_url: string | null;
  video_url: string | null;
  video_poster_url?: string | null;
  media_type?: string | null;
  filter?: string | null;
  category: string | null;
  content_type: string | null;
  is_removed: boolean | null;
  is_archived: boolean | null;
  moderation_status: string | null;
  profile?: { username: string | null; profile_photo_url: string | null } | null;
};
type ProfilePreview = {
  id: string;
  username: string | null;
  profile_photo_url: string | null;
  is_banned?: boolean | null;
  is_suspended?: boolean | null;
};

export function isUnavailablePost(p: PostPreview | null): boolean {
  if (!p) return true;
  if (p.is_removed || p.is_archived) return true;
  if (p.moderation_status && ["removed", "rejected", "quarantined"].includes(p.moderation_status)) return true;
  return false;
}
export function isUnavailableProfile(p: ProfilePreview | null): boolean {
  if (!p) return true;
  if (p.is_banned || p.is_suspended) return true;
  return false;
}

/** Build the destination route for a shared post/Scroll using ONLY the
 * stored content id and (when present) content_type. Never uses the DM
 * message id. Exported for tests. */
export function buildSharedContentHref(opts: {
  kind: "post_share" | "profile_share";
  postId?: string | null;
  profileId?: string | null;
  contentType?: string | null;
  videoUrl?: string | null;
  username?: string | null;
}): string | null {
  if (opts.kind === "post_share") {
    if (!opts.postId) return null;
    // /p/:id resolves both post and scroll content types in PostPage.
    return `/p/${opts.postId}`;
  }
  if (opts.kind === "profile_share") {
    if (!opts.username) return null;
    return `/${opts.username}`;
  }
  return null;
}

function safeWarn(scope: string, fields: Record<string, unknown>) {
  // Only safe, non-sensitive fields. No body, no media URLs, no errors objects.
  try {
    // eslint-disable-next-line no-console
    console.warn(`[dm-share] ${scope}`, fields);
  } catch {
    /* noop */
  }
}

const UNAVAILABLE_TEXT = "This content is no longer available.";

export default function SharedPostMessage({ kind, postId, profileId, body, mine, messageId }: SharedRow) {
  const [post, setPost] = useState<PostPreview | null>(null);
  const [profile, setProfile] = useState<ProfilePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);

  // Guard against malformed metadata up-front. Never route to a broken page.
  const metadataMissing =
    (kind === "post_share" && !postId) || (kind === "profile_share" && !profileId);

  useEffect(() => {
    if (metadataMissing) {
      safeWarn("malformed_metadata", {
        message_id: messageId ?? null,
        kind,
        has_post_id: !!postId,
        has_profile_id: !!profileId,
        route_attempted: null,
        error_category: "missing_content_id",
        timestamp: new Date().toISOString(),
      });
      setLoading(false);
      return;
    }
    let cancel = false;
    setLoading(true);
    setFetchFailed(false);
    (async () => {
      try {
        if (kind === "post_share" && postId) {
          const { data, error } = await supabase
            .from("posts")
            .select("id, user_id, image_url, video_url, video_poster_url, media_type, filter, category, content_type, is_removed, is_archived, moderation_status, profile:profiles!posts_user_id_fkey(username, profile_photo_url)")
            .eq("id", postId)
            .maybeSingle();
          if (error) throw error;
          if (!cancel) setPost(data as PostPreview | null);
        } else if (kind === "profile_share" && profileId) {
          const { data, error } = await supabase
            .from("profiles")
            .select("id, username, profile_photo_url, is_banned, is_suspended")
            .eq("id", profileId)
            .maybeSingle();
          if (error) throw error;
          if (!cancel) setProfile(data as ProfilePreview | null);
        }
      } catch (_e) {
        if (!cancel) setFetchFailed(true);
        safeWarn("fetch_failed", {
          message_id: messageId ?? null,
          kind,
          has_post_id: !!postId,
          has_profile_id: !!profileId,
          error_category: "fetch_error",
          timestamp: new Date().toISOString(),
        });
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [kind, postId, profileId, messageId, metadataMissing]);

  const wrapBase = `max-w-[78%] rounded-2xl overflow-hidden border ${
    mine ? "bg-primary/10 border-primary/40" : "bg-muted border-border"
  }`;

  const Unavailable = (
    <div
      data-testid="shared-content-unavailable"
      className={`${wrapBase} px-3 py-3 text-xs text-muted-foreground flex items-center gap-2`}
    >
      <ImageOff size={14} /> {UNAVAILABLE_TEXT}
    </div>
  );

  if (metadataMissing) return Unavailable;

  if (loading) {
    return <div className={`${wrapBase} px-3 py-3 text-xs text-muted-foreground animate-pulse`}>Loading share…</div>;
  }

  if (fetchFailed) return Unavailable;

  if (kind === "post_share") {
    if (isUnavailablePost(post)) return Unavailable;
    const p = post!;
    const isVid = isScroll({ content_type: p.content_type, media_type: p.video_url ? "video" : null });
    const href = buildSharedContentHref({ kind, postId: p.id });
    if (!href) return Unavailable;
    return (
      <Link to={href} data-testid="shared-post-card" data-content-id={p.id} className={`${wrapBase} block w-64`}>
        <div className="aspect-square bg-muted relative">
          {p.image_url ? (
            <PostMedia
              src={p.image_url}
              alt=""
              mediaType="image"
              filter={(p.filter ?? null) as FilterId | null}
              className="w-full h-full object-cover"
            />
          ) : p.video_url ? (
            <PostMedia
              src={p.video_url}
              alt=""
              mediaType="video"
              poster={p.video_poster_url ?? null}
              filter={(p.filter ?? null) as FilterId | null}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImageOff /></div>
          )}
          {isVid && (
            <div className="absolute top-2 right-2 bg-black/55 text-white rounded-full p-1">
              <Play size={12} />
            </div>
          )}
        </div>
        <div className="p-2.5 space-y-0.5">
          <p className="text-xs font-semibold truncate">@{p.profile?.username ?? "creator"}</p>
          {body && <p className="text-[11px] text-muted-foreground line-clamp-2">{body}</p>}
          <p className="text-[10px] uppercase tracking-wider text-primary">
            {isVid ? "Open Scroll →" : "Open post →"}
          </p>
        </div>
      </Link>
    );
  }

  if (isUnavailableProfile(profile)) return Unavailable;
  const pr = profile!;
  const href = buildSharedContentHref({ kind, username: pr.username });
  if (!href) return Unavailable;
  return (
    <Link to={href} data-testid="shared-profile-card" data-content-id={pr.id} className={`${wrapBase} flex items-center gap-3 p-3 w-64`}>
      <div className="size-12 rounded-full bg-muted overflow-hidden shrink-0">
        {pr.profile_photo_url ? (
          <img src={pr.profile_photo_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground"><UserRound size={18} /></div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate">@{pr.username}</p>
        {body && <p className="text-[11px] text-muted-foreground line-clamp-2">{body}</p>}
        <p className="text-[10px] uppercase tracking-wider text-primary mt-0.5">View profile →</p>
      </div>
    </Link>
  );
}
