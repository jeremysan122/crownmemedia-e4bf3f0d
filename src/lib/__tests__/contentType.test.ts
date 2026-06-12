import { describe, it, expect } from "vitest";
import {
  effectiveContentType,
  filterByContentType,
  isPost,
  isScroll,
  allowedUploadModes,
  aspectGuide,
  validateUploadSelection,
  POST_GUIDE,
  SCROLL_GUIDE,
} from "@/lib/contentType";

describe("effectiveContentType", () => {
  it("treats explicit content_type='post' as a post", () => {
    expect(effectiveContentType({ content_type: "post", media_type: "video" })).toBe("post");
  });
  it("treats explicit content_type='scroll' as a scroll", () => {
    expect(effectiveContentType({ content_type: "scroll", media_type: "image" })).toBe("scroll");
  });
  it("falls back to media_type=video → scroll when content_type is missing (legacy rows)", () => {
    expect(effectiveContentType({ media_type: "video" })).toBe("scroll");
    expect(effectiveContentType({ media_type: "image" })).toBe("post");
  });
  it("unknown content_type values collapse to 'post' (never lose a legacy row)", () => {
    expect(effectiveContentType({ content_type: "weird" })).toBe("post");
    expect(effectiveContentType({})).toBe("post");
  });
  it("isPost / isScroll are mutually exclusive", () => {
    const a = { content_type: "post" };
    const b = { content_type: "scroll" };
    expect(isPost(a) && !isScroll(a)).toBe(true);
    expect(isScroll(b) && !isPost(b)).toBe(true);
  });
});

describe("filterByContentType", () => {
  const rows = [
    { id: "1", content_type: "post" },
    { id: "2", content_type: "scroll" },
    { id: "3", media_type: "video" },           // legacy scroll
    { id: "4", media_type: "image" },           // legacy post
    { id: "5", content_type: "scroll", media_type: "image" }, // explicit wins
  ];
  it("post tab keeps only posts (incl. legacy image rows)", () => {
    expect(filterByContentType(rows, "post").map((r) => r.id)).toEqual(["1", "4"]);
  });
  it("scroll tab keeps only scrolls (incl. legacy video rows)", () => {
    expect(filterByContentType(rows, "scroll").map((r) => r.id)).toEqual(["2", "3", "5"]);
  });
  it("never leaks a row into both tabs", () => {
    const posts = new Set(filterByContentType(rows, "post").map((r) => r.id));
    const scrolls = new Set(filterByContentType(rows, "scroll").map((r) => r.id));
    for (const id of posts) expect(scrolls.has(id)).toBe(false);
  });
});

describe("aspectGuide & allowedUploadModes", () => {
  it("Post guide offers 1:1 and 4:5 (Instagram-standard)", () => {
    expect(aspectGuide("post")).toBe(POST_GUIDE);
    const labels = POST_GUIDE.ratios.map((r) => r.label);
    expect(labels).toContain("Square 1:1");
    expect(labels).toContain("Portrait 4:5");
  });
  it("Scroll guide offers only 9:16 vertical", () => {
    expect(aspectGuide("scroll")).toBe(SCROLL_GUIDE);
    expect(SCROLL_GUIDE.ratios).toHaveLength(1);
    expect(SCROLL_GUIDE.ratios[0]).toMatchObject({ w: 9, h: 16 });
  });
  it("Scrolls force video; Posts allow photo or video", () => {
    expect(allowedUploadModes("scroll")).toEqual(["video"]);
    expect(allowedUploadModes("post")).toEqual(["photo", "video"]);
  });
});

describe("validateUploadSelection", () => {
  it("Post + photo is always OK at this layer", () => {
    expect(validateUploadSelection("post", "photo", {})).toBeNull();
  });
  it("Scroll requires video", () => {
    expect(validateUploadSelection("scroll", "photo", {})).toMatch(/vertical video/i);
  });
  it("Scroll rejects horizontal media (h < w)", () => {
    expect(validateUploadSelection("scroll", "video", { width: 1920, height: 1080 })).toMatch(/vertical/i);
  });
  it("Scroll accepts vertical media", () => {
    expect(validateUploadSelection("scroll", "video", { width: 1080, height: 1920 })).toBeNull();
  });
  it("Scroll rejects clips longer than 30 seconds", () => {
    expect(validateUploadSelection("scroll", "video", { width: 1080, height: 1920, durationMs: 31_000 })).toMatch(/30 seconds/);
  });
  it("Scroll accepts a 30s clip exactly at the boundary", () => {
    expect(validateUploadSelection("scroll", "video", { width: 1080, height: 1920, durationMs: 30_000 })).toBeNull();
  });
});
