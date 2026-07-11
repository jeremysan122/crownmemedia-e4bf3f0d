/**
 * Wave 7 — LiveBattleGiftsOverlay safety tests.
 *
 * Locks two contracts:
 *   1. Gifts sent by a blocked sender never render a popup.
 *   2. The realtime channel is not resubscribed when the viewer's blocklist
 *      mutates — the callback reads through a ref.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import React from "react";

let handler: ((payload: any) => void) | null = null;
let subscribeCount = 0;
let removeCount = 0;
const blockedIdsBox: { set: Set<string> } = { set: new Set(["blocked-sender"]) };

vi.mock("@/integrations/supabase/client", () => {
  const channel = {
    on: (_evt: string, _filter: any, cb: (p: any) => void) => {
      handler = cb;
      return channel;
    },
    subscribe: () => {
      subscribeCount++;
      return channel;
    },
  };
  return {
    supabase: {
      channel: () => channel,
      removeChannel: () => { removeCount++; },
    },
  };
});

vi.mock("@/hooks/useViewerSafety", () => ({
  useViewerSafety: () => ({
    blockedIds: blockedIdsBox.set,
    mutedWords: [],
    ready: true,
    isBlocked: (id: string | null | undefined) => !!id && blockedIdsBox.set.has(id),
    matchesMutedWord: () => false,
    blockUser: vi.fn(), unblockUser: vi.fn(), muteWord: vi.fn(),
  }),
}));

vi.mock("@/components/gifts/GiftIcon", () => ({
  default: () => React.createElement("div", { "data-testid": "gift-icon" }),
}));

vi.mock("@/lib/gifts", () => ({
  findGift: (id: string) => ({ category: "low", animationType: "static", id }),
}));

import LiveBattleGiftsOverlay from "@/components/battles/LiveBattleGiftsOverlay";

describe("LiveBattleGiftsOverlay — viewer safety", () => {
  beforeEach(() => {
    handler = null; subscribeCount = 0; removeCount = 0;
    blockedIdsBox.set = new Set(["blocked-sender"]);
  });

  it("suppresses gift popups from blocked senders", async () => {
    const { container } = render(
      React.createElement(LiveBattleGiftsOverlay, {
        battleId: "b1", hostId: "host", opponentId: "opp",
      }),
    );
    expect(subscribeCount).toBe(1);
    expect(handler).toBeTruthy();

    act(() => {
      handler!({ new: {
        id: "g1", gift_id: "flower", gift_name: "Flower", quantity: 1,
        recipient_id: "host", sender_id: "blocked-sender",
      }});
    });
    expect(container.querySelectorAll('[data-testid="live-gift-popup"]').length).toBe(0);

    act(() => {
      handler!({ new: {
        id: "g2", gift_id: "flower", gift_name: "Flower", quantity: 2,
        recipient_id: "opp", sender_id: "friendly",
      }});
    });
    expect(container.querySelectorAll('[data-testid="live-gift-popup"]').length).toBe(1);
  });

  it("does not resubscribe the channel when blocklist changes", async () => {
    const { rerender } = render(
      React.createElement(LiveBattleGiftsOverlay, {
        battleId: "b1", hostId: "host", opponentId: "opp",
      }),
    );
    expect(subscribeCount).toBe(1);

    // Mutate the blocklist and force a re-render — subscribeCount must stay
    // at 1 because the overlay reads blocked ids through a ref.
    blockedIdsBox.set = new Set(["blocked-sender", "another"]);
    rerender(
      React.createElement(LiveBattleGiftsOverlay, {
        battleId: "b1", hostId: "host", opponentId: "opp",
      }),
    );
    expect(subscribeCount).toBe(1);
    expect(removeCount).toBe(0);
  });
});
