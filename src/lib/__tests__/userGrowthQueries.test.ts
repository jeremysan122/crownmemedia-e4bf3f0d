import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

import { supabase } from "@/integrations/supabase/client";
import {
  normalizeGrowth,
  fetchUserGrowthSummary,
  GROWTH_GOAL,
  GROWTH_MILESTONES,
} from "@/lib/userGrowthQueries";

describe("userGrowthQueries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clamps percent to 100 and remaining to 0 when total exceeds goal", () => {
    const g = normalizeGrowth({ total_users: 2_000_000, goal_users: GROWTH_GOAL });
    expect(g.percent_complete).toBeLessThanOrEqual(100);
    expect(g.users_remaining).toBe(0);
    expect(g.estimated_days_to_goal).toBe(0);
  });

  it("handles zero signups safely (no ETA)", () => {
    const g = normalizeGrowth({ total_users: 10, avg_daily_signups_7d: 0 });
    expect(g.estimated_days_to_goal).toBeNull();
    expect(g.users_remaining).toBe(GROWTH_GOAL - 10);
  });

  it("computes ETA from average pace", () => {
    const g = normalizeGrowth({ total_users: 1000, avg_daily_signups_7d: 100 });
    expect(g.estimated_days_to_goal).toBeGreaterThan(0);
    expect(g.percent_complete).toBeGreaterThan(0);
    expect(g.percent_complete).toBeLessThan(1);
  });

  it("includes 1,000,000 milestone", () => {
    expect(GROWTH_MILESTONES).toContain(1_000_000);
  });

  it("returns friendly error and empty data on RPC failure", async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: { message: "not_authorized" },
    });
    const res = await fetchUserGrowthSummary();
    expect(res.error).toBe("not_authorized");
    expect(res.data.total_users).toBe(0);
    expect(res.data.percent_complete).toBe(0);
  });

  it("normalizes successful RPC response", async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        total_users: 2431,
        goal_users: 1_000_000,
        signups_24h: 12,
        signups_7d: 84,
        signups_30d: 300,
        avg_daily_signups_7d: 12,
      },
      error: null,
    });
    const res = await fetchUserGrowthSummary();
    expect(res.error).toBeNull();
    expect(res.data.total_users).toBe(2431);
    expect(res.data.users_remaining).toBe(1_000_000 - 2431);
    expect(res.data.estimated_days_to_goal).toBeGreaterThan(0);
  });

  it("calls the admin_user_growth_summary RPC name", async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: {}, error: null });
    await fetchUserGrowthSummary();
    expect(supabase.rpc).toHaveBeenCalledWith("admin_user_growth_summary");
  });
});
