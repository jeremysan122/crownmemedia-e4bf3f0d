import { supabase } from "@/integrations/supabase/client";

export const GROWTH_GOAL = 1_000_000;

export const GROWTH_MILESTONES = [
  100, 500, 1_000, 5_000, 10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000,
] as const;

export interface UserGrowthSummary {
  total_users: number;
  goal_users: number;
  percent_complete: number;
  users_remaining: number;
  signups_24h: number;
  signups_7d: number;
  signups_30d: number;
  avg_daily_signups_7d: number;
  estimated_days_to_goal: number | null;
  captured_at: string;
}

export const EMPTY_GROWTH: UserGrowthSummary = {
  total_users: 0,
  goal_users: GROWTH_GOAL,
  percent_complete: 0,
  users_remaining: GROWTH_GOAL,
  signups_24h: 0,
  signups_7d: 0,
  signups_30d: 0,
  avg_daily_signups_7d: 0,
  estimated_days_to_goal: null,
  captured_at: new Date(0).toISOString(),
};

/** Normalizes RPC output — clamps percent to 0..100 and remaining to >=0. */
export function normalizeGrowth(raw: Partial<UserGrowthSummary> | null | undefined): UserGrowthSummary {
  const merged = { ...EMPTY_GROWTH, ...(raw ?? {}) } as UserGrowthSummary;
  merged.total_users = Math.max(0, Number(merged.total_users) || 0);
  merged.goal_users = Number(merged.goal_users) || GROWTH_GOAL;
  merged.users_remaining = Math.max(0, merged.goal_users - merged.total_users);
  const pct = merged.goal_users > 0 ? (merged.total_users / merged.goal_users) * 100 : 0;
  merged.percent_complete = Math.max(0, Math.min(100, Number(pct.toFixed(4))));
  merged.avg_daily_signups_7d = Math.max(0, Number(merged.avg_daily_signups_7d) || 0);
  if (!merged.avg_daily_signups_7d || merged.users_remaining <= 0) {
    merged.estimated_days_to_goal = merged.users_remaining <= 0 ? 0 : null;
  } else {
    merged.estimated_days_to_goal = Math.max(
      0,
      Number((merged.users_remaining / merged.avg_daily_signups_7d).toFixed(1)),
    );
  }
  return merged;
}

export async function fetchUserGrowthSummary(): Promise<{
  data: UserGrowthSummary;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase.rpc("admin_user_growth_summary" as never);
    if (error) return { data: EMPTY_GROWTH, error: error.message };
    return { data: normalizeGrowth(data as Partial<UserGrowthSummary>), error: null };
  } catch (e) {
    return { data: EMPTY_GROWTH, error: (e as Error)?.message ?? "Query failed" };
  }
}
