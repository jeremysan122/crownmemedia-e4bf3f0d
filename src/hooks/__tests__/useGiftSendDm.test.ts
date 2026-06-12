import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
const insertMock = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    auth: { getUser: async () => ({ data: { user: { id: "sender-1" } } }) },
    from: () => ({ insert: insertMock }),
  },
}));

import { renderHook, act } from "@testing-library/react";
import { useGiftSend } from "@/hooks/useGiftSend";
import type { RoyalGift } from "@/types/gifts";

const gift: RoyalGift = {
  id: "rose",
  name: "Rose",
  shekelCost: 10,
  category: "low",
  rarity: "common",
  animationType: "rose",
  icon: "🌹",
};

describe("useGiftSend.sendDmGift — DM gifting flow", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    insertMock.mockClear();
  });

  it("sends a DM gift via send_dm_gift RPC and returns message_id", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { success: true, transaction_id: "tx-d1", message_id: "m-1", total: 10 },
      error: null,
    });
    const { result } = renderHook(() => useGiftSend());
    let res: any;
    await act(async () => {
      res = await result.current.sendDmGift({ gift, recipientId: "r-1", quantity: 1 });
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0][0]).toBe("send_dm_gift");
    expect(res.message_id).toBe("m-1");
    expect(res.success).toBe(true);
  });

  it("retries transient failures with a stable dedupe_key (idempotency-safe)", async () => {
    rpcMock
      .mockResolvedValueOnce({ data: null, error: { message: "network blip" } })
      .mockResolvedValueOnce({
        data: { success: true, transaction_id: "tx-d2", message_id: "m-2" },
        error: null,
      });
    const { result } = renderHook(() => useGiftSend());
    await act(async () => {
      const res = await result.current.sendDmGift({ gift, recipientId: "r-1", quantity: 1, maxRetries: 2 });
      expect(res.message_id).toBe("m-2");
    });
    expect(rpcMock).toHaveBeenCalledTimes(2);
    const k1 = rpcMock.mock.calls[0][1].p_dedupe_key;
    const k2 = rpcMock.mock.calls[1][1].p_dedupe_key;
    expect(k1).toBe(k2);
  });

  it("does NOT retry fatal business errors (self-gift, blocked, insufficient)", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "Cannot send gift to blocked user" } });
    const { result } = renderHook(() => useGiftSend());
    await act(async () => {
      await expect(
        result.current.sendDmGift({ gift, recipientId: "r-1", quantity: 1, maxRetries: 3 }),
      ).rejects.toBeTruthy();
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("rapid double-tap reuses provided idempotency key so only one transaction commits", async () => {
    rpcMock.mockResolvedValue({
      data: { success: true, transaction_id: "tx-same", message_id: "m-same", deduped: true },
      error: null,
    });
    const { result } = renderHook(() => useGiftSend());
    const key = "11111111-1111-4111-8111-111111111111";
    await act(async () => {
      const [a, b] = await Promise.all([
        result.current.sendDmGift({ gift, recipientId: "r-1", quantity: 1, idempotencyKey: key }),
        result.current.sendDmGift({ gift, recipientId: "r-1", quantity: 1, idempotencyKey: key }),
      ]);
      expect(a.transaction_id).toBe(b.transaction_id);
    });
    // Both calls used the SAME dedupe key — server returns the original tx on the dupe.
    expect(rpcMock.mock.calls.every((c) => c[1].p_dedupe_key === key)).toBe(true);
  });
});
