/**
 * Unit tests — LiveBattleVoteChip renders the correct pending / confirmed /
 * failed state with the right aria-busy signal for accessibility tools.
 *
 * These mirror the three transitions in `LiveBattle.tsx`'s handleVote:
 *   1. Optimistic bump → chip is "pending" with aria-busy="true".
 *   2. Realtime UPDATE reconciles → chip flashes "confirmed" with
 *      aria-busy="false".
 *   3. RPC failure → rollback + chip flips to "failed" (role="alert",
 *      aria-busy="false").
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LiveBattleVoteChip, { computeChipState } from "@/components/battles/LiveBattleVoteChip";

describe("LiveBattleVoteChip", () => {
  it("renders the pending chip with aria-busy while a vote is optimistic", () => {
    render(
      <LiveBattleVoteChip
        pendingChoice="host"
        voteConfirmedAt={null}
        voteFailedAt={null}
      />,
    );
    const chip = screen.getByTestId("vote-pending");
    expect(chip).toBeTruthy();
    expect(chip.getAttribute("aria-busy")).toBe("true");
    expect(chip.getAttribute("aria-live")).toBe("polite");
    expect(chip.textContent).toMatch(/counting/i);
  });

  it("renders the confirmed chip after realtime reconciles the vote", () => {
    render(
      <LiveBattleVoteChip
        pendingChoice={null}
        voteConfirmedAt={Date.now()}
        voteFailedAt={null}
      />,
    );
    const chip = screen.getByTestId("vote-confirmed");
    expect(chip).toBeTruthy();
    expect(chip.getAttribute("aria-busy")).toBe("false");
    expect(chip.textContent).toMatch(/confirmed/i);
    expect(screen.queryByTestId("vote-pending")).toBeNull();
  });

  it("renders the failed chip when the RPC rejects the vote", () => {
    render(
      <LiveBattleVoteChip
        pendingChoice={null}
        voteConfirmedAt={null}
        voteFailedAt={Date.now()}
      />,
    );
    const chip = screen.getByTestId("vote-failed");
    expect(chip).toBeTruthy();
    expect(chip.getAttribute("role")).toBe("alert");
    expect(chip.getAttribute("aria-live")).toBe("assertive");
    expect(chip.getAttribute("aria-busy")).toBe("false");
  });

  it("renders nothing when idle", () => {
    const { container } = render(
      <LiveBattleVoteChip
        pendingChoice={null}
        voteConfirmedAt={null}
        voteFailedAt={null}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("prefers pending over confirmed/failed when a bump is still on the wire", () => {
    render(
      <LiveBattleVoteChip
        pendingChoice="opponent"
        voteConfirmedAt={Date.now() - 100}
        voteFailedAt={Date.now() - 50}
      />,
    );
    expect(screen.getByTestId("vote-pending")).toBeTruthy();
    expect(screen.queryByTestId("vote-confirmed")).toBeNull();
    expect(screen.queryByTestId("vote-failed")).toBeNull();
  });
});

describe("computeChipState", () => {
  const base = { confirmedWindowMs: 1400, failedWindowMs: 4000 };

  it("returns idle when no signals are set", () => {
    expect(
      computeChipState(1000, {
        pendingChoice: null, voteConfirmedAt: null, voteFailedAt: null, ...base,
      }),
    ).toBe("idle");
  });

  it("returns pending whenever a choice is on the wire", () => {
    expect(
      computeChipState(1000, {
        pendingChoice: "host", voteConfirmedAt: 900, voteFailedAt: 800, ...base,
      }),
    ).toBe("pending");
  });

  it("expires the confirmed chip after the window elapses", () => {
    const now = 10_000;
    expect(
      computeChipState(now, {
        pendingChoice: null, voteConfirmedAt: now - 500, voteFailedAt: null, ...base,
      }),
    ).toBe("confirmed");
    expect(
      computeChipState(now, {
        pendingChoice: null, voteConfirmedAt: now - 2000, voteFailedAt: null, ...base,
      }),
    ).toBe("idle");
  });

  it("expires the failed chip after the window elapses", () => {
    const now = 10_000;
    expect(
      computeChipState(now, {
        pendingChoice: null, voteConfirmedAt: null, voteFailedAt: now - 100, ...base,
      }),
    ).toBe("failed");
    expect(
      computeChipState(now, {
        pendingChoice: null, voteConfirmedAt: null, voteFailedAt: now - 10_000, ...base,
      }),
    ).toBe("idle");
  });
});
