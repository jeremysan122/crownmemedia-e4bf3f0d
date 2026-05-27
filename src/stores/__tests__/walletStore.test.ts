import { describe, it, expect, vi, afterEach } from "vitest";
import { walletStore } from "@/stores/walletStore";

afterEach(() => {
  // Clear snapshot to keep tests isolated.
  walletStore.setSnapshot({ shekelBalance: 0, totalEarned: 0, totalSpent: 0, loading: true });
});

describe("walletStore", () => {
  it("notifies every subscriber when requestRefresh is called", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = walletStore.subscribe(a);
    const offB = walletStore.subscribe(b);

    walletStore.requestRefresh();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    offA();
    walletStore.requestRefresh();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);

    offB();
  });

  it("persists the most recent snapshot for new consumers", () => {
    walletStore.setSnapshot({
      shekelBalance: 1234,
      totalEarned: 2000,
      totalSpent: 766,
      loading: false,
    });

    expect(walletStore.getSnapshot()).toEqual({
      shekelBalance: 1234,
      totalEarned: 2000,
      totalSpent: 766,
      loading: false,
    });
  });
});
