import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";

export type VoteType = "crown" | "fire" | "diamond" | "dislike";

/**
 * Enforces "one reaction per user per post". Selecting a different reaction
 * type replaces the old one; selecting the same one toggles it off.
 * Returns the active reaction after the call (null if cleared).
 */
export async function toggleVote(
  postId: string,
  userId: string,
  voteType: VoteType
): Promise<VoteType | null> {
  const { data: existing } = await supabase
    .from("votes")
    .select("id, vote_type")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .maybeSingle();

  // Same reaction → toggle off
  if (existing && existing.vote_type === voteType) {
    const { error } = await supabase.from("votes").delete().eq("id", existing.id);
    if (error) {
      toast.error(error.message);
      return voteType;
    }
    trackEvent("vote_removed", { postId, metadata: { vote_type: voteType } });
    return null;
  }

  // Different reaction → swap
  if (existing) {
    const { error: delErr } = await supabase.from("votes").delete().eq("id", existing.id);
    if (delErr) {
      toast.error(delErr.message);
      return existing.vote_type as VoteType;
    }
  }

  const { error } = await supabase.from("votes").insert({
    post_id: postId,
    user_id: userId,
    vote_type: voteType,
  });
  if (error) {
    const msg = /rate limit|too fast/i.test(error.message)
      ? "You're reacting too fast — slow down a moment"
      : error.message;
    toast.error(msg);
    return null;
  }
  trackEvent("vote_cast", { postId, metadata: { vote_type: voteType } });
  return voteType;
}
