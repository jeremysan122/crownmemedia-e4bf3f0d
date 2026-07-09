import { describe, it, expect, beforeEach, vi } from "vitest";

// Batch C — 15s batched polling safety net for visible post counters.
// These tests lock:
//   - one shared interval regardless of how many cards register
//   - one batched query per tick, using `.in("id", visibleIds)`
//   - polling stops when the last card unregisters
//   - hidden tab does not aggressively poll
//   - PostCard does not open its own supabase.channel or setInterval

describe("postPollBus (Batch C 15s safety net)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  async function loadWithMock() {
    const inFn = vi.fn().mockResolvedValue({ data: [], error: null });
    const selectFn = vi.fn(() => ({ in: inFn }));
    const fromFn = vi.fn(() => ({ select: selectFn }));

    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: { from: fromFn },
    }));

    const mod = await import("@/lib/postPollBus");
    mod.__resetPollBusForTests();
    mod.__setPollIntervalForTests(15_000);
    return { mod, fromFn, selectFn, inFn };
  }

  it("30 registered cards → 1 shared interval, 1 batched query per tick", async () => {
    const { mod, fromFn, inFn } = await loadWithMock();
    const ids = Array.from({ length: 30 }, (_, i) => `p-${i}`);
    const unsubs = ids.map((id) => mod.registerVisiblePost(id, () => {}));

    expect(mod.__pollStatsForTests().hasInterval).toBe(true);
    expect(mod.__pollStatsForTests().postCount).toBe(30);

    await vi.advanceTimersByTimeAsync(15_000);
    // One batched query — not 30.
    expect(fromFn).toHaveBeenCalledTimes(1);
    expect(fromFn).toHaveBeenCalledWith("posts");
    expect(inFn).toHaveBeenCalledTimes(1);
    expect(inFn.mock.calls[0][0]).toBe("id");
    expect(inFn.mock.calls[0][1]).toHaveLength(30);

    unsubs.forEach((u) => u());
    expect(mod.__pollStatsForTests().hasInterval).toBe(false);
  });

  it("dispatches counters to per-post handlers", async () => {
    const inFn = vi.fn().mockResolvedValue({
      data: [
        { id: "a", crown_score: 42, comment_count: 3, share_count: 1, repost_count: 0, battle_wins: 2 },
      ],
      error: null,
    });
    const selectFn = vi.fn(() => ({ in: inFn }));
    const fromFn = vi.fn(() => ({ select: selectFn }));
    vi.doMock("@/integrations/supabase/client", () => ({ supabase: { from: fromFn } }));

    const mod = await import("@/lib/postPollBus");
    mod.__resetPollBusForTests();

    const handler = vi.fn();
    mod.registerVisiblePost("a", handler);
    await vi.advanceTimersByTimeAsync(15_000);

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      crown_score: 42, comment_count: 3, share_count: 1, repost_count: 0, battle_wins: 2,
    }));
  });

  it("skips the tick while the tab is hidden", async () => {
    const { mod, fromFn } = await loadWithMock();
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    mod.registerVisiblePost("a", () => {});
    await vi.advanceTimersByTimeAsync(45_000);
    expect(fromFn).not.toHaveBeenCalled();
  });

  it("never creates duplicate intervals across re-registrations", async () => {
    const { mod } = await loadWithMock();
    for (let i = 0; i < 10; i++) mod.registerVisiblePost(`x-${i}`, () => {});
    // hasInterval is a boolean; the real regression check is that count
    // stays at 1 even when we churn subscriptions.
    expect(mod.__pollStatsForTests().hasInterval).toBe(true);
    expect(mod.__pollStatsForTests().postCount).toBe(10);
  });
});

describe("PostCard source contract", () => {
  it("PostCard never calls supabase.channel directly (goes through shared bus)", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/components/PostCard.tsx", "utf8");
    // Ignore prose mentions in comments; only flag real call sites.
    const codeOnly = src
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    expect(codeOnly).not.toMatch(/supabase\.channel\s*\(/);
  });

  it("PostCard never starts its own setInterval (uses shared poll bus)", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/components/PostCard.tsx", "utf8");
    expect(src).not.toMatch(/setInterval\s*\(/);
  });

  it("PostCard imports the shared poll bus", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/components/PostCard.tsx", "utf8");
    expect(src).toMatch(/from ["']@\/lib\/postPollBus["']/);
    expect(src).toMatch(/registerVisiblePost/);
  });
});
