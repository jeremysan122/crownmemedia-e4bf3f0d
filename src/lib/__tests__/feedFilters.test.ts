import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(async () => {}),
}));
import { trackEvent } from "@/lib/analytics";
import { __resetUsageTrackForTests, trackUsageEvent } from "@/lib/usageTrack";
import { isFilteredOut } from "@/hooks/useFeedFilters";

describe("Feed: blocked + muted filter", () => {
  it("hides posts whose author is in the blocked set", () => {
    const filters = { blockedIds: new Set(["u-blocked"]), mutedWords: [] };
    expect(isFilteredOut({ user_id: "u-blocked", caption: "hi" }, filters)).toBe(true);
    expect(isFilteredOut({ user_id: "u-friend", caption: "hi" }, filters)).toBe(false);
  });

  it("hides posts whose caption contains a muted word (case-insensitive)", () => {
    const filters = { blockedIds: new Set<string>(), mutedWords: ["spoilers"] };
    expect(isFilteredOut({ caption: "Big SPOILERS ahead" }, filters)).toBe(true);
    expect(isFilteredOut({ caption: "all clear" }, filters)).toBe(false);
  });

  it("hides posts whose hashtags include a muted word", () => {
    const filters = { blockedIds: new Set<string>(), mutedWords: ["politics"] };
    expect(isFilteredOut({ caption: "", hashtags: ["fun", "politics"] }, filters)).toBe(true);
  });

  it("does not break on empty filter lists", () => {
    const filters = { blockedIds: new Set<string>(), mutedWords: [] };
    expect(isFilteredOut({ user_id: "u", caption: "anything" }, filters)).toBe(false);
  });
});

describe("Feed: per-card post_viewed dedupe semantics", () => {
  // The IntersectionObserver wrapper is in FeedPostCard.tsx; here we verify
  // the underlying analytics primitive itself fires every call (FeedPostCard
  // adds its own per-session Set on top).
  beforeEach(() => {
    __resetUsageTrackForTests();
    (trackEvent as ReturnType<typeof vi.fn>).mockClear();
    vi.useFakeTimers();
  });
  it("trackUsageEvent('post_viewed') fires per call (FeedPostCard layers dedupe)", () => {
    trackUsageEvent("post_viewed", { postId: "p1" });
    trackUsageEvent("post_viewed", { postId: "p2" });
    vi.runAllTimers();
    expect(trackEvent).toHaveBeenCalledTimes(2);
  });
});
