import { describe, it, expect } from "vitest";
import { buildSharedContentHref, isUnavailablePost, isUnavailableProfile } from "@/components/messages/SharedPostMessage";

describe("buildSharedContentHref", () => {
  it("post_share uses content id, not message id", () => {
    expect(buildSharedContentHref({ kind: "post_share", postId: "post-123" })).toBe("/p/post-123");
  });
  it("scroll content (post_share with video) routes through /p/:postId", () => {
    // Scrolls are stored as posts; same /p/:id route resolves them.
    expect(buildSharedContentHref({ kind: "post_share", postId: "scroll-9", contentType: "scroll" }))
      .toBe("/p/scroll-9");
  });
  it("profile_share uses username", () => {
    expect(buildSharedContentHref({ kind: "profile_share", username: "alice" })).toBe("/u/alice");
  });
  it("returns null when post id is missing", () => {
    expect(buildSharedContentHref({ kind: "post_share", postId: null })).toBeNull();
    expect(buildSharedContentHref({ kind: "post_share" })).toBeNull();
  });
  it("returns null when profile username is missing", () => {
    expect(buildSharedContentHref({ kind: "profile_share", username: null })).toBeNull();
  });
  it("never returns a route built from message id", () => {
    // Sanity: no input named messageId is accepted by the contract.
    const href = buildSharedContentHref({ kind: "post_share", postId: "real-id" });
    expect(href).not.toContain("msg-");
  });
});

describe("isUnavailablePost", () => {
  const base = {
    id: "p1", user_id: "u1", image_url: null, video_url: null, category: null,
    content_type: "post", is_removed: false, is_archived: false, moderation_status: "approved",
  };
  it("null → unavailable (RLS / deleted)", () => {
    expect(isUnavailablePost(null)).toBe(true);
  });
  it("removed → unavailable", () => {
    expect(isUnavailablePost({ ...base, is_removed: true })).toBe(true);
  });
  it("archived → unavailable", () => {
    expect(isUnavailablePost({ ...base, is_archived: true })).toBe(true);
  });
  it("moderation removed/rejected/quarantined → unavailable", () => {
    for (const s of ["removed", "rejected", "quarantined"]) {
      expect(isUnavailablePost({ ...base, moderation_status: s })).toBe(true);
    }
  });
  it("approved visible post → available", () => {
    expect(isUnavailablePost(base)).toBe(false);
  });
});

describe("isUnavailableProfile", () => {
  it("null → unavailable", () => {
    expect(isUnavailableProfile(null)).toBe(true);
  });
  it("banned → unavailable", () => {
    expect(isUnavailableProfile({ id: "u", username: "x", profile_photo_url: null, is_banned: true })).toBe(true);
  });
  it("suspended → unavailable", () => {
    expect(isUnavailableProfile({ id: "u", username: "x", profile_photo_url: null, is_suspended: true })).toBe(true);
  });
  it("active → available", () => {
    expect(isUnavailableProfile({ id: "u", username: "x", profile_photo_url: null })).toBe(false);
  });
});
