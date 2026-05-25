import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PriorityMentionUser } from "@/components/MentionInput";

interface PostLike {
  id: string;
  user_id: string;
  city: string | null;
  state: string | null;
  profile?: { username: string; profile_photo_url: string | null } | null;
}

/**
 * Returns mention candidates ranked by relevance to the current post:
 * 1. The post author
 * 2. Recent commenters on the same post
 * 3. Users in the same city, then state
 */
export function useMentionParticipants(post: PostLike | null) {
  const [users, setUsers] = useState<PriorityMentionUser[]>([]);

  useEffect(() => {
    if (!post) { setUsers([]); return; }
    let cancelled = false;

    (async () => {
      const list: PriorityMentionUser[] = [];
      const seen = new Set<string>();

      // 1. Author
      if (post.profile && post.user_id) {
        list.push({
          id: post.user_id,
          username: post.profile.username,
          profile_photo_url: post.profile.profile_photo_url ?? null,
          reason: "author",
        });
        seen.add(post.user_id);
      }

      // 2. Recent commenters on this post (last 50 comments)
      const { data: cmts } = await supabase
        .from("comments")
        .select("user_id, profile:profiles!comments_user_id_fkey(username, profile_photo_url)")
        .eq("post_id", post.id)
        .eq("is_removed", false)
        .order("created_at", { ascending: false })
        .limit(50);
      for (const row of (cmts ?? []) as any[]) {
        if (!row.user_id || seen.has(row.user_id) || !row.profile?.username) continue;
        list.push({
          id: row.user_id,
          username: row.profile.username,
          profile_photo_url: row.profile.profile_photo_url ?? null,
          reason: "participant",
        });
        seen.add(row.user_id);
      }

      // 3. Local users — same city first, then state, until we have ~30 candidates.
      const localTarget = 30;
      if (list.length < localTarget && (post.city || post.state)) {
        const need = localTarget - list.length;
        let q = supabase
          .from("profiles")
          .select("id, username, profile_photo_url")
          .limit(need);
        if (post.city) q = q.eq("city", post.city);
        else if (post.state) q = q.eq("state", post.state);
        const { data: locals } = await q;
        for (const u of (locals ?? []) as any[]) {
          if (!u.id || seen.has(u.id)) continue;
          list.push({
            id: u.id,
            username: u.username,
            profile_photo_url: u.profile_photo_url ?? null,
            reason: "local",
          });
          seen.add(u.id);
        }
      }

      if (!cancelled) setUsers(list);
    })();

    return () => { cancelled = true; };
  }, [post?.id, post?.user_id, post?.city, post?.state, post?.profile?.username]);

  return users;
}
