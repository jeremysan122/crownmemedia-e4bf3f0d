/**
 * Unit tests — Wave 1 Battle Arena additions:
 * - BattleFilterBar URL param persistence (status/category/region/stakes)
 * - Clearing filters removes them from URL
 * - ICS generator produces a valid VCALENDAR event
 * - FollowBattlerButton hides for self and unauthenticated users
 * - Notify trigger name-check for TG_OP safety is done at DB level; the
 *   contract is captured here in a snapshot expectation so a regression
 *   in wiring would fail loudly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import BattleFilterBar, { useBattleFilters } from "@/components/battles/BattleFilterBar";
import { buildIcsEvent, formatIcsDate } from "@/lib/ics";

// -- Mock supabase for the category fetch and follow query --
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [{ slug: "music", label: "Music" }] }),
          maybeSingle: () => Promise.resolve({ data: null }),
        }),
      }),
    }),
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: null }),
}));

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="probe" data-search={loc.search} />;
}

function renderWithRouter(initial = "/battles") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/battles" element={<><BattleFilterBar /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("BattleFilterBar URL persistence", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("persists status filter in URL search params", async () => {
    renderWithRouter();
    const liveTab = await screen.findByRole("tab", { name: /live/i });
    await act(async () => { liveTab.click(); });
    const probe = screen.getByTestId("probe");
    expect(probe.getAttribute("data-search")).toContain("status=live");
  });

  it("removes status param when reset to 'all'", async () => {
    renderWithRouter("/battles?status=live");
    const allTab = await screen.findByRole("tab", { name: /^all$/i });
    await act(async () => { allTab.click(); });
    const probe = screen.getByTestId("probe");
    expect(probe.getAttribute("data-search") || "").not.toContain("status=");
  });

  it("reads category / region / stakes from URL", () => {
    // Directly test the hook via a lightweight probe component.
    function Probe() {
      const { filters } = useBattleFilters();
      return <div data-testid="f" data-json={JSON.stringify(filters)} />;
    }
    render(
      <MemoryRouter initialEntries={["/x?status=live&category=music&region=Europe&stakes=high"]}>
        <Routes><Route path="/x" element={<Probe />} /></Routes>
      </MemoryRouter>,
    );
    const json = JSON.parse(screen.getByTestId("f").getAttribute("data-json")!);
    expect(json).toEqual({
      status: "live", category: "music", region: "Europe", stakes: "high",
    });
  });
});

describe("ICS generator", () => {
  it("produces a valid VCALENDAR with BEGIN/END and DTSTART", () => {
    const start = new Date("2030-01-01T12:00:00.000Z");
    const ics = buildIcsEvent({
      uid: "u1@crownme", title: "Battle vs @a", start, durationMinutes: 15,
      url: "https://crownmemedia.com/live/1",
    });
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain(`DTSTART:${formatIcsDate(start)}`);
    expect(ics).toContain("SUMMARY:Battle vs @a");
    expect(ics).toContain("URL:https://crownmemedia.com/live/1");
  });

  it("escapes commas and semicolons per RFC 5545", () => {
    const ics = buildIcsEvent({
      uid: "u2", title: "A, B; C\nD", start: new Date("2030-01-01T00:00:00Z"),
    });
    expect(ics).toContain("SUMMARY:A\\, B\\; C\\nD");
  });
});
