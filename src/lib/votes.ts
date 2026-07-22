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

/** Duplicate-key SQLSTATE — the vote row already exists (double-tap race). */
const DUPLICATE_KEY = "23505";

// Rapid taps on the crown used to fire overlapping toggle calls: both read
// "no existing vote", both INSERT, and the loser surfaced a scary duplicate-
// key error toast. Serialize per (post, user) so each tap sees the row state
// the previous tap left behind.
const inflight = new Map<string, Promise<VoteType | null>>();

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
  const key = `${postId}:${userId}`;
  const prev = inflight.get(key);
  if (prev) await prev.catch(() => { /* previous tap's failure is its own */ });
  const run = doToggleVote(postId, userId, voteType);
  inflight.set(key, run);
  try {
    return await run;
  } finally {
    if (inflight.get(key) === run) inflight.delete(key);
  }
}

async function doToggleVote(
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
    .limit(1)
    .maybeSingle();

  // Same reaction → toggle off
  if (existing && existing.vote_type === voteType) {
    const { error } = await supabase.from("votes").delete().eq("id", existing.id);
    if (error) {
      trackUsageEvent("vote_failed", { postId, metadata: { vote_type: voteType, reason: "delete_error" } });
      logRawError(error, "generic", { op: "vote_delete" });
      toast.error(toFriendlyMessage(error, "generic"));
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
      logRawError(delErr, "generic", { op: "vote_swap_delete" });
      toast.error(toFriendlyMessage(delErr, "generic"));
      return existing.vote_type as VoteType;
    }
  }

  let { error } = await supabase.from("votes").insert({
    post_id: postId,
    user_id: userId,
    vote_type: voteType,
  });

  // Duplicate key: a vote row already exists (e.g. a race with another tab or
  // a tap that landed before this one). Reconcile instead of erroring: if the
  // existing reaction already matches, we're done; otherwise swap it.
  if (error && (error.code === DUPLICATE_KEY || /duplicate key/i.test(error.message ?? ""))) {
    const { data: current } = await supabase
      .from("votes")
      .select("id, vote_type")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (current?.vote_type === voteType) {
      trackUsageEvent("vote_success", { postId, metadata: { vote_type: voteType, action: "already_cast" } });
      playVoteFx(voteType);
      return voteType;
    }
    if (current) {
      await supabase.from("votes").delete().eq("id", current.id);
    }
    ({ error } = await supabase.from("votes").insert({
      post_id: postId,
      user_id: userId,
      vote_type: voteType,
    }));
  }

  if (error) {
    const rateLimited = /rate limit|too fast/i.test(error.message ?? "");
    const msg = rateLimited
      ? "You're reacting too fast — slow down a moment"
      : toFriendlyMessage(error, "generic");
    trackUsageEvent("vote_failed", { postId, metadata: { vote_type: voteType, reason: rateLimited ? "rate_limited" : "insert_error" } });
    if (!rateLimited) logRawError(error, "generic", { op: "vote_insert" });
    toast.error(msg);
    return null;
  }

  trackEvent("vote_cast", { postId, metadata: { vote_type: voteType } });
  trackUsageEvent("vote_success", { postId, metadata: { vote_type: voteType, action: existing ? "swapped" : "cast" } });
  playVoteFx(voteType);
  return voteType;
}
