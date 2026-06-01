import { describe, it, expect } from "vitest";
import { withCacheBust } from "@/lib/cacheBust";

describe("withCacheBust", () => {
  it("appends v= using updated_at so the URL is stable across renders", () => {
    const u = withCacheBust("https://cdn.example.com/p/123.jpg", "2026-05-31T10:00:00Z");
    const url = new URL(u);
    expect(url.searchParams.get("v")).toBe("2026-05-31T10:00:00Z");
  });

  it("changes the v= token when updated_at changes (post edit)", () => {
    const a = withCacheBust("https://cdn.example.com/p/1.jpg", "2026-05-31T10:00:00Z");
    const b = withCacheBust("https://cdn.example.com/p/1.jpg", "2026-05-31T11:00:00Z");
    expect(new URL(a).searchParams.get("v")).not.toBe(
      new URL(b).searchParams.get("v"),
    );
  });

  it("replaces an existing v= rather than appending a duplicate", () => {
    const u = withCacheBust(
      "https://cdn.example.com/p/1.jpg?v=old&foo=1",
      "fresh",
    );
    const url = new URL(u);
    expect(url.searchParams.get("v")).toBe("fresh");
    expect(url.searchParams.get("foo")).toBe("1");
    expect(u.match(/v=/g)?.length).toBe(1);
  });

  it("returns empty string for null/undefined", () => {
    expect(withCacheBust(null)).toBe("");
    expect(withCacheBust(undefined)).toBe("");
  });

  it("handles relative URLs without throwing", () => {
    const u = withCacheBust("/uploads/post.jpg", "abc");
    expect(u).toContain("v=abc");
  });

  it("falls back to a timestamp when no version is supplied", () => {
    const u = withCacheBust("https://cdn.example.com/p/1.jpg");
    expect(new URL(u).searchParams.get("v")).toMatch(/^\d+$/);
  });
});
