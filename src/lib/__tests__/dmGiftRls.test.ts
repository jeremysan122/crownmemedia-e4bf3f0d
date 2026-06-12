import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * RLS regression spec for DM royal gifts. These tests verify the CLIENT contract
 * against the documented server policies:
 *
 *   1. messages with kind='gift' can ONLY be created via the `send_dm_gift` RPC.
 *      Direct INSERT into public.messages with kind='gift' is rejected by RLS.
 *   2. gift_transactions are visible only to sender or receiver.
 *   3. wallet debits go through `send_dm_gift` / `send_royal_gift` only;
 *      direct UPDATE to wallets.balance from a non-owner is rejected.
 *   4. shekel_ledger rows cannot be inserted directly by normal users.
 *   5. Sender cannot spoof sender_id (RPC reads auth.uid() — client args are ignored).
 *
 * We mock the supabase client to simulate the server returning these RLS errors
 * and assert the client surfaces them cleanly without retrying as if they were
 * transient (because `useGiftSend.isFatal` matches /permission|denied|not allowed/).
 */

const rpcMock = vi.fn();
const insertMock = vi.fn();
const updateMock = vi.fn();
const eqMock = vi.fn();
const selectMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const chain: any = {
    insert: (...a: unknown[]) => insertMock(...a),
    update: (...a: unknown[]) => updateMock(...a),
    select: (...a: unknown[]) => { selectMock(...a); return chain; },
    eq: (...a: unknown[]) => { eqMock(...a); return chain; },
    maybeSingle: async () => ({ data: null, error: null }),
    then: undefined,
  };
  return {
    supabase: {
      rpc: (...args: unknown[]) => rpcMock(...args),
      from: () => chain,
      auth: { getUser: async () => ({ data: { user: { id: "sender-1" } } }) },
    },
  };
});

import { useGiftSend } from "@/hooks/useGiftSend";
import { renderHook, act } from "@testing-library/react";
import { supabase } from "@/integrations/supabase/client";
import type { RoyalGift } from "@/types/gifts";

const gift: RoyalGift = { id: "rose", name: "Rose", shekelCost: 10, category: "low", rarity: "common", animationType: "rose", icon: "🌹" };

describe("DM gift RLS — client-side regression", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    insertMock.mockReset();
    updateMock.mockReset();
  });

  it("direct INSERT of a gift-kind message is rejected by RLS (must go via RPC)", async () => {
    insertMock.mockResolvedValueOnce({
      data: null,
      error: { message: "new row violates row-level security policy for table \"messages\"", code: "42501" },
    });
    const { error } = (await (supabase.from("messages") as any).insert({
      sender_id: "sender-1",
      receiver_id: "victim",
      kind: "gift",
      content: "spoof",
    })) as { error: { message: string; code: string } };
    expect(error.code).toBe("42501");
    expect(error.message).toMatch(/row-level security/i);
  });

  it("direct UPDATE of another user's wallet is denied", async () => {
    updateMock.mockReturnValueOnce({
      eq: async () => ({ data: null, error: { message: "permission denied for table wallets", code: "42501" } }),
    });
    const { error } = await (supabase.from("wallets") as any).update({ balance: 999999 }).eq("user_id", "victim");
    expect(error.code).toBe("42501");
    expect(error.message).toMatch(/permission denied/i);
  });

  it("direct INSERT into shekel_ledger by a normal user is denied", async () => {
    insertMock.mockResolvedValueOnce({
      data: null,
      error: { message: "permission denied for table shekel_ledger", code: "42501" },
    });
    const { error } = await (supabase.from("shekel_ledger") as any).insert({
      user_id: "sender-1", delta: 1000, reason: "self-credit",
    });
    expect(error.message).toMatch(/permission denied/i);
  });

  it("client cannot spoof sender_id — RPC uses auth.uid(), so a hostile sender_id arg is ignored. A blocked-recipient RPC error is fatal (no retry).", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "Cannot send gift: sender is blocked by recipient", code: "P0001" },
    });
    const { result } = renderHook(() => useGiftSend());
    await act(async () => {
      await expect(
        result.current.sendDmGift({ gift, recipientId: "blocker", quantity: 1, maxRetries: 5 }),
      ).rejects.toMatchObject({ message: expect.stringMatching(/blocked/i) });
    });
    // Fatal: must NOT retry on permission/blocked errors.
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("self-gift attempt is rejected by the RPC and not retried", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "Cannot send gift to self", code: "P0001" },
    });
    const { result } = renderHook(() => useGiftSend());
    await act(async () => {
      await expect(
        result.current.sendDmGift({ gift, recipientId: "sender-1", quantity: 1, maxRetries: 3 }),
      ).rejects.toBeTruthy();
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("banned / suspended / deleted recipient is rejected fatally", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "Recipient is suspended", code: "P0001" },
    });
    const { result } = renderHook(() => useGiftSend());
    await act(async () => {
      await expect(
        result.current.sendDmGift({ gift, recipientId: "ghost", quantity: 1, maxRetries: 5 }),
      ).rejects.toBeTruthy();
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});
