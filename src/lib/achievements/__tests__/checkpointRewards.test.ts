import { describe, it, expect } from "vitest";
import {
  selectRewardsForCheckpoint,
  frameExpiryForReward,
  isFrameOwnershipActive,
  type CheckpointReward,
} from "../checkpointRewards";

const REWARDS: CheckpointReward[] = [
  { checkpoint: 25, reward_type: "badge" },
  { checkpoint: 50, reward_type: "title" },
  { checkpoint: 75, reward_type: "frame_preview" },
  { checkpoint: 100, reward_type: "frame_permanent" },
];

describe("selectRewardsForCheckpoint", () => {
  it("returns nothing below 25%", () => {
    expect(selectRewardsForCheckpoint(REWARDS, 0)).toEqual([]);
    expect(selectRewardsForCheckpoint(REWARDS, 24)).toEqual([]);
  });
  it("returns cumulative rewards up to the reached checkpoint", () => {
    expect(selectRewardsForCheckpoint(REWARDS, 25).map((r) => r.checkpoint)).toEqual([25]);
    expect(selectRewardsForCheckpoint(REWARDS, 50).map((r) => r.checkpoint)).toEqual([25, 50]);
    expect(selectRewardsForCheckpoint(REWARDS, 75).map((r) => r.checkpoint)).toEqual([25, 50, 75]);
    expect(selectRewardsForCheckpoint(REWARDS, 100).map((r) => r.checkpoint)).toEqual([25, 50, 75, 100]);
  });
});

describe("frameExpiryForReward", () => {
  it("gives a 7-day expiry for preview grants", () => {
    const now = new Date("2026-07-13T00:00:00Z");
    const exp = frameExpiryForReward({ checkpoint: 75, reward_type: "frame_preview" }, now);
    expect(exp).toBeInstanceOf(Date);
    expect(exp!.getTime() - now.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
  it("returns null for permanent and non-frame rewards", () => {
    expect(frameExpiryForReward({ checkpoint: 100, reward_type: "frame_permanent" })).toBeNull();
    expect(frameExpiryForReward({ checkpoint: 25, reward_type: "badge" })).toBeNull();
  });
});

describe("isFrameOwnershipActive", () => {
  it("is inactive when revoked", () => {
    expect(isFrameOwnershipActive({ is_revoked: true, expires_at: null })).toBe(false);
  });
  it("is active when no expiry", () => {
    expect(isFrameOwnershipActive({ is_revoked: false, expires_at: null })).toBe(true);
  });
  it("respects expires_at", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isFrameOwnershipActive({ is_revoked: false, expires_at: future })).toBe(true);
    expect(isFrameOwnershipActive({ is_revoked: false, expires_at: past })).toBe(false);
  });
});
