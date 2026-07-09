import { supabase } from "@/integrations/supabase/client";

export type RecentGiftTargetSource = "saved" | "liked" | "viewed" | "commented";

export type RecentGiftTarget = {
  id: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  caption: string;
  imageUrl: string;
  mediaType: "image" | "video" | null;
  videoPosterUrl: string | null;
  isSensitive: boolean;
  sensitiveReason: string | null;
  source: RecentGiftTargetSource;
  at: number;
};

type StoredRecent = { id: string; source: RecentGiftTargetSource; at: number };

const STORAGE_KEY = "crownme:gift-targets:v1";
const MAX_STORED = 60;

function readStored(): StoredRecent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is StoredRecent => !!r?.id && typeof r.at === "number")
      .slice(0, MAX_STORED);
  } catch {
    return [];
  }
}

function writeStored(rows: StoredRecent[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, MAX_STORED)));
  } catch {
    /* noop */
  }
}

export function rememberGiftTarget(postId: string | null | undefined, source: RecentGiftTargetSource = "viewed") {
  if (!postId) return;
  const next = [{ id: postId, source, at: Date.now() }, ...readStored().filter((r) => r.id !== postId)];
  writeStored(next);
}

export function rememberPostAsGiftTarget(post: { id?: string | null } | null | undefined, source: RecentGiftTargetSource = "viewed") {
  rememberGiftTarget(post?.id, source);
}

export async function fetchRecentGiftTargets(userId?: string | null): Promise<RecentGiftTarget[]> {
  const merged = new Map<string, StoredRecent>();
  const add = (id: string | null | undefined, source: RecentGiftTargetSource, at: string | number | null | undefined) => {
    if (!id) return;
    const time = typeof at === "number" ? at : at ? new Date(at).getTime() : Date.now();
    const existing = merged.get(id);
    if (!existing || time > existing.at) merged.set(id, { id, source, at: Number.isFinite(time) ? time : Date.now() });
  };

  readStored().forEach((r) => add(r.id, r.source || "viewed", r.at));

  if (userId) {
    const [{ data: bookmarks }, { data: votes }, { data: comments }] = await Promise.all([
      supabase
        .from("post_bookmarks" as any)
        .select("post_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(24),
      supabase
        .from("votes")
        .select("post_id, created_at, vote_type")
        .eq("user_id", userId)
        .in("vote_type", ["crown", "fire", "diamond"])
        .order("created_at", { ascending: false })
        .limit(36),
      supabase
        .from("comments")
        .select("post_id, created_at")
        .eq("user_id", userId)
        .eq("is_removed", false)
        .order("created_at", { ascending: false })
        .limit(24),
    ]);

    ((bookmarks as any[]) || []).forEach((r) => add(r.post_id, "saved", r.created_at));
    ((votes as any[]) || []).forEach((r) => add(r.post_id, "liked", r.created_at));
    ((comments as any[]) || []).forEach((r) => add(r.post_id, "commented", r.created_at));
  }

  const ordered = [...merged.values()].sort((a, b) => b.at - a.at).slice(0, 60);
  const ids = ordered.map((r) => r.id);
  if (!ids.length) return [];

  const { data } = await supabase
    .from("posts")
    .select("id, user_id, image_url, caption, media_type, video_poster_url, is_sensitive, profile:profiles!posts_user_id_fkey(username, profile_photo_url)")
    .in("id", ids)
    .eq("is_removed", false)
    .limit(60);

  const byId = new Map(((data as any[]) || []).map((row) => [row.id as string, row]));
  return ordered
    .map((entry) => {
      const row = byId.get(entry.id);
      if (!row) return null;
      return {
        id: row.id,
        userId: row.user_id,
        username: row.profile?.username ?? "creator",
        avatarUrl: row.profile?.profile_photo_url ?? null,
        caption: row.caption ?? "",
        imageUrl: row.image_url,
        mediaType: row.media_type ?? null,
        videoPosterUrl: row.video_poster_url ?? null,
        isSensitive: !!row.is_sensitive,
        sensitiveReason: row.sensitive_reason ?? null,
        source: entry.source,
        at: entry.at,
      } satisfies RecentGiftTarget;
    })
    .filter((row): row is RecentGiftTarget => !!row)
    .slice(0, 24);
}