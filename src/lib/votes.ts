import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { trackUsageEvent } from "@/lib/usageTrack";
import { fxBrokenCrown, fxVote } from "@/lib/giftFx";
import { toFriendlyMessage, logRawError } from "@/lib/settingsSecurityErrors";


export type VoteType = "crown" | "fire" | "diamond" | "dislike";

/**
 * Centralized FX for accepted vote actions. Called once we know the row was
 * accepted (insert/swap path) so muted/blocked/rate-limited votes stay silent.
 * Broken Crown / dislike → cracked-crown thud. Other tiers → premium chime.
 * Throttling lives inside giftFx so rapid taps don't stack.
 */
function playVoteFx(voteType: VoteType) {
  if (voteType === "dislike") fxBrokenCrown();
  else fxVote(voteType);
}

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
  trackUsageEvent("vote_attempted", { postId, metadata: { vote_type: voteType } });
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
      trackUsageEvent("vote_failed", { postId, metadata: { vote_type: voteType, reason: "delete_error" } });
      toast.error(error.message);
      return voteType;
    }
    trackEvent("vote_removed", { postId, metadata: { vote_type: voteType } });
    trackUsageEvent("vote_success", { postId, metadata: { vote_type: voteType, action: "removed" } });
    return null;
  }

  // Different reaction → swap
  if (existing) {
    const { error: delErr } = await supabase.from("votes").delete().eq("id", existing.id);
    if (delErr) {
      trackUsageEvent("vote_failed", { postId, metadata: { vote_type: voteType, reason: "swap_delete_error" } });
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
    trackUsageEvent("vote_failed", { postId, metadata: { vote_type: voteType, reason: /rate limit|too fast/i.test(error.message) ? "rate_limited" : "insert_error" } });
    toast.error(msg);
    return null;
  }
  trackEvent("vote_cast", { postId, metadata: { vote_type: voteType } });
  trackUsageEvent("vote_success", { postId, metadata: { vote_type: voteType, action: existing ? "swapped" : "cast" } });
  playVoteFx(voteType);
  return voteType;
}
