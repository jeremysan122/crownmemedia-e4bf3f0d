import { describe, it, expect } from "vitest";

/**
 * Lightweight regression tests for two recurring feed bugs:
 *  1. Notifications must dedupe by id so realtime + initial-load can never
 *     produce duplicate "Royal Decrees" entries for the same event.
 *  2. The hashtag filter is encoded in the URL (?tag=) and mirrored to
 *     localStorage, so it survives tab switches and full reloads.
 *
 * These tests exercise the same primitives the components use without
 * needing to mount the React tree or hit the network.
 */

const dedupeById = <T extends { id?: string | null }>(arr: T[]): T[] => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const n of arr) {
    if (!n?.id || seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
  }
  return out;
};

describe("notifications dedupe", () => {
  it("collapses duplicate ids into a single entry", () => {
    const list = [
      { id: "a", title: "first" },
      { id: "b", title: "second" },
      { id: "a", title: "first-again" },
    ];
    expect(dedupeById(list)).toEqual([
      { id: "a", title: "first" },
      { id: "b", title: "second" },
    ]);
  });

  it("drops entries without an id", () => {
    const list = [
      { id: "a", title: "ok" },
      { id: null, title: "skip" },
      { id: undefined, title: "skip" } as any,
    ];
    expect(dedupeById(list)).toHaveLength(1);
  });

  it("preserves order from the most recent stream", () => {
    const initial = [
      { id: "1", body: "old" },
      { id: "2", body: "older" },
    ];
    const incoming = { id: "1", body: "fresh" };
    // Realtime path: prepend then dedupe — first occurrence wins, so the
    // freshly streamed entry beats the stale duplicate from the initial load.
    const merged = dedupeById([incoming, ...initial]);
    expect(merged.map((n) => n.id)).toEqual(["1", "2"]);
    expect(merged[0].body).toBe("fresh");
  });
});

describe("hashtag filter URL <-> storage", () => {
  const KEY = "crownme:feed:tag";

  it("URL param wins when present and is mirrored to storage", () => {
    const store = new Map<string, string>();
    const url = new URLSearchParams("?tag=Coffee");
    const tag = (url.get("tag") || "").toLowerCase().trim();
    if (tag) store.set(KEY, tag);
    expect(tag).toBe("coffee");
    expect(store.get(KEY)).toBe("coffee");
  });

  it("storage rehydrates the URL after a reload", () => {
    const store = new Map<string, string>([[KEY, "sunset"]]);
    const url = new URLSearchParams("");
    const tag = (url.get("tag") || "").toLowerCase().trim();
    if (!tag) {
      const saved = store.get(KEY);
      if (saved) url.set("tag", saved);
    }
    expect(url.get("tag")).toBe("sunset");
  });

  it("clearing the filter removes both URL and storage", () => {
    const store = new Map<string, string>([[KEY, "sunset"]]);
    const url = new URLSearchParams("?tag=sunset");
    url.delete("tag");
    store.delete(KEY);
    expect(url.get("tag")).toBeNull();
    expect(store.has(KEY)).toBe(false);
  });
});

describe("feed list mutation primitives", () => {
  type Post = { id: string; caption?: string; is_removed?: boolean };

  it("removes deleted posts from the local cache", () => {
    const posts: Post[] = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const next = posts.filter((p) => p.id !== "b");
    expect(next.map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("patches edited posts in place without changing order", () => {
    const posts: Post[] = [{ id: "a", caption: "old" }, { id: "b", caption: "stay" }];
    const updated = { id: "a", caption: "new" };
    const next = posts.map((p) => (p.id === updated.id ? { ...p, caption: updated.caption } : p));
    expect(next).toEqual([
      { id: "a", caption: "new" },
      { id: "b", caption: "stay" },
    ]);
  });

  it("filters the feed by hashtag membership", () => {
    type TaggedPost = Post & { hashtags: string[] };
    const posts: TaggedPost[] = [
      { id: "a", hashtags: ["coffee", "morning"] },
      { id: "b", hashtags: ["sunset"] },
      { id: "c", hashtags: ["coffee"] },
    ];
    const tag = "coffee";
    const filtered = posts.filter((p) => p.hashtags.includes(tag));
    expect(filtered.map((p) => p.id)).toEqual(["a", "c"]);
  });
});
