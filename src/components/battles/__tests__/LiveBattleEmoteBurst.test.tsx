// Wave 3 hardening — verify LiveBattleEmoteBurst uses ONE stable subscribed
// channel for both receiving broadcasts and sending its own, and tears it
// down on unmount.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

import LiveBattleEmoteBurst from "@/components/battles/LiveBattleEmoteBurst";

// ---- Mocks ----
const toastMock = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toastMock(...a) }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "u-1" } }) }));

const rpcMock = vi.fn();
const removeChannelMock = vi.fn();
const channelSendMock = vi.fn().mockResolvedValue(undefined);
const channelSubscribeMock = vi.fn();
const channelOnMock = vi.fn();
const channelFactory = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      rpc: (...a: unknown[]) => rpcMock(...a),
      channel: (...a: unknown[]) => channelFactory(...a),
      removeChannel: (...a: unknown[]) => removeChannelMock(...a),
    },
  };
});

function makeChannel() {
  const ch: Record<string, unknown> = {};
  ch.on = channelOnMock.mockImplementation(() => ch);
  ch.subscribe = channelSubscribeMock.mockImplementation(() => ch);
  ch.send = channelSendMock;
  return ch;
}

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ error: null });
  removeChannelMock.mockReset();
  channelSendMock.mockReset().mockResolvedValue(undefined);
  channelSubscribeMock.mockReset();
  channelOnMock.mockReset();
  channelFactory.mockReset().mockImplementation(() => makeChannel());
  toastMock.mockReset();
  cleanup();
});

describe("LiveBattleEmoteBurst channel lifecycle", () => {
  it("subscribes to battle_emotes:{id} exactly once on mount", () => {
    render(<LiveBattleEmoteBurst battleId="battle-1" enabled />);
    expect(channelFactory).toHaveBeenCalledTimes(1);
    expect(channelFactory).toHaveBeenCalledWith(
      "battle_emotes:battle-1",
      expect.objectContaining({ config: expect.any(Object) }),
    );
    expect(channelSubscribeMock).toHaveBeenCalledTimes(1);
  });

  it("removes the channel on unmount", () => {
    const { unmount } = render(<LiveBattleEmoteBurst battleId="battle-2" enabled />);
    unmount();
    expect(removeChannelMock).toHaveBeenCalledTimes(1);
  });

  it("reuses the subscribed channel for send — does NOT create a new one per tap", async () => {
    render(<LiveBattleEmoteBurst battleId="battle-3" enabled />);
    expect(channelFactory).toHaveBeenCalledTimes(1);

    const btn = screen.getByRole("button", { name: /send heart/i });
    await act(async () => { await userEvent.click(btn); });

    // Still only the one subscribed channel — no per-tap channel.
    expect(channelFactory).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("live_battle_send_emote", {
      _battle_id: "battle-3", _kind: "heart",
    });
    expect(channelSendMock).toHaveBeenCalledWith(expect.objectContaining({
      type: "broadcast", event: "emote",
      payload: expect.objectContaining({ kind: "heart" }),
    }));
  });

  it("renders a burst from a remote broadcast payload", () => {
    render(<LiveBattleEmoteBurst battleId="battle-4" enabled />);
    // The component registered an .on("broadcast", { event: "emote" }, cb)
    const call = channelOnMock.mock.calls.find(
      (c) => c[0] === "broadcast" && (c[1] as { event: string }).event === "emote",
    );
    expect(call).toBeTruthy();
    const cb = call![2] as (payload: { payload: { kind: string } }) => void;
    act(() => { cb({ payload: { kind: "crown" } }); });
    const layer = screen.getByTestId("emote-burst-layer");
    expect(layer.querySelectorAll("span").length).toBeGreaterThan(0);
  });

  it("maps rate-limit RPC failure to a Slow down toast", async () => {
    rpcMock.mockResolvedValueOnce({ error: new Error("rate_limited:5") });
    render(<LiveBattleEmoteBurst battleId="battle-5" enabled />);
    const btn = screen.getByRole("button", { name: /send fire/i });
    await act(async () => { await userEvent.click(btn); });
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      title: expect.stringMatching(/slow down/i),
    }));
  });

  it("stays silent (no toast) when RPC returns battle_not_live", async () => {
    rpcMock.mockResolvedValueOnce({ error: new Error("battle_not_live") });
    render(<LiveBattleEmoteBurst battleId="battle-6" enabled />);
    const btn = screen.getByRole("button", { name: /send clap/i });
    await act(async () => { await userEvent.click(btn); });
    expect(toastMock).not.toHaveBeenCalled();
  });
});
