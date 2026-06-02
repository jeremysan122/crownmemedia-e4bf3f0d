/**
 * Regression tests for the share-card pipeline. All share surfaces must go
 * through `resolvePostShareImage` / `isPostDeleted` from `@/lib/postShare`.
 *
 * Invariants pinned here:
 *  - Preview URL == download URL == native share URL (same cache-bust token).
 *  - Editing a post (new edited_at) busts the token; the URL changes.
 *  - "Deleted" state is ONLY set on a confirmed missing row or is_removed=true,
 *    never on transient errors / null image fields / image load failures.
 *  - The cache-bust token is deterministic (edited_at → created_at), never
 *    Date.now(), so visual regression diffs remain stable.
 */
import { describe, it, expect } from "vitest";
import {
  resolvePostShareImage,
  getPostShareVersion,
  isPostDeleted,
  type PostShareLike,
} from "@/lib/postShare";

const basePost: PostShareLike = {
  id: "p1",
  image_url: "https://cdn.example.com/p1.jpg",
  edited_at: null,
  created_at: "2026-05-31T10:00:00Z",
  is_removed: false,
};

describe("share card freshness contract", () => {
  it("preview URL matches download URL (same deterministic token)", () => {
    expect(resolvePostShareImage(basePost)).toBe(resolvePostShareImage(basePost));
  });

  it("editing the post (new edited_at) busts the cache token", () => {
    const before = { ...basePost, edited_at: "2026-05-31T10:00:00Z" };
    const after = { ...before, edited_at: "2026-05-31T12:00:00Z" };
    expect(resolvePostShareImage(before)).not.toBe(resolvePostShareImage(after));
  });

  it("changing only the image swaps the URL", () => {
    const a = resolvePostShareImage({ ...basePost, image_url: "https://cdn.example.com/old.jpg" });
    const b = resolvePostShareImage({ ...basePost, image_url: "https://cdn.example.com/new.jpg" });
    expect(a).not.toBe(b);
  });

  it("returns null for is_removed posts so dialog shows unavailable state", () => {
    expect(resolvePostShareImage({ ...basePost, is_removed: true })).toBeNull();
  });

  it("returns null when post itself is missing", () => {
    expect(resolvePostShareImage(null)).toBeNull();
  });

  it("uses video poster for video posts instead of image_url", () => {
    const url = resolvePostShareImage({
      ...basePost,
      media_type: "video",
      image_url: "https://cdn.example.com/fallback.jpg",
      video_poster_url: "https://cdn.example.com/poster.jpg",
    });
    expect(url).toContain("poster.jpg");
  });

  it("cache-bust token is NOT Date.now() when edited_at/created_at exist", () => {
    const v = getPostShareVersion(basePost);
    expect(v).toBe("2026-05-31T10:00:00Z");
    expect(String(v)).not.toMatch(/^\d{13,}$/);
  });

  it("isPostDeleted is false for unknown (null) post — unknown != deleted", () => {
    expect(isPostDeleted(null)).toBe(false);
  });

  it("isPostDeleted is true only on confirmed row-missing or is_removed", () => {
    expect(isPostDeleted(basePost)).toBe(false);
    expect(isPostDeleted({ ...basePost, is_removed: true })).toBe(true);
    expect(isPostDeleted(null, { rowMissing: true })).toBe(true);
  });
});

describe("share card sensitive-content protection", () => {
  const sensitive: PostShareLike = { ...basePost, is_sensitive: true };
  const viewerBlur = { userId: "u-viewer", mode: "blur" as const, ageConfirmed: true };
  const viewerShow = { userId: "u-viewer", mode: "show" as const, ageConfirmed: true };
  const viewerHide = { userId: "u-viewer", mode: "hide" as const, ageConfirmed: true };
  const viewerUnconfirmed = { userId: "u-viewer", mode: "show" as const, ageConfirmed: false };
  const author = { userId: "u-author", mode: "blur" as const, ageConfirmed: true };

  it("returns null for sensitive posts when viewer pref is blur", () => {
    expect(resolvePostShareImage(sensitive, viewerBlur)).toBeNull();
  });
  it("returns null for sensitive posts when viewer pref is hide", () => {
    expect(resolvePostShareImage(sensitive, viewerHide)).toBeNull();
  });
  it("returns the image for sensitive posts when viewer pref is show and confirmed", () => {
    expect(resolvePostShareImage(sensitive, viewerShow)).not.toBeNull();
  });
  it("returns null when viewer chose show but eligibility is unconfirmed", () => {
    expect(resolvePostShareImage(sensitive, viewerUnconfirmed)).toBeNull();
  });
  it("returns the image for the author on their own sensitive post", () => {
    const ownPost = { ...sensitive, user_id: "u-author" };
    expect(resolvePostShareImage(ownPost, author)).not.toBeNull();
  });
  it("never exposes media for removed posts regardless of sensitivity / viewer", () => {
    const removed = { ...sensitive, is_removed: true };
    expect(resolvePostShareImage(removed, viewerShow)).toBeNull();
  });
  it("share token differs when is_sensitive flips, so cached cards invalidate", () => {
    const before = getPostShareVersion(basePost);
    const after = getPostShareVersion({ ...basePost, is_sensitive: true });
    expect(before).not.toBe(after);
  });
});
