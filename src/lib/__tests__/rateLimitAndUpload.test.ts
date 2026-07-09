import { describe, it, expect } from "vitest";
import {
  isRateLimitError,
  rateLimitAction,
  RATE_LIMIT_FRIENDLY_MESSAGE,
} from "@/lib/rateLimit";
import { validateUpload, UPLOAD_RULES } from "@/lib/uploadValidation";

describe("rateLimit", () => {
  it("detects rate-limit errors via hint", () => {
    const err = { code: "P0001", message: RATE_LIMIT_FRIENDLY_MESSAGE, hint: "rate_limit:vote_hour" };
    expect(isRateLimitError(err)).toBe(true);
    expect(rateLimitAction(err)).toBe("vote_hour");
  });

  it("detects rate-limit errors via message text fallback", () => {
    expect(isRateLimitError({ message: "You're doing that too fast. Try again soon." })).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isRateLimitError({ message: "permission denied for table posts" })).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
    expect(rateLimitAction({ message: "nope" })).toBeNull();
  });

  it("friendly message never leaks backend details", () => {
    expect(RATE_LIMIT_FRIENDLY_MESSAGE).not.toMatch(/postgres|supabase|sql|rls|jwt/i);
  });
});

describe("validateUpload", () => {
  const mk = (size: number, type: string) => ({ size, type, name: "x" }) as File;

  it("accepts avatar within limits", () => {
    const r = validateUpload(mk(1_000_000, "image/jpeg"), "avatar");
    expect(r.ok).toBe(true);
  });

  it("rejects oversized avatar with friendly copy", () => {
    const r = validateUpload(mk(10 * 1024 * 1024, "image/jpeg"), "avatar");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/too large/i);
    expect(r.message).toMatch(/5 MB/);
  });

  it("rejects unsupported mime on posts", () => {
    const r = validateUpload(mk(1000, "image/gif"), "post_image");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Unsupported/);
  });

  it("accepts mp4 video under 200MB", () => {
    const r = validateUpload(mk(100 * 1024 * 1024, "video/mp4"), "post_video");
    expect(r.ok).toBe(true);
  });

  it("rejects empty file", () => {
    const r = validateUpload(mk(0, "image/png"), "banner");
    expect(r.ok).toBe(false);
  });

  it("preset table matches Batch A storage spec", () => {
    expect(UPLOAD_RULES.avatar.maxBytes).toBe(5 * 1024 * 1024);
    expect(UPLOAD_RULES.banner.maxBytes).toBe(5 * 1024 * 1024);
    expect(UPLOAD_RULES.share_card.maxBytes).toBe(5 * 1024 * 1024);
    expect(UPLOAD_RULES.post_video.maxBytes).toBe(200 * 1024 * 1024);
    expect(UPLOAD_RULES.dm_attachment.maxBytes).toBe(25 * 1024 * 1024);
    expect(UPLOAD_RULES.verification_doc.maxBytes).toBe(25 * 1024 * 1024);
    expect(UPLOAD_RULES.verification_doc.mimeTypes).toContain("application/pdf");
  });
});
