import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(async () => {}),
}));

import { trackEvent } from "@/lib/analytics";
import { trackUsage, trackUsageEvent, __resetUsageTrackForTests } from "@/lib/usageTrack";

// requestIdleCallback isn't available in jsdom — usageTrack falls back to
// setTimeout(cb, 0). Use fake timers to flush it deterministically.
describe("usageTrack", () => {
  beforeEach(() => {
    __resetUsageTrackForTests();
    (trackEvent as ReturnType<typeof vi.fn>).mockClear();
    vi.useFakeTimers();
  });

  it("debounces trackUsage to once per (event,key) per session", () => {
    trackUsage("feed_opened");
    trackUsage("feed_opened");
    trackUsage("feed_opened", "other");
    vi.runAllTimers();
    expect(trackEvent).toHaveBeenCalledTimes(2);
  });

  it("trackUsageEvent fires every call (no dedupe)", () => {
    trackUsageEvent("vote_success", { postId: "p1" });
    trackUsageEvent("vote_success", { postId: "p1" });
    trackUsageEvent("vote_success", { postId: "p2" });
    vi.runAllTimers();
    expect(trackEvent).toHaveBeenCalledTimes(3);
  });

  it("never throws when analytics rejects", async () => {
    (trackEvent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    expect(() => trackUsage("crown_map_opened")).not.toThrow();
    expect(() => trackUsageEvent("vote_failed")).not.toThrow();
    vi.runAllTimers();
  });
});
