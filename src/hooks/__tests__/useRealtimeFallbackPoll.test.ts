import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRealtimeFallbackPoll } from "@/hooks/useRealtimeFallbackPoll";

describe("useRealtimeFallbackPoll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("does NOT poll while realtime is live", () => {
    const refetch = vi.fn();
    renderHook(() => useRealtimeFallbackPoll(refetch, true, 1000));
    vi.advanceTimersByTime(5000);
    expect(refetch).not.toHaveBeenCalled();
  });

  it("polls at the given interval when realtime is down and fires fallback diagnostic once", () => {
    const refetch = vi.fn();
    const onEngaged = vi.fn();
    renderHook(() => useRealtimeFallbackPoll(refetch, false, 1000, onEngaged));
    expect(onEngaged).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3500);
    expect(refetch).toHaveBeenCalledTimes(3);
    expect(onEngaged).toHaveBeenCalledTimes(1);
  });

  it("stops polling when realtime reconnects", () => {
    const refetch = vi.fn();
    const { rerender } = renderHook(({ live }: { live: boolean }) => useRealtimeFallbackPoll(refetch, live, 500), {
      initialProps: { live: false },
    });
    vi.advanceTimersByTime(1000);
    expect(refetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    refetch.mockClear();
    rerender({ live: true });
    vi.advanceTimersByTime(2000);
    expect(refetch).not.toHaveBeenCalled();
  });

  it("skips polling tick when document is hidden (saves cost / avoids duplicate alerts)", () => {
    const refetch = vi.fn();
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    renderHook(() => useRealtimeFallbackPoll(refetch, false, 500));
    vi.advanceTimersByTime(2000);
    expect(refetch).not.toHaveBeenCalled();
  });
});
