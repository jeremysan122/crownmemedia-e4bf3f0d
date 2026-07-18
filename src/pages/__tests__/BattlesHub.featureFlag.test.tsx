// BattlesHub — verifies the feature-flag gating of Live surfaces.
// When live_battles_enabled is false, the Go Live CTA and Live mode card
// must be hidden; Post Battle must remain available.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/components/AppShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/useSeoMeta", () => ({ useSeoMeta: () => {} }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/components/battles/LiveNowStrip", () => ({ default: () => <div data-testid="livenow" /> }));
vi.mock("@/components/battles/PendingInvitesList", () => ({ default: () => null }));
vi.mock("@/components/battles/BattleHistoryList", () => ({ default: () => null }));
vi.mock("@/components/battles/TopBattlersWidget", () => ({ default: () => null }));
vi.mock("@/components/battles/CreateLiveBattleDialog", () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="create-live" /> : null),
}));
vi.mock("@/components/battles/ChallengeDialog", () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="challenge" /> : null),
}));

// Mock BattlesHub's own component tree elements it renders alongside the
// hub — UpcomingBattlesStrip runs a live query that expects an array.
vi.mock("@/components/battles/UpcomingBattlesStrip", () => ({ default: () => null }));

const buildQuery = (singleResult: any, listResult: any = { data: [], error: null }) => {
  const q: any = {
    select: () => q, eq: () => q, order: () => q, limit: () => q,
    or: () => q, in: () => q, gte: () => q, lte: () => q, is: () => q, not: () => q,
    maybeSingle: () => Promise.resolve(singleResult),
    single: () => Promise.resolve(singleResult),
    then: (r: any) => Promise.resolve(listResult).then(r),
  };
  return q;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => buildQuery({ data: { battle_wins: 3, battle_losses: 2 }, error: null, count: 0 }),
  },
}));

const flagVal = { v: true };
vi.mock("@/lib/featureFlags", () => ({
  isFeatureEnabled: vi.fn(async () => flagVal.v),
}));

async function renderHub() {
  const { default: BattlesHub } = await import("../BattlesHub");
  render(
    <MemoryRouter>
      <BattlesHub />
    </MemoryRouter>,
  );
}

describe("BattlesHub feature flag gating", () => {
  beforeEach(() => { vi.resetModules(); });

  it("renders hub and always shows Post Battle CTA", async () => {
    flagVal.v = true;
    await renderHub();
    await waitFor(() => expect(screen.getByText(/Start Post Battle/i)).toBeInTheDocument());
  });

  it("shows Go Live CTA when live_battles_enabled is true", async () => {
    flagVal.v = true;
    await renderHub();
    await waitFor(() => expect(screen.getAllByText(/Go Live Battle/i).length).toBeGreaterThan(0));
    expect(screen.getByText(/Real-time 1v1 head-to-head/i)).toBeInTheDocument();
  });

  it("does not present illustrative activity as live user data", async () => {
    flagVal.v = true;
    await renderHub();
    await waitFor(() => expect(screen.getByText(/Community voting/i)).toBeInTheDocument());
    expect(screen.getByText(/Camera \+ microphone/i)).toBeInTheDocument();
    expect(screen.queryByText(/620 vs 380/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/12h left/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/1\.2k watching/i)).not.toBeInTheDocument();
  });

  it("hides Go Live CTA and Live mode card when flag is off", async () => {
    flagVal.v = false;
    await renderHub();
    await waitFor(() => expect(screen.getByText(/Start Post Battle/i)).toBeInTheDocument());
    expect(screen.queryByText(/Go Live Battle/i)).not.toBeInTheDocument();
    // Live mode card title also absent
    expect(screen.queryByText(/Real-time 1v1 head-to-head/i)).not.toBeInTheDocument();
    // No "Coming Soon" copy anywhere
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });
});
