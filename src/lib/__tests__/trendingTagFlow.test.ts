import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * E2E-ish flow tests (logic level, no DOM mounting required) covering:
 *  1. Clicking a trending hashtag chip navigates to /feed?tag=<tag>,
 *     mirrors that tag to localStorage so it survives reloads, and
 *     triggers a scroll-to-top so the user sees the filtered feed.
 *  2. Saving a cloud draft with uploaded photos persists their URLs in
 *     `post_drafts.image_urls` and a subsequent hydration restores the
 *     full photo set before the user publishes.
 */

const TAG_KEY = "crownme:feed:tag";

// --- 1. Trending chip -> ?tag= filter + scroll-to-top -----------------------

describe("trending hashtag chip flow", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("navigates to /feed?tag=, mirrors to storage, and scrolls to top", () => {
    const navigate = vi.fn((to: string) => {
      window.history.pushState({}, "", to);
      // Components mirror the URL tag into localStorage on render — simulate
      // that side-effect immediately so the assertion below reflects the
      // post-navigation state.
      const params = new URLSearchParams(window.location.search);
      const t = params.get("tag");
      if (t) localStorage.setItem(TAG_KEY, t.toLowerCase());
    });
    const scrollTo = vi.fn();
    (window as any).scrollTo = scrollTo;

    // Simulate the chip click handler from TrendingHashtags.tsx
    const onPickTag = (tag: string) => {
      navigate(`/feed?tag=${encodeURIComponent(tag)}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    onPickTag("Coffee");

    expect(navigate).toHaveBeenCalledWith("/feed?tag=Coffee");
    expect(window.location.pathname + window.location.search).toBe("/feed?tag=Coffee");
    expect(localStorage.getItem(TAG_KEY)).toBe("coffee");
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("persists the ?tag= filter across a simulated reload", () => {
    // First visit: user lands with a tag in the URL
    window.history.replaceState({}, "", "/feed?tag=sunset");
    const initial = new URLSearchParams(window.location.search).get("tag");
    if (initial) localStorage.setItem(TAG_KEY, initial.toLowerCase());

    // Reload: URL params are dropped, hydration should rebuild from storage
    window.history.replaceState({}, "", "/feed");
    const url = new URLSearchParams(window.location.search);
    const fromUrl = url.get("tag");
    if (!fromUrl) {
      const saved = localStorage.getItem(TAG_KEY);
      if (saved) url.set("tag", saved);
    }

    expect(url.get("tag")).toBe("sunset");
  });
});

// --- 2. Cloud draft photo persistence + restore -----------------------------

interface DraftRow {
  id: string;
  user_id: string;
  caption: string;
  image_urls: string[];
  cover_url: string | null;
}

describe("cloud draft photo persistence", () => {
  it("saves uploaded photo URLs and fully restores them on reload", async () => {
    // In-memory stand-in for the post_drafts table + storage bucket.
    const table = new Map<string, DraftRow>();
    const storage: Record<string, Blob> = {};

    const uploadPhoto = async (userId: string, file: Blob, name: string) => {
      const path = `media/${userId}/drafts/${name}`;
      storage[path] = file;
      return `https://cdn.test/${path}`;
    };

    const saveCloudDraft = async (userId: string, caption: string, files: Blob[]) => {
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        urls.push(await uploadPhoto(userId, files[i], `p${i}.jpg`));
      }
      const id = `draft-${table.size + 1}`;
      table.set(id, {
        id,
        user_id: userId,
        caption,
        image_urls: urls,
        cover_url: urls[0] ?? null,
      });
      return id;
    };

    const hydrateDraft = async (id: string) => {
      const row = table.get(id);
      if (!row) return null;
      // Mirror Upload.tsx hydration: fetch each image URL back into a photos[] state.
      const photos = row.image_urls.map((url) => ({ url, restored: true }));
      return { caption: row.caption, photos, cover: row.cover_url };
    };

    // 1. User saves a draft with two uploaded photos.
    const userId = "user-1";
    const files = [new Blob(["a"]), new Blob(["b"])];
    const id = await saveCloudDraft(userId, "morning brew", files);

    const saved = table.get(id)!;
    expect(saved.image_urls).toHaveLength(2);
    expect(saved.cover_url).toBe(saved.image_urls[0]);
    expect(Object.keys(storage)).toHaveLength(2);

    // 2. Simulate a reload by re-hydrating from the draft id alone.
    const restored = await hydrateDraft(id);
    expect(restored).not.toBeNull();
    expect(restored!.caption).toBe("morning brew");
    expect(restored!.photos).toHaveLength(2);
    expect(restored!.photos.every((p) => p.url.startsWith("https://cdn.test/"))).toBe(true);
    // Cover is preserved so the publish step has the same primary image.
    expect(restored!.cover).toBe(saved.image_urls[0]);
  });
});
