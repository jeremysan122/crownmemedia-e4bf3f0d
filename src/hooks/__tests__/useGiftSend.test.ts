import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase client BEFORE importing the hook so the module captures our mock.
const rpcMock = vi.fn();
const insertMock = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
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

describe("useGiftSend — purchase & send regression", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    insertMock.mockClear();
  });

  it("succeeds on first try and returns the RPC result", async () => {
    rpcMock.mockResolvedValueOnce({ data: { success: true, transaction_id: "tx1", total: 10 }, error: null });
    const { result } = renderHook(() => useGiftSend());
    let res: any;
    await act(async () => {
      res = await result.current.sendGift({ gift, recipientId: "r1", quantity: 1, maxRetries: 2 });
    });
    expect(res.success).toBe(true);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("retries transient RPC failures up to maxRetries and logs each attempt", async () => {
    rpcMock
      .mockResolvedValueOnce({ data: null, error: { message: "network blip" } })
      .mockResolvedValueOnce({ data: null, error: { message: "network blip" } })
      .mockResolvedValueOnce({ data: { success: true, transaction_id: "tx2", total: 10 }, error: null });
    const { result } = renderHook(() => useGiftSend());
    await act(async () => {
      const res = await result.current.sendGift({ gift, recipientId: "r1", quantity: 1, maxRetries: 2 });
      expect(res.success).toBe(true);
    });
    expect(rpcMock).toHaveBeenCalledTimes(3);
    const firstKey = rpcMock.mock.calls[0][1].p_dedupe_key;
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(rpcMock.mock.calls.every((call) => call[1].p_dedupe_key === firstKey)).toBe(true);
    // Two failed attempts were logged to error_logs server-side.
    expect(insertMock).toHaveBeenCalledTimes(2);
  });

  it("reuses a provided idempotency key for manual retry actions", async () => {
    rpcMock.mockResolvedValueOnce({ data: { success: true, transaction_id: "tx3", total: 10 }, error: null });
    const { result } = renderHook(() => useGiftSend());
    await act(async () => {
      await result.current.sendGift({ gift, recipientId: "r1", quantity: 1, idempotencyKey: "11111111-1111-4111-8111-111111111111" });
    });
    expect(rpcMock.mock.calls[0][1].p_dedupe_key).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("does NOT retry fatal failures (insufficient funds / permission)", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "Insufficient shekels" } });
    const { result } = renderHook(() => useGiftSend());
    await act(async () => {
      await expect(
        result.current.sendGift({ gift, recipientId: "r1", quantity: 1, maxRetries: 3 }),
      ).rejects.toBeTruthy();
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });
});
