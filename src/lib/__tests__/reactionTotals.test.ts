import { describe, it, expect } from "vitest";
import { computeReactionTotalsForMessages, type ReactionLike } from "@/lib/reactionTotals";

/**
 * Verifies that realtime reaction inserts which arrive on a globally-shared
 * channel never affect the totals computed for a *different* DM thread.
 *
 * The `Messages` page subscribes to all `message_reactions` events and then
 * relies on `computeReactionTotalsForMessages` to scope counts to the
 * currently-loaded message ids of the active thread. Any reaction whose
 * message_id is NOT in that set must be ignored.
 */
describe("computeReactionTotalsForMessages — cross-thread isolation", () => {
  const threadAMessageIds = ["a-msg-1", "a-msg-2"];
  const threadBMessageIds = ["b-msg-1"];

  const baseline: ReactionLike[] = [
    { id: "r1", message_id: "a-msg-1", emoji: "👑" },
    { id: "r2", message_id: "a-msg-2", emoji: "🔥" },
  ];

  it("counts only reactions on loaded messages", () => {
    const totals = computeReactionTotalsForMessages(baseline, threadAMessageIds);
    expect(totals).toEqual([
      ["👑", 1],
      ["🔥", 1],
    ]);
  });

  it("realtime insert from another thread does NOT affect this thread's totals", () => {
    // Simulate a realtime INSERT for a message in thread B leaking into the
    // shared reactions array (this is what the page-level subscription sees).
    const withForeignInsert: ReactionLike[] = [
      ...baseline,
      { id: "r-foreign", message_id: "b-msg-1", emoji: "👑" },
    ];

    const totalsA = computeReactionTotalsForMessages(withForeignInsert, threadAMessageIds);
    const totalsB = computeReactionTotalsForMessages(withForeignInsert, threadBMessageIds);

    // Thread A totals are identical to baseline — foreign reaction ignored.
    expect(totalsA).toEqual([
      ["👑", 1],
      ["🔥", 1],
    ]);
    // Thread B counts the foreign reaction (it belongs there).
    expect(totalsB).toEqual([["👑", 1]]);
  });

  it("dedupes reactions arriving twice via realtime + snapshot fetch", () => {
    const duplicated: ReactionLike[] = [
      ...baseline,
      { id: "r1", message_id: "a-msg-1", emoji: "👑" }, // duplicate id
    ];
    const totals = computeReactionTotalsForMessages(duplicated, threadAMessageIds);
    expect(totals).toEqual([
      ["👑", 1],
      ["🔥", 1],
    ]);
  });

  it("ignores reactions whose message id is not yet loaded (pagination race)", () => {
    // User hasn't loaded the older message yet — its reaction must not count.
    const withUnloaded: ReactionLike[] = [
      ...baseline,
      { id: "r-old", message_id: "a-msg-old", emoji: "💎" },
    ];
    const totals = computeReactionTotalsForMessages(withUnloaded, threadAMessageIds);
    expect(totals.find(([e]) => e === "💎")).toBeUndefined();
  });
});
