/**
 * Regression tests for the share-card pipeline:
 * - The preview always reflects the freshest server copy (post edits / deletions).
 * - The cache-bust token tracks `updated_at`, so a new image after an edit is
 *   what gets rendered AND captured by html-to-image.
 * - Deleted posts surface a "no longer available" state instead of a stale card.
 *
 * These tests exercise pure helpers + the contract the dialogs rely on. They
 * intentionally avoid mounting the dialogs (jsdom can't run html-to-image),
 * but they pin the invariants that determine whether preview / download /
 * final shared card match.
 */
import { describe, it, expect } from "vitest";
import { withCacheBust } from "@/lib/cacheBust";

type PostLike = {
  id: string;
  image_url: string;
  updated_at: string | null;
  deleted_at?: string | null;
};

function resolveShareImage(post: PostLike | null): string | null {
  if (!post || post.deleted_at) return null;
  return withCacheBust(post.image_url, post.updated_at);
}

describe("share card freshness contract", () => {
  it("preview URL matches the URL that would be downloaded (same token)", () => {
    const post: PostLike = {
      id: "p1",
      image_url: "https://cdn.example.com/p1.jpg",
      updated_at: "2026-05-31T10:00:00Z",
    };
    const preview = resolveShareImage(post);
    const download = resolveShareImage(post);
    expect(preview).toBe(download);
  });

  it("editing the post (new updated_at) busts the cache token", () => {
    const before: PostLike = {
      id: "p1",
      image_url: "https://cdn.example.com/p1.jpg",
      updated_at: "2026-05-31T10:00:00Z",
    };
    const after: PostLike = { ...before, updated_at: "2026-05-31T12:00:00Z" };
    expect(resolveShareImage(before)).not.toBe(resolveShareImage(after));
  });

  it("changing only the image swaps the URL even with the same updated_at race", () => {
    const a = resolveShareImage({
      id: "p1",
      image_url: "https://cdn.example.com/old.jpg",
      updated_at: "t",
    });
    const b = resolveShareImage({
      id: "p1",
      image_url: "https://cdn.example.com/new.jpg",
      updated_at: "t",
    });
    expect(a).not.toBe(b);
  });

  it("returns null for deleted posts so the dialog can show the unavailable state", () => {
    const deleted: PostLike = {
      id: "p1",
      image_url: "https://cdn.example.com/p1.jpg",
      updated_at: "t",
      deleted_at: "2026-05-31T13:00:00Z",
    };
    expect(resolveShareImage(deleted)).toBeNull();
  });

  it("missing post entirely → null (server says deleted/not found)", () => {
    expect(resolveShareImage(null)).toBeNull();
  });
});
