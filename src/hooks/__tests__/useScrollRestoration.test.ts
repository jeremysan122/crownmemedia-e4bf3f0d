import { describe, it, expect, beforeEach } from "vitest";
import {
  saveScrollPosition,
  readScrollPosition,
  clearScrollPosition,
  __resetScrollRestorationForTests,
} from "@/hooks/useScrollRestoration";

describe("useScrollRestoration storage helpers", () => {
  beforeEach(() => {
    __resetScrollRestorationForTests();
  });

  it("round-trips a saved offset", () => {
    saveScrollPosition("feed:global", 480);
    expect(readScrollPosition("feed:global")).toBe(480);
  });

  it("returns null for unknown keys", () => {
    expect(readScrollPosition("never:saved")).toBeNull();
  });

  it("clamps negatives and rounds floats", () => {
    saveScrollPosition("k1", -10);
    expect(readScrollPosition("k1")).toBe(0);
    saveScrollPosition("k1", 12.7);
    expect(readScrollPosition("k1")).toBe(13);
  });

  it("clearScrollPosition removes the saved value", () => {
    saveScrollPosition("k2", 100);
    clearScrollPosition("k2");
    expect(readScrollPosition("k2")).toBeNull();
  });

  it("keys are independent per surface/tab", () => {
    saveScrollPosition("profile:posts", 120);
    saveScrollPosition("profile:scrolls", 30);
    expect(readScrollPosition("profile:posts")).toBe(120);
    expect(readScrollPosition("profile:scrolls")).toBe(30);
  });

  it("evicts oldest entries past MAX_KEYS cap", () => {
    for (let i = 0; i < 55; i++) saveScrollPosition(`k:${i}`, i * 10);
    // Oldest few should be evicted; newest must survive.
    expect(readScrollPosition("k:0")).toBeNull();
    expect(readScrollPosition("k:54")).toBe(540);
  });
});
