import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase client so we can observe batched parent fetches.
const inMock = vi.fn();
const selectMock = vi.fn(() => ({ in: inMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: any[]) => fromMock(...args) },
}));

import { hydrateParents } from "@/lib/postQuery";

beforeEach(() => {
  inMock.mockReset();
  selectMock.mockClear();
  fromMock.mockClear();
});

describe("hydrateParents", () => {
  it("is a no-op when there are no parent_post_id references", async () => {
    const rows = [{ id: "a", parent_post_id: null }];
    const out = await hydrateParents(rows as any);
    expect(out).toBe(rows);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("batch-fetches all parents in a single .in() call (no N+1)", async () => {
    inMock.mockResolvedValueOnce({
      data: [
        { id: "p1", is_removed: false, is_archived: false, caption: "orig 1" },
        { id: "p2", is_removed: false, is_archived: false, caption: "orig 2" },
      ],
      error: null,
    });
    const rows = [
      { id: "a", parent_post_id: "p1" },
      { id: "b", parent_post_id: "p2" },
      { id: "c", parent_post_id: "p1" }, // dedup
    ];
    await hydrateParents(rows as any);
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith("posts");
    expect(inMock).toHaveBeenCalledTimes(1);
    const args = inMock.mock.calls[0];
    expect(args[0]).toBe("id");
    expect(new Set(args[1])).toEqual(new Set(["p1", "p2"]));
    expect((rows[0] as any).parent.caption).toBe("orig 1");
    expect((rows[2] as any).parent.caption).toBe("orig 1");
  });

  it("filters out removed/archived originals (renders fallback in UI)", async () => {
    inMock.mockResolvedValueOnce({
      data: [
        { id: "p1", is_removed: true, is_archived: false, caption: "gone" },
        { id: "p2", is_removed: false, is_archived: true, caption: "archived" },
        { id: "p3", is_removed: false, is_archived: false, caption: "ok" },
      ],
      error: null,
    });
    const rows = [
      { id: "a", parent_post_id: "p1" },
      { id: "b", parent_post_id: "p2" },
      { id: "c", parent_post_id: "p3" },
    ];
    await hydrateParents(rows as any);
    expect((rows[0] as any).parent).toBeNull();
    expect((rows[1] as any).parent).toBeNull();
    expect((rows[2] as any).parent?.caption).toBe("ok");
  });

  it("leaves parent=null on RPC error rather than crashing the feed", async () => {
    inMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const rows = [{ id: "a", parent_post_id: "px" }];
    await hydrateParents(rows as any);
    // Rows are returned even when parent fetch fails — UI shows fallback.
    expect((rows[0] as any).parent).toBeUndefined();
  });
});
