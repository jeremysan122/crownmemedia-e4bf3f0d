import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import LobbyCountdown from "@/components/battles/LobbyCountdown";

describe("LobbyCountdown", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("renders nothing when goLiveAt is null", () => {
    const { container } = render(<LobbyCountdown goLiveAt={null} />);
    expect(container.textContent).toBe("");
  });

  it("announces the countdown politely and fires onLive once", () => {
    const start = new Date("2026-07-10T20:00:00Z").getTime();
    vi.setSystemTime(start);
    const onLive = vi.fn();
    render(<LobbyCountdown goLiveAt={new Date(start + 3000).toISOString()} onLive={onLive} />);

    const announcer = screen.getByTestId("lobby-countdown");
    expect(announcer.getAttribute("aria-live")).toBe("polite");
    expect(announcer.textContent).toMatch(/Going live in 3/);

    act(() => { vi.advanceTimersByTime(1000); });
    expect(announcer.textContent).toMatch(/Going live in 2/);

    act(() => { vi.advanceTimersByTime(2000); });
    expect(onLive).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(2000); });
    expect(onLive).toHaveBeenCalledTimes(1);
  });

  it("starts at 5 when given a 5-second horizon and fires onLive exactly once", () => {
    const start = new Date("2026-07-10T20:00:00Z").getTime();
    vi.setSystemTime(start);
    const onLive = vi.fn();
    render(<LobbyCountdown goLiveAt={new Date(start + 5000).toISOString()} onLive={onLive} />);

    const announcer = screen.getByTestId("lobby-countdown");
    expect(announcer.textContent).toMatch(/Going live in 5/);

    act(() => { vi.advanceTimersByTime(1000); });
    expect(announcer.textContent).toMatch(/Going live in 4/);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(announcer.textContent).toMatch(/Going live in 3/);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(announcer.textContent).toMatch(/Going live in 2/);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(announcer.textContent).toMatch(/Going live in 1/);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onLive).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onLive).toHaveBeenCalledTimes(1);
  });
});
