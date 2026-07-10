import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LobbyReadyPanel from "@/components/battles/LobbyReadyPanel";
import type { LiveBattleRow } from "@/lib/liveBattles";

const setReady = vi.fn();
const startFromLobby = vi.fn();

vi.mock("@/lib/liveBattles", async () => {
  const actual = await vi.importActual<any>("@/lib/liveBattles");
  return {
    ...actual,
    setLobbyReady: (...args: any[]) => setReady(...args),
    startBattleFromLobby: (...args: any[]) => startFromLobby(...args),
    lobbyErrorMessage: (e: any) => (e as Error).message ?? "error",
  };
});
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

const baseBattle: LiveBattleRow = {
  id: "b1", host_id: "u-host", opponent_id: "u-opp", room_name: "room1",
  status: "pending", duration_seconds: 300, started_at: null, ends_at: null,
  host_votes: 0, opponent_votes: 0, winner_id: null, ended_reason: null,
  is_hidden: false, created_at: new Date().toISOString(),
  host_ready: false, opponent_ready: false,
};

describe("LobbyReadyPanel", () => {
  beforeEach(() => { setReady.mockReset(); startFromLobby.mockReset(); });

  it("host cannot start until both ready", () => {
    render(<LobbyReadyPanel battle={baseBattle} currentUserId="u-host" hostName="H" opponentName="O" />);
    const goLive = screen.getByRole("button", { name: /go live/i });
    expect((goLive as HTMLButtonElement).disabled).toBe(true);
  });

  it("host can start when both ready", async () => {
    startFromLobby.mockResolvedValue({ ...baseBattle, status: "live" });
    render(
      <LobbyReadyPanel
        battle={{ ...baseBattle, host_ready: true, opponent_ready: true }}
        currentUserId="u-host" hostName="H" opponentName="O"
      />,
    );
    const goLive = screen.getByRole("button", { name: /go live/i });
    expect((goLive as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(goLive);
    await waitFor(() => expect(startFromLobby).toHaveBeenCalledWith("b1"));
  });

  it("opponent toggle flips own ready flag", async () => {
    setReady.mockResolvedValue(baseBattle);
    render(<LobbyReadyPanel battle={baseBattle} currentUserId="u-opp" hostName="H" opponentName="O" />);
    fireEvent.click(screen.getByRole("button", { name: /i'm ready/i }));
    await waitFor(() => expect(setReady).toHaveBeenCalledWith("b1", true));
  });

  it("shows waiting message via aria-live when not both ready", () => {
    render(<LobbyReadyPanel battle={baseBattle} currentUserId="u-host" hostName="H" opponentName="O" />);
    const status = screen.getByText(/waiting for both battlers/i);
    expect(status.getAttribute("aria-live")).toBe("polite");
  });
});
