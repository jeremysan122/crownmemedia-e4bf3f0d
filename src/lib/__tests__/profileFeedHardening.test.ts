/**
 * Contract tests for the Profile / Feed / PostDetail hardening pass.
 * These are static-source contracts: they read the actual files and
 * assert that the hardening invariants remain in place. This guards
 * against silent regressions where a future refactor drops a filter,
 * re-exposes a restricted column, or points a repost interaction at
 * the wrong post.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("Profile hardening", () => {
  const src = read("src/pages/Profile.tsx");

  it("does not expose is_suspended in public profile client select", () => {
    expect(src).not.toMatch(/is_suspended/);
  });

  it("filters archived posts out of Profile posts query", () => {
    expect(src).toMatch(/\.eq\("is_archived", false\)/);
  });

  it("hydrates repost parents on Profile load", () => {
    expect(src).toMatch(/hydrateParents\s*\(/);
  });
});

describe("PostDetailDialog repost attribution", () => {
  const src = read("src/components/PostDetailDialog.tsx");

  it("routes mute state to interactionPostId (original thread)", () => {
    expect(src).toMatch(/useThreadMute\(interactionPostId\)/);
  });

  it("ShareDialog receives displayPost, not the repost shell", () => {
    expect(src).toMatch(/<ShareDialog[^>]*post=\{displayPost/);
  });

  it("RepostDialog reposts the original (displayPost)", () => {
    expect(src).toMatch(/<RepostDialog[^>]*parent=\{displayPost/);
  });

  it("GiftPanel recipient uses the original author, postId uses interactionPostId", () => {
    expect(src).toMatch(/id:\s*displayPost\.user_id/);
    expect(src).toMatch(/username:\s*displayProfile\?\.username/);
    expect(src).toMatch(/postId=\{interactionPostId\s*\?\?\s*displayPost\.id\}/);
  });

  it("Repost button is hidden when viewer authored the DISPLAYED (original) post", () => {
    expect(src).toMatch(/displayPost\.user_id\s*!==\s*user\.id/);
  });

  it("RankHistoryTimeline uses displayPost category context", () => {
    expect(src).toMatch(/category=\{displayPost\.category\}/);
  });
});

describe("Feed realtime hardening", () => {
  const src = read("src/pages/Feed.tsx");

  it("Feed query filters archived posts", () => {
    expect(src).toMatch(/\.eq\("is_archived", false\)/);
  });

  it("matchesCurrentFilters rejects archived / non-post rows", () => {
    expect(src).toMatch(/is_archived/);
    expect(src).toMatch(/content_type\s*!==\s*"post"/);
  });

  it("realtime UPDATE syncs parent metadata for reposts", () => {
    expect(src).toMatch(/parent_post_id\s*===\s*n\.id/);
  });

  it("realtime DELETE nulls parent for repost rows", () => {
    expect(src).toMatch(/parent_post_id\s*===\s*o\.id/);
  });
});

describe("Canonical post select", () => {
  const src = read("src/lib/postQuery.ts");

  it("exposes public-safe display fields on POST_SELECT", () => {
    expect(src).toMatch(/main_category_slug/);
    expect(src).toMatch(/subcategory_slug/);
    expect(src).toMatch(/hashtags/);
    expect(src).toMatch(/aspect_ratio/);
  });

  it("does not select restricted moderation columns", () => {
    for (const field of [
      "submission_key",
      "client_request_id",
      "moderation_notes",
      "moderated_by",
      "moderated_at",
    ]) {
      expect(src).not.toMatch(new RegExp(field));
    }
  });
});
