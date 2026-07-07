// Shared square post preview tile used by Discover / CategoryHub /
// Leaderboard / Crown Map previews. Guarantees the same media source,
// frame, filter and object-fit as PostCard / PostDetail so an edited post
// looks identical across every surface.
import { Link } from "react-router-dom";
import { Crown } from "lucide-react";
import PostMedia from "@/components/PostMedia";
import { postMediaFrameClass, POST_MEDIA_FIT_CLASS } from "@/lib/postMediaFrame";
import type { FilterId } from "@/lib/filters";

export interface PreviewPost {
  id: string;
  user_id?: string | null;
  image_url?: string | null;
  image_urls?: string[] | null;
  video_poster_url?: string | null;
  media_type?: string | null;
  content_type?: string | null;
  aspect_ratio?: string | null;
  filter?: string | null;
  caption?: string | null;
  crown_score?: number | null;
  hashtags?: string[] | null;
  is_sensitive?: boolean | null;
  profile?: { username: string | null; profile_photo_url: string | null } | null;
}

/**
 * Resolve the cover source in the exact same order the Feed / Profile use so
 * an edited post's new cover shows on every surface.
 */
export function previewCoverSrc(p: PreviewPost): string | null {
  if (p.image_urls && p.image_urls.length > 0) return p.image_urls[0];
  if (p.image_url) return p.image_url;
  if (p.video_poster_url) return p.video_poster_url;
  return null;
}

interface Props {
  post: PreviewPost;
  /** Force a square frame regardless of media_type (for grid layouts). */
  square?: boolean;
  /** Small badge in the top-left (rank number, etc). */
  badge?: React.ReactNode;
  className?: string;
  to?: string;
}

export default function PostPreviewTile({
  post, square = true, badge, className = "", to,
}: Props) {
  const cover = previewCoverSrc(post);
  const isVideo = post.media_type === "video" || post.content_type === "scroll";
  // Grid tiles are square by default so cards line up; PostDetail / Feed keep
  // their natural frame via postMediaFrameClass(post).
  const frame = square ? "aspect-square" : postMediaFrameClass(post);
  const href = to ?? `/post/${post.id}`;

  return (
    <Link
      to={href}
      className={`relative ${frame} rounded-xl overflow-hidden bg-muted group block ${className}`}
      aria-label={post.caption ?? `Post by @${post.profile?.username ?? "user"}`}
    >
      {cover ? (
        <PostMedia
          src={cover}
          alt={post.caption ?? ""}
          // Preview always renders the poster/cover as an image — playing a
          // video inside a small grid tile would be noisy and janky.
          mediaType="image"
          filter={(post.filter as FilterId | null) ?? null}
          className={`w-full h-full ${POST_MEDIA_FIT_CLASS} group-hover:scale-[1.03] transition-transform duration-300`}
        />
      ) : (
        <div className="w-full h-full bg-secondary/40" />
      )}
      {isVideo && (
        <div className="absolute top-2 right-2 text-[10px] font-bold bg-black/60 text-white px-1.5 py-0.5 rounded-full backdrop-blur">
          ▶︎
        </div>
      )}
      {badge}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-2 flex items-end justify-between text-white">
        <span className="text-[10px] font-bold truncate">
          @{post.profile?.username ?? "unknown"}
        </span>
        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-black/40 px-1.5 py-0.5 rounded-full">
          <Crown size={9} fill="currentColor" className="text-gold" />
          {post.crown_score ?? 0}
        </span>
      </div>
    </Link>
  );
}
