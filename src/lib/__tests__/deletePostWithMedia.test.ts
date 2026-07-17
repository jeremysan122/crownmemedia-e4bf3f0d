import { describe, expect, it, vi } from "vitest";
import { deletePostWithMedia, ownedMediaRefFromUrl } from "@/lib/deletePostWithMedia";

const uid = "11111111-2222-3333-4444-555555555555";

function publicUrl(path: string) {
  return `https://example.supabase.co/storage/v1/object/public/media/${path}`;
}

type QueryChain = {
  select: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: (resolve: (value: unknown) => unknown) => Promise<unknown>;
};

function query(result: unknown): QueryChain {
  const chain = {} as QueryChain;
  chain.select = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => result);
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

describe("ownedMediaRefFromUrl", () => {
  it("accepts only media paths inside the current user's folder", () => {
    expect(ownedMediaRefFromUrl(publicUrl(`${uid}/video.webm`), uid)).toEqual({
      bucket: "media",
      path: `${uid}/video.webm`,
    });
    expect(ownedMediaRefFromUrl(publicUrl(`someone-else/video.webm`), uid)).toBeNull();
    expect(ownedMediaRefFromUrl("https://cdn.example/video.webm", uid)).toBeNull();
  });

  it("decodes safe path segments without accepting a different owner", () => {
    expect(ownedMediaRefFromUrl(publicUrl(`${uid}/poster%20frame.jpg`), uid)?.path)
      .toBe(`${uid}/poster frame.jpg`);
    expect(ownedMediaRefFromUrl(publicUrl(`someone-else/%2E%2E/${uid}/video.webm`), uid)).toBeNull();
  });
});

describe("deletePostWithMedia", () => {
  it("deletes the row before removing each deduplicated owned object", async () => {
    const events: string[] = [];
    const postRead = query({
      data: {
        image_url: publicUrl(`${uid}/poster.jpg`),
        image_urls: [publicUrl(`${uid}/poster.jpg`)],
        video_url: publicUrl(`${uid}/video.webm`),
        video_poster_url: publicUrl(`${uid}/poster.jpg`),
      },
      error: null,
    });
    const mediaRead = query({
      data: [{ storage_bucket: "media", storage_path: `${uid}/video.webm`, safe_variant_path: null }],
      error: null,
    });
    const deleteQuery = query({ data: null, error: null });
    deleteQuery.then = (resolve: (value: unknown) => unknown) => {
      events.push("delete");
      return Promise.resolve({ data: null, error: null }).then(resolve);
    };
    const remove = vi.fn(async (paths: string[]) => {
      events.push("remove");
      return { data: paths, error: null };
    });
    let postsCalls = 0;
    const client = {
      from: vi.fn((table: string) => {
        if (table === "post_media") return mediaRead;
        postsCalls += 1;
        return postsCalls === 1 ? postRead : deleteQuery;
      }),
      storage: { from: vi.fn(() => ({ remove })) },
    };

    const result = await deletePostWithMedia(
      client as unknown as Parameters<typeof deletePostWithMedia>[0],
      "post-1",
      uid,
    );

    expect(events).toEqual(["delete", "remove"]);
    expect(remove).toHaveBeenCalledWith([`${uid}/poster.jpg`, `${uid}/video.webm`]);
    expect(result).toEqual({ removedObjects: 2, cleanupDeferred: false });
  });

  it("keeps a successful post deletion when Storage cleanup must be deferred", async () => {
    const postRead = query({ data: { video_url: publicUrl(`${uid}/video.webm`) }, error: null });
    const mediaRead = query({ data: [], error: null });
    const deleteQuery = query({ data: null, error: null });
    const remove = vi.fn(async () => ({ data: null, error: new Error("storage unavailable") }));
    let postsCalls = 0;
    const client = {
      from: vi.fn((table: string) => {
        if (table === "post_media") return mediaRead;
        postsCalls += 1;
        return postsCalls === 1 ? postRead : deleteQuery;
      }),
      storage: { from: vi.fn(() => ({ remove })) },
    };

    await expect(deletePostWithMedia(
      client as unknown as Parameters<typeof deletePostWithMedia>[0],
      "post-1",
      uid,
    )).resolves.toEqual({
      removedObjects: 0,
      cleanupDeferred: true,
    });
  });
});
