import { describe, it, expect } from "vitest";
import { postMediaFrameClass, POST_MEDIA_FIT_CLASS } from "../postMediaFrame";

describe("postMediaFrameClass", () => {
  it("defaults to aspect-square for photos", () => {
    expect(postMediaFrameClass({ media_type: "image" })).toBe("aspect-square");
    expect(postMediaFrameClass(null)).toBe("aspect-square");
    expect(postMediaFrameClass(undefined)).toBe("aspect-square");
  });

  it("uses 9:16 for video / scroll content", () => {
    expect(postMediaFrameClass({ media_type: "video" })).toBe("aspect-[9/16]");
    expect(postMediaFrameClass({ content_type: "scroll" })).toBe("aspect-[9/16]");
  });

  it("honours explicit aspect_ratio metadata when persisted", () => {
    expect(postMediaFrameClass({ aspect_ratio: "1:1" })).toBe("aspect-square");
    expect(postMediaFrameClass({ aspect_ratio: "4:5" })).toBe("aspect-[4/5]");
    expect(postMediaFrameClass({ aspect_ratio: "1.91:1" })).toBe("aspect-[191/100]");
    expect(postMediaFrameClass({ aspect_ratio: "9:16" })).toBe("aspect-[9/16]");
  });

  it("explicit aspect_ratio overrides media_type fallback", () => {
    expect(
      postMediaFrameClass({ media_type: "video", aspect_ratio: "1:1" }),
    ).toBe("aspect-square");
  });

  it("reposts: callers pass the parent post → frame matches the original", () => {
    const original = { media_type: "video" as const };
    const repostShell = { media_type: "image" as const, aspect_ratio: null };
    // Surfaces resolve `isRepost ? post.parent : post` BEFORE calling — verify
    // the helper takes the parent's framing not the repost shell's.
    expect(postMediaFrameClass(original)).toBe("aspect-[9/16]");
    expect(postMediaFrameClass(repostShell)).toBe("aspect-square");
  });

  it("exports a single canonical object-fit class", () => {
    // Surfaces must not flip object-fit between breakpoints.
    expect(POST_MEDIA_FIT_CLASS).toBe("object-cover");
  });
});
