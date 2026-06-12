import { describe, it, expect, vi, beforeEach } from "vitest";
import { isFatalDmShareError, sendDmShare } from "@/lib/dmShare";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

import { supabase } from "@/integrations/supabase/client";
const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

describe("isFatalDmShareError", () => {
  it("classifies business-rule failures as fatal (no retry)", () => {
    for (const m of [
      "Not authenticated",
      "Invalid recipient",
      "Invalid kind",
      "Missing post id",
      "Missing profile id",
      "Recipient unavailable",
      "Post unavailable",
      "Profile unavailable",
      "Cannot send to this recipient",
      "permission denied",
    ]) {
      expect(isFatalDmShareError(m)).toBe(true);
    }
  });
  it("treats transient errors as retriable", () => {
    expect(isFatalDmShareError("network timeout")).toBe(false);
    expect(isFatalDmShareError("503 service unavailable temporarily")).toBe(true); // matches /unavailable/
    expect(isFatalDmShareError("connection reset")).toBe(false);
  });
});

describe("sendDmShare", () => {
  beforeEach(() => rpc.mockReset());

  it("returns RPC payload on success", async () => {
    rpc.mockResolvedValueOnce({ data: { success: true, message_id: "m1", deduped: false }, error: null });
    const r = await sendDmShare({ recipientId: "r1", kind: "post_share", postId: "p1" });
    expect(r.message_id).toBe("m1");
    expect(rpc).toHaveBeenCalledWith("send_dm_share", expect.objectContaining({
      p_recipient_id: "r1", p_kind: "post_share", p_post_id: "p1",
    }));
  });

  it("does not retry on fatal errors", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error("Cannot send to this recipient") });
    await expect(sendDmShare({ recipientId: "r1", kind: "post_share", postId: "p1", maxRetries: 3 }))
      .rejects.toThrow(/Cannot send/);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("retries on transient and resolves", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error("network reset") });
    rpc.mockResolvedValueOnce({ data: { success: true, message_id: "m2" }, error: null });
    const r = await sendDmShare({ recipientId: "r1", kind: "profile_share", profileId: "u1", maxRetries: 2 });
    expect(r.message_id).toBe("m2");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("reuses provided idempotency key across retries", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error("network") });
    rpc.mockResolvedValueOnce({ data: { success: true, message_id: "m3" }, error: null });
    await sendDmShare({ recipientId: "r1", kind: "post_share", postId: "p1", idempotencyKey: "k-1", maxRetries: 2 });
    const keys = rpc.mock.calls.map((c) => (c[1] as { p_dedupe_key: string }).p_dedupe_key);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe("k-1");
  });
});
