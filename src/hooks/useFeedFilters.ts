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

export type SensitiveMode = "blur" | "show" | "hide";

export interface FeedFilterLists {
  blockedIds: Set<string>;
  mutedWords: string[]; // lowercased, trimmed, non-empty
  sensitiveMode: SensitiveMode;
  ready: boolean;
}

const EMPTY: FeedFilterLists = { blockedIds: new Set(), mutedWords: [], sensitiveMode: "blur", ready: true };

export function useFeedFilters(): FeedFilterLists {
  const { user, profile } = useAuth();
  const [state, setState] = useState<FeedFilterLists>({ blockedIds: new Set(), mutedWords: [], sensitiveMode: "blur", ready: false });

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
      const sensitiveMode = (((profile as any)?.sensitive_content_mode as SensitiveMode) || "blur");
      setState({ blockedIds, mutedWords, sensitiveMode, ready: true });
    })();
    return () => { cancelled = true; };
  }, [user?.id, (profile as any)?.sensitive_content_mode]);

  return state;
}

/**
 * True if a post should be HIDDEN by the user's block / mute / sensitive settings.
 */
export function isFilteredOut(
  post: { user_id?: string | null; caption?: string | null; hashtags?: string[] | null; is_sensitive?: boolean | null },
  filters: { blockedIds: Set<string>; mutedWords: string[]; sensitiveMode?: SensitiveMode },
): boolean {
  if (post.user_id && filters.blockedIds.has(post.user_id)) return true;
  if ((filters.sensitiveMode ?? "blur") === "hide" && post.is_sensitive) return true;
  if (filters.mutedWords.length > 0) {
    const hay = `${post.caption ?? ""} ${(post.hashtags ?? []).join(" ")}`.toLowerCase();
    for (const w of filters.mutedWords) {
      if (w && hay.includes(w)) return true;
    }
  }
  return false;
}
