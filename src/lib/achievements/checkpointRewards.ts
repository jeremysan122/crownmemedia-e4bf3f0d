// Pure mirror of grant_achievement_checkpoint_rewards() eligibility so tests
// can validate the checkpoint fan-out logic without hitting the database.

export type CheckpointRewardType =
  | "badge"
  | "title"
  | "frame_preview"
  | "frame_permanent";

export interface CheckpointReward {
  checkpoint: 25 | 50 | 75 | 100;
  reward_type: CheckpointRewardType;
  reward_id?: string | null;
  metadata?: Record<string, unknown>;
}

/** Returns the subset of rewards that should be granted at the given reached checkpoint. */
export function selectRewardsForCheckpoint(
  rewards: CheckpointReward[],
  reachedCheckpoint: number,
): CheckpointReward[] {
  if (reachedCheckpoint < 25) return [];
  return rewards.filter((r) => r.checkpoint <= reachedCheckpoint);
}

/** Frame preview at 75% is a 7-day grant; frame_permanent at 100% never expires. */
export function frameExpiryForReward(
  reward: CheckpointReward,
  now: Date = new Date(),
): Date | null {
  if (reward.reward_type === "frame_preview") {
    return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  return null;
}

/** True when a granted frame ownership row is currently active for equipping. */
export function isFrameOwnershipActive(row: {
  is_revoked: boolean;
  expires_at: string | null;
}): boolean {
  if (row.is_revoked) return false;
  if (!row.expires_at) return true;
  return new Date(row.expires_at).getTime() > Date.now();
}
