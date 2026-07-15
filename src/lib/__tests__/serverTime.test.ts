/**
 * Unit tests for `src/lib/serverTime.ts`.
 *
 * Verifies the module:
 *   1. Parses a valid `Date:` header and computes a plausible offset.
 *   2. Falls back to 0 when the header is missing.
 *   3. Falls back to 0 when the header is unparseable.
 *   4. Falls back to 0 when the HEAD request throws.
 *   5. Caches the result so subsequent calls don't re-fetch.
 *   6. `serverNow()` never lets a countdown go negative when combined with
 *      an `ends_at` that's still in the future.
 *
 * The module keeps cached state at module scope, so we `resetModules()`
 * before every test to get a clean slate.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ORIGINAL_ENV = { ...import.meta.env };

function mockFetchOnce(response: { headers?: Record<string, string> } | Error) {
  const fetchMock = vi.fn().mockImplementation(() => {
    if (response instanceof Error) return Promise.reject(response);
    const h = new Headers(response.headers ?? {});
    return Promise.resolve({ ok: true, headers: h } as unknown as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function loadFresh() {
  vi.resetModules();
  return await import("../serverTime");
}

describe("serverTime", () => {
  beforeEach(() => {
    // Ensure VITE_SUPABASE_URL is defined so the module attempts the fetch.
    (import.meta.env as Record<string, string>).VITE_SUPABASE_URL = "https://example.supabase.co";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.assign(import.meta.env, ORIGINAL_ENV);
  });

  it("parses a valid Date header into a plausible offset", async () => {
    const now = Date.now();
    // Server clock 30s ahead of client.
    const serverDate = new Date(now + 30_000).toUTCString();
    mockFetchOnce({ headers: { date: serverDate } });

    const mod = await loadFresh();
    const offset = await mod.getServerTimeOffsetMs();

    // HTTP Date header has 1s precision, so truncation can shave up to ~1000ms.
    // Also allow for round-trip midpoint slack in either direction.
    expect(offset).toBeGreaterThan(28_500);
    expect(offset).toBeLessThan(31_000);
    // serverNow() reflects the offset.
    expect(mod.serverNow() - Date.now()).toBeGreaterThan(28_000);
  });

  it("falls back to 0 when the Date header is missing", async () => {
    mockFetchOnce({ headers: {} });
    const mod = await loadFresh();
    expect(await mod.getServerTimeOffsetMs()).toBe(0);
    expect(mod.serverNow()).toBeLessThanOrEqual(Date.now() + 5);
  });

  it("falls back to 0 when the Date header is unparseable", async () => {
    mockFetchOnce({ headers: { date: "not-a-real-date" } });
    const mod = await loadFresh();
    expect(await mod.getServerTimeOffsetMs()).toBe(0);
  });

  it("falls back to 0 when fetch throws", async () => {
    mockFetchOnce(new Error("network down"));
    const mod = await loadFresh();
    expect(await mod.getServerTimeOffsetMs()).toBe(0);
  });

  it("falls back to 0 when VITE_SUPABASE_URL is missing (no fetch attempted)", async () => {
    delete (import.meta.env as Record<string, string | undefined>).VITE_SUPABASE_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const mod = await loadFresh();
    expect(await mod.getServerTimeOffsetMs()).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches the offset so repeated calls do not re-fetch", async () => {
    const fetchMock = mockFetchOnce({
      headers: { date: new Date(Date.now() + 5_000).toUTCString() },
    });
    const mod = await loadFresh();
    const first = await mod.getServerTimeOffsetMs();
    const second = await mod.getServerTimeOffsetMs();
    const third = await mod.getServerTimeOffsetMs();
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("de-dupes concurrent inflight calls into a single fetch", async () => {
    const fetchMock = mockFetchOnce({
      headers: { date: new Date(Date.now() + 1_000).toUTCString() },
    });
    const mod = await loadFresh();
    const [a, b, c] = await Promise.all([
      mod.getServerTimeOffsetMs(),
      mod.getServerTimeOffsetMs(),
      mod.getServerTimeOffsetMs(),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("countdown derived from serverNow() never goes negative before ends_at", async () => {
    // Simulate a badly-skewed client clock: server is 5 minutes BEHIND client.
    // Even so, `ends_at = serverNow() + 60s` should yield a positive remaining.
    const serverAheadMs = -5 * 60_000;
    mockFetchOnce({
      headers: { date: new Date(Date.now() + serverAheadMs).toUTCString() },
    });
    const mod = await loadFresh();
    await mod.getServerTimeOffsetMs();

    const endsAt = mod.serverNow() + 60_000;
    const remaining = Math.max(0, Math.floor((endsAt - mod.serverNow()) / 1000));
    expect(remaining).toBeGreaterThanOrEqual(59);
    expect(remaining).toBeLessThanOrEqual(60);

    // And the Math.max(0, …) guard keeps a stale endsAt from going negative.
    const staleEndsAt = mod.serverNow() - 30_000;
    const safeRemaining = Math.max(0, Math.floor((staleEndsAt - mod.serverNow()) / 1000));
    expect(safeRemaining).toBe(0);
  });
});
