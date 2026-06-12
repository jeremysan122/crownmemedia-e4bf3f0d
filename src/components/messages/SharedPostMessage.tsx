// Renders a shared post or profile card inside a DM thread. Fetches a minimal
// projection (RLS-protected) and shows an "unavailable" state if the target
// has since been removed, hidden, or made unreachable to the viewer.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ImageOff, UserRound, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isScroll } from "@/lib/contentType";

interface SharedRow {
  kind: "post_share" | "profile_share";
  postId?: string | null;
  profileId?: string | null;
  body?: string | null;
  mine: boolean;
}

type PostPreview = {
  id: string;
  user_id: string;
  image_url: string | null;
  video_url: string | null;
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

function isUnavailablePost(p: PostPreview | null): boolean {
  if (!p) return true;
  if (p.is_removed || p.is_archived) return true;
  if (p.moderation_status && ["removed", "rejected", "quarantined"].includes(p.moderation_status)) return true;
  return false;
}
function isUnavailableProfile(p: ProfilePreview | null): boolean {
  if (!p) return true;
  if (p.is_banned || p.is_suspended) return true;
  return false;
}

export default function SharedPostMessage({ kind, postId, profileId, body, mine }: SharedRow) {
  const [post, setPost] = useState<PostPreview | null>(null);
  const [profile, setProfile] = useState<ProfilePreview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    (async () => {
      if (kind === "post_share" && postId) {
        const { data } = await supabase
          .from("posts")
          .select("id, user_id, image_url, video_url, category, content_type, is_removed, is_archived, moderation_status, profile:profiles!posts_user_id_fkey(username, profile_photo_url)")
          .eq("id", postId)
          .maybeSingle();
        if (!cancel) setPost(data as PostPreview | null);
      } else if (kind === "profile_share" && profileId) {
        const { data } = await supabase
          .from("profiles")
          .select("id, username, profile_photo_url, is_banned, is_suspended")
          .eq("id", profileId)
          .maybeSingle();
        if (!cancel) setProfile(data as ProfilePreview | null);
      }
      if (!cancel) setLoading(false);
    })();
    return () => { cancel = true; };
  }, [kind, postId, profileId]);

  const wrapBase = `max-w-[78%] rounded-2xl overflow-hidden border ${
    mine ? "bg-primary/10 border-primary/40" : "bg-muted border-border"
  }`;

  if (loading) {
    return <div className={`${wrapBase} px-3 py-3 text-xs text-muted-foreground animate-pulse`}>Loading share…</div>;
  }

  if (kind === "post_share") {
    if (isUnavailablePost(post)) {
      return (
        <div className={`${wrapBase} px-3 py-3 text-xs text-muted-foreground flex items-center gap-2`}>
          <ImageOff size={14} /> This post is no longer available
        </div>
      );
    }
    const p = post!;
    const isVid = isScroll({ content_type: p.content_type, media_type: p.video_url ? "video" : null });
    return (
      <Link to={`/p/${p.id}`} className={`${wrapBase} block w-64`}>
        <div className="aspect-square bg-muted relative">
          {p.image_url ? (
            <img src={p.image_url} alt="" loading="lazy" className="w-full h-full object-cover" />
          ) : p.video_url ? (
            <video src={p.video_url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
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
          <p className="text-[10px] uppercase tracking-wider text-primary">Open post →</p>
        </div>
      </Link>
    );
  }

  if (isUnavailableProfile(profile)) {
    return (
      <div className={`${wrapBase} px-3 py-3 text-xs text-muted-foreground flex items-center gap-2`}>
        <UserRound size={14} /> This profile is no longer available
      </div>
    );
  }
  const pr = profile!;
  return (
    <Link to={`/u/${pr.username}`} className={`${wrapBase} flex items-center gap-3 p-3 w-64`}>
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
