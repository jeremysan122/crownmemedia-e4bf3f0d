// Loads the current user's blocked accounts + muted words so the Feed can
// hide content from accounts the user has blocked or posts whose caption
// contains a muted phrase. Both lists are small (< few hundred rows) so we
// cache them in memory and re-fetch only when the user changes.
//
// Returned `ready` flips true once we know whether or not there are filters
// to apply — callers should wait for `ready` before running the first Feed
// query to avoid a flash of soon-to-be-hidden posts.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export interface FeedFilterLists {
  blockedIds: Set<string>;
  mutedWords: string[]; // lowercased, trimmed, non-empty
  ready: boolean;
}

const EMPTY: FeedFilterLists = { blockedIds: new Set(), mutedWords: [], ready: true };

export function useFeedFilters(): FeedFilterLists {
  const { user } = useAuth();
  const [state, setState] = useState<FeedFilterLists>({ blockedIds: new Set(), mutedWords: [], ready: false });

  useEffect(() => {
    if (!user) { setState(EMPTY); return; }
    let cancelled = false;
    (async () => {
      const [{ data: blocks }, { data: words }] = await Promise.all([
        supabase.from("blocks").select("blocked_id").eq("blocker_id", user.id),
        supabase.from("muted_words" as any).select("word").eq("user_id", user.id),
      ]);
      if (cancelled) return;
      const blockedIds = new Set<string>((blocks ?? []).map((b: any) => b.blocked_id).filter(Boolean));
      const mutedWords = ((words as any[] | null) ?? [])
        .map((w) => String(w?.word ?? "").trim().toLowerCase())
        .filter((w) => w.length > 0);
      setState({ blockedIds, mutedWords, ready: true });
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return state;
}

/**
 * True if a post should be HIDDEN by the user's block / mute settings.
 * Pure function — safe to use inside realtime callbacks and memo selectors.
 */
export function isFilteredOut(
  post: { user_id?: string | null; caption?: string | null; hashtags?: string[] | null },
  filters: Pick<FeedFilterLists, "blockedIds" | "mutedWords">,
): boolean {
  if (post.user_id && filters.blockedIds.has(post.user_id)) return true;
  if (filters.mutedWords.length > 0) {
    const hay = `${post.caption ?? ""} ${(post.hashtags ?? []).join(" ")}`.toLowerCase();
    for (const w of filters.mutedWords) {
      if (w && hay.includes(w)) return true;
    }
  }
  return false;
}
