import { describe, it, expect } from "vitest";
import { getNotificationTarget, isNotificationRoutable } from "../notificationRouting";

describe("getNotificationTarget", () => {
  it("prefers explicit payload.link when it's a safe path", () => {
    expect(getNotificationTarget({ type: "system", payload: { link: "/rewards" } })).toBe("/rewards");
  });
  it("ignores unsafe link values", () => {
    expect(getNotificationTarget({ type: "system", payload: { link: "https://evil.com" } })).toBeNull();
  });
  it("routes dm + dm_share + dm_gift to the thread", () => {
    expect(getNotificationTarget({ type: "dm", payload: { thread_id: "t1" } })).toBe("/messages?thread=t1");
    expect(getNotificationTarget({ type: "dm_share", payload: { thread_id: "t2" } })).toBe("/messages?thread=t2");
    expect(getNotificationTarget({ type: "dm_gift", payload: { sender_id: "u1" } })).toBe("/messages?with=u1");
  });
  it("routes follow notifications to the follower profile", () => {
    expect(getNotificationTarget({ type: "follow", payload: { follower_username: "king" } })).toBe("/king");
  });
  it("routes comments to the post with a comment anchor", () => {
    expect(getNotificationTarget({ type: "comment", payload: { post_id: "p1", comment_id: "c9" } })).toBe("/post/p1#c-c9");
  });
  it("routes battle notifications to the battle", () => {
    expect(getNotificationTarget({ type: "battle_won", payload: { battle_id: "b1" } })).toBe("/battles?b=b1");
  });
  it("returns null for unknown types so callers show an unavailable state", () => {
    expect(getNotificationTarget({ type: "totally_made_up", payload: {} })).toBeNull();
    expect(isNotificationRoutable({ type: "totally_made_up", payload: {} })).toBe(false);
  });
  it("returns null when required metadata is missing", () => {
    expect(getNotificationTarget({ type: "comment", payload: {} })).toBeNull();
    expect(getNotificationTarget({ type: "follow", payload: {} })).toBeNull();
  });
  it("routes system subtypes to their pages", () => {
    expect(getNotificationTarget({ type: "system", payload: { kind: "reward" } })).toBe("/rewards");
    expect(getNotificationTarget({ type: "system", payload: { kind: "verification" } })).toBe("/verification");
    expect(getNotificationTarget({ type: "system", payload: { kind: "payout" } })).toBe("/wallet");
  });
  it("routes streak_reminder system notifications to /rewards (deep link)", () => {
    expect(getNotificationTarget({ type: "system", payload: { kind: "streak_reminder" } })).toBe("/rewards");
    // event-based payload (alternate emitter shape)
    expect(getNotificationTarget({ type: "system", payload: { event: "streak_reminder" } })).toBe("/rewards");
  });
  it("falls back to payload.deeplink when payload.link is missing", () => {
    expect(getNotificationTarget({ type: "system", payload: { deeplink: "/rewards" } })).toBe("/rewards");
  });
});

