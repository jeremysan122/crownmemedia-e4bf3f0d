// Recipient-discovery helpers for the Send Gift flow.
// All queries respect RLS: profile reads are public-safe, follows/blocks
// are owner-scoped. We additionally filter out banned/suspended/self/blocked
// on the client for snappy UI — the server (private.send_royal_gift) is the
// final authority.
import { supabase } from "@/integrations/supabase/client";

export type GiftRecipientSource = "following" | "followers" | "recent" | "search";

export interface GiftRecipientCandidate {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  verified: boolean;
  source: GiftRecipientSource;
}

interface ProfileRow {
  id: string;
  username: string | null;
  profile_photo_url: string | null;
  verified: boolean | null;
  is_banned: boolean | null;
  is_suspended: boolean | null;
}

function rowToCandidate(row: ProfileRow, source: GiftRecipientSource): GiftRecipientCandidate | null {
  if (!row || !row.id || !row.username) return null;
  if (row.is_banned || row.is_suspended) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.username,
    avatarUrl: row.profile_photo_url,
    verified: !!row.verified,
    source,
  };
}

const PROFILE_FIELDS = "id, username, profile_photo_url, verified, is_banned, is_suspended";

async function blockedIds(viewerId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${viewerId},blocked_id.eq.${viewerId}`);
  const set = new Set<string>();
  ((data as Array<{ blocker_id: string; blocked_id: string }>) || []).forEach((r) => {
    set.add(r.blocker_id === viewerId ? r.blocked_id : r.blocker_id);
  });
  return set;
}

export async function fetchFollowingRecipients(viewerId: string): Promise<GiftRecipientCandidate[]> {
  const [{ data }, blocks] = await Promise.all([
    supabase
      .from("follows")
      .select(`following_id, profile:profiles!follows_following_id_fkey(${PROFILE_FIELDS})`)
      .eq("follower_id", viewerId)
      .order("created_at", { ascending: false })
      .limit(100),
    blockedIds(viewerId),
  ]);
  return ((data as Array<{ following_id: string; profile: ProfileRow | null }>) || [])
    .map((r) => (r.profile ? rowToCandidate(r.profile, "following") : null))
    .filter((c): c is GiftRecipientCandidate => !!c && c.id !== viewerId && !blocks.has(c.id));
}

export async function fetchFollowerRecipients(viewerId: string): Promise<GiftRecipientCandidate[]> {
  const [{ data }, blocks] = await Promise.all([
    supabase
      .from("follows")
      .select(`follower_id, profile:profiles!follows_follower_id_fkey(${PROFILE_FIELDS})`)
      .eq("following_id", viewerId)
      .order("created_at", { ascending: false })
      .limit(100),
    blockedIds(viewerId),
  ]);
  return ((data as Array<{ follower_id: string; profile: ProfileRow | null }>) || [])
    .map((r) => (r.profile ? rowToCandidate(r.profile, "followers") : null))
    .filter((c): c is GiftRecipientCandidate => !!c && c.id !== viewerId && !blocks.has(c.id));
}

/** Recent interactions: people whose posts the viewer recently liked, commented on, or saved. */
export async function fetchRecentInteractionRecipients(viewerId: string): Promise<GiftRecipientCandidate[]> {
  const [votes, comments, bookmarks, blocks] = await Promise.all([
    supabase.from("votes").select("post_id, created_at").eq("user_id", viewerId).order("created_at", { ascending: false }).limit(60),
    supabase.from("comments").select("post_id, created_at").eq("user_id", viewerId).eq("is_removed", false).order("created_at", { ascending: false }).limit(60),
    supabase.from("post_bookmarks" as never).select("post_id, created_at").eq("user_id", viewerId).order("created_at", { ascending: false }).limit(60),
    blockedIds(viewerId),
  ]);
  const ids = new Set<string>();
  ((votes.data as Array<{ post_id: string }>) || []).forEach((r) => ids.add(r.post_id));
  ((comments.data as Array<{ post_id: string }>) || []).forEach((r) => ids.add(r.post_id));
  ((bookmarks.data as Array<{ post_id: string }>) || []).forEach((r) => ids.add(r.post_id));
  if (ids.size === 0) return [];

  const { data: posts } = await supabase
    .from("posts")
    .select(`user_id, created_at, profile:profiles!posts_user_id_fkey(${PROFILE_FIELDS})`)
    .in("id", [...ids])
    .eq("is_removed", false)
    .order("created_at", { ascending: false })
    .limit(60);

  const seen = new Set<string>();
  const out: GiftRecipientCandidate[] = [];
  ((posts as Array<{ user_id: string; profile: ProfileRow | null }>) || []).forEach((row) => {
    if (!row.profile || seen.has(row.user_id) || row.user_id === viewerId || blocks.has(row.user_id)) return;
    const cand = rowToCandidate(row.profile, "recent");
    if (cand) {
      seen.add(row.user_id);
      out.push(cand);
    }
  });
  return out.slice(0, 30);
}

export async function searchRecipients(viewerId: string, query: string): Promise<GiftRecipientCandidate[]> {
  const q = query.trim().toLowerCase().replace(/^@/, "");
  if (q.length < 2) return [];
  const [{ data }, blocks] = await Promise.all([
    supabase
      .from("profiles")
      .select(PROFILE_FIELDS)
      .ilike("username", `${q}%`)
      .neq("id", viewerId)
      .limit(25),
    blockedIds(viewerId),
  ]);
  return ((data as ProfileRow[]) || [])
    .map((r) => rowToCandidate(r, "search"))
    .filter((c): c is GiftRecipientCandidate => !!c && !blocks.has(c.id));
}
