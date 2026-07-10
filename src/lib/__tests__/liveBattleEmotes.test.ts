// Wave 3 — Emote helper contract:
// - emoteErrorMessage classifies known error codes to friendly copy or null.
// - sendLiveBattleEmote returns void on success and surfaces server errors.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { emoteErrorMessage, sendLiveBattleEmote } from "@/lib/liveBattles";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

describe("emoteErrorMessage", () => {
  it("maps not_authenticated to a sign-in prompt", () => {
    expect(emoteErrorMessage(new Error("not_authenticated"))).toMatch(/sign in/i);
  });
  it("returns null when the battle is not live (silent)", () => {
    expect(emoteErrorMessage(new Error("battle_not_live"))).toBeNull();
    expect(emoteErrorMessage(new Error("battle_not_found"))).toBeNull();
  });
  it("maps rate-limit to a slow-down toast", () => {
    expect(emoteErrorMessage(new Error("rate_limited:5"))).toMatch(/slow down/i);
  });
  it("maps blocked to a can't-react message", () => {
    expect(emoteErrorMessage(new Error("blocked"))).toMatch(/can't react/i);
  });
});

describe("sendLiveBattleEmote", () => {
  beforeEach(() => { rpcMock.mockReset(); });
  it("calls the SECURITY DEFINER RPC with battle id + kind", async () => {
    rpcMock.mockResolvedValueOnce({ error: null });
    await sendLiveBattleEmote("battle-1", "heart");
    expect(rpcMock).toHaveBeenCalledWith("live_battle_send_emote", {
      _battle_id: "battle-1", _kind: "heart",
    });
  });
  it("throws when the RPC surfaces an error", async () => {
    rpcMock.mockResolvedValueOnce({ error: new Error("rate_limited:8") });
    await expect(sendLiveBattleEmote("battle-1", "crown")).rejects.toThrow(/rate_limited/);
  });
});
