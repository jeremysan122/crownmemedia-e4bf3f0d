// Wave 7 — pure helper that decides why (if at all) a live-battle comment
// row should be hidden for the current viewer. Extracted from
// LiveBattleComments so the mapping is unit-testable without spinning up
// the virtualized chat + Auth + Supabase stack.
import { bodyMatchesKeyword } from "@/lib/battleModeration";

export type HiddenReason = "" | "moderator" | "keyword" | "blocked" | "muted-word";

export interface CommentLike {
  user_id: string;
  body: string;
  hidden_at?: string | null;
}

export interface SafetyLike {
  isBlocked: (id: string | null | undefined) => boolean;
  matchesMutedWord: (body: string | null | undefined) => boolean;
}

export function commentHiddenReason(
  row: CommentLike,
  safety: SafetyLike,
  keywordFilters: string[],
): HiddenReason {
  if (row.hidden_at) return "moderator";
  if (bodyMatchesKeyword(row.body, keywordFilters)) return "keyword";
  if (safety.isBlocked(row.user_id)) return "blocked";
  if (safety.matchesMutedWord(row.body)) return "muted-word";
  return "";
}
