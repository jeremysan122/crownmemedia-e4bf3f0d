import { describe, it, expect, beforeEach } from "vitest";
import {
  sanitizeKeyword, sanitizeKeywordList, bodyMatchesKeyword, readKeywordFilters,
  MAX_KEYWORDS, MAX_KEYWORD_LEN,
  DEFAULT_BEAUTY, loadBeautySettings, saveBeautySettings, beautyCssFilter,
  moderationErrorMessage,
} from "@/lib/battleModeration";

describe("battleModeration keyword helpers", () => {
  it("trims + clamps a single keyword", () => {
    expect(sanitizeKeyword("  hello  ")).toBe("hello");
    expect(sanitizeKeyword("a".repeat(MAX_KEYWORD_LEN + 20)).length).toBe(MAX_KEYWORD_LEN);
    expect(sanitizeKeyword("   ")).toBe("");
  });

  it("dedupes case-insensitively and caps list length", () => {
    const input = ["spam", "SPAM", " Spam ", "ok"];
    expect(sanitizeKeywordList(input)).toEqual(["spam", "ok"]);
    const many = Array.from({ length: MAX_KEYWORDS + 10 }, (_, i) => `w${i}`);
    expect(sanitizeKeywordList(many)).toHaveLength(MAX_KEYWORDS);
  });

  it("matches substrings case-insensitively", () => {
    expect(bodyMatchesKeyword("You are Spammy", ["spam"])).toBe(true);
    expect(bodyMatchesKeyword("clean message", ["spam"])).toBe(false);
    expect(bodyMatchesKeyword("hi", [])).toBe(false);
  });

  it("readKeywordFilters coerces jsonb-ish input", () => {
    expect(readKeywordFilters(null)).toEqual([]);
    expect(readKeywordFilters(["a", 2, "b"])).toEqual(["a", "b"]);
    expect(readKeywordFilters("nope")).toEqual([]);
  });

  it("moderationErrorMessage maps common server errors", () => {
    expect(moderationErrorMessage({ message: "not_authorized" })).toMatch(/host or a moderator/i);
    expect(moderationErrorMessage({ message: "invalid_slow_mode" })).toMatch(/0 and 300/);
    expect(moderationErrorMessage({ message: "boom" })).toMatch(/couldn't update/i);
  });
});

describe("beauty filter", () => {
  beforeEach(() => window.localStorage.clear());

  it("returns defaults when nothing saved", () => {
    expect(loadBeautySettings()).toEqual(DEFAULT_BEAUTY);
  });

  it("round-trips settings and clamps out-of-range values", () => {
    saveBeautySettings({ enabled: true, brightness: 9, contrast: -1, smoothing: 99 });
    const loaded = loadBeautySettings();
    expect(loaded.enabled).toBe(true);
    expect(loaded.brightness).toBe(1.5);
    expect(loaded.contrast).toBe(0.5);
    expect(loaded.smoothing).toBe(6);
  });

  it("emits `none` when disabled and a full filter when enabled", () => {
    expect(beautyCssFilter(DEFAULT_BEAUTY)).toBe("none");
    expect(beautyCssFilter({ enabled: true, brightness: 1.1, contrast: 1.05, smoothing: 2 }))
      .toBe("brightness(1.1) contrast(1.05) blur(2px) saturate(1.05)");
  });
});
