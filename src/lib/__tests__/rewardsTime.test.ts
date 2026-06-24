import { describe, it, expect } from "vitest";
import {
  msUntilUtcMidnight,
  formatCountdown,
  formatLastUpdated,
  isUtcDayStale,
} from "../rewardsTime";

describe("rewardsTime", () => {
  describe("msUntilUtcMidnight", () => {
    it("returns ~24h at the start of a UTC day", () => {
      const start = Date.UTC(2026, 5, 24, 0, 0, 0);
      // Add 1ms so we're past 00:00; remaining should be just under 24h.
      const ms = msUntilUtcMidnight(start + 1);
      expect(ms).toBeGreaterThan(24 * 3600 * 1000 - 10);
      expect(ms).toBeLessThanOrEqual(24 * 3600 * 1000);
    });
    it("returns ~1h when one hour before midnight UTC", () => {
      const t = Date.UTC(2026, 5, 24, 23, 0, 0);
      expect(msUntilUtcMidnight(t)).toBe(3600 * 1000);
    });
    it("rolls over to the next day, not the same day", () => {
      const t = Date.UTC(2026, 5, 24, 12, 0, 0);
      const ms = msUntilUtcMidnight(t);
      const target = new Date(t + ms);
      expect(target.getUTCDate()).toBe(25);
      expect(target.getUTCHours()).toBe(0);
    });
  });

  describe("formatCountdown", () => {
    it("formats hours/minutes/seconds when over an hour", () => {
      expect(formatCountdown(3 * 3600_000 + 5 * 60_000 + 7_000)).toBe("3h 05m 07s");
    });
    it("omits hours when under one hour", () => {
      expect(formatCountdown(5 * 60_000 + 9_000)).toBe("5m 09s");
    });
    it("clamps negative values to zero", () => {
      expect(formatCountdown(-1000)).toBe("0m 00s");
    });
  });

  describe("formatLastUpdated", () => {
    const now = 1_700_000_000_000;
    it("returns 'Never updated' when null", () => {
      expect(formatLastUpdated(null, now)).toBe("Never updated");
    });
    it("returns 'just now' under 5s", () => {
      expect(formatLastUpdated(now - 2000, now)).toBe("Updated just now");
    });
    it("returns seconds, then minutes, then hours", () => {
      expect(formatLastUpdated(now - 12_000, now)).toBe("Updated 12s ago");
      expect(formatLastUpdated(now - 3 * 60_000, now)).toBe("Updated 3m ago");
      expect(formatLastUpdated(now - 2 * 3600_000, now)).toBe("Updated 2h ago");
    });
  });

  describe("isUtcDayStale", () => {
    it("is stale when null", () => {
      expect(isUtcDayStale(null)).toBe(true);
    });
    it("is fresh when the cached date matches today's UTC date", () => {
      const now = Date.UTC(2026, 5, 24, 12, 0, 0);
      expect(isUtcDayStale("2026-06-24", now)).toBe(false);
    });
    it("is stale across the UTC rollover", () => {
      // Cached yesterday, now it's tomorrow UTC — page must refresh.
      const now = Date.UTC(2026, 5, 25, 0, 0, 1);
      expect(isUtcDayStale("2026-06-24", now)).toBe(true);
    });
  });
});
