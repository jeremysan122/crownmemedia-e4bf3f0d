// Human-friendly formatting for achievement requirement_logic payloads.
//
// achievement_definitions.requirement_logic is stored as:
//   { metrics: { <metric_key>: <target_number> }, gates?: {...} }
//
// The frame gallery shows the exact measurable achievement, so we translate
// snake_case metric keys into readable English and format the target number.

const OVERRIDES: Record<string, string> = {
  qualifying_posts: "Publish qualifying posts",
  qualified_battle_wins: "Win qualified battles",
  qualified_votes_received: "Receive qualified votes",
  legitimate_followers: "Reach legitimate followers",
  crown_defenses: "Successfully defend the crown",
  city_crown_hold_days: "Hold a city crown (days)",
  state_crown_hold_days: "Hold a state crown (days)",
  national_crown_hold_days: "Hold a national crown (days)",
  global_crown_hold_days: "Hold a global crown (days)",
  qualified_content_views: "Earn qualified content views",
  qualified_live_views: "Earn qualified live views",
  qualified_profile_views: "Earn qualified profile views",
  qualified_comments_and_reactions: "Receive qualified comments & reactions",
  qualified_live_battle_wins: "Win qualified live battles",
  qualified_referrals: "Convert qualified referrals",
  active_referrals: "Maintain active referrals",
  active_referrals_30d: "Maintain 30-day active referrals",
  active_referrals_60d: "Maintain 60-day active referrals",
  active_referrals_90d: "Maintain 90-day active referrals",
  win_streak: "Reach a battle win streak",
  activity_streak_days: "Reach a daily activity streak (days)",
  qualified_activity_streak_days: "Reach a qualified activity streak (days)",
  completed_battles: "Complete battles",
  live_battles_participated: "Participate in live battles",
  simultaneous_crowns: "Hold simultaneous crowns",
  city_crowns_total: "Earn city crowns",
  crowns_in_categories: "Earn crowns across categories",
  legitimate_shares: "Earn legitimate shares",
  legitimate_saves: "Earn legitimate saves",
  founder_active_days: "Founder active days",
  founder_days: "Days as a Founder",
  active_years: "Active years on CrownMe",
  active_categories: "Active categories",
  active_competition_days: "Active competition days",
  qualified_active_days: "Qualified active days",
  distinct_active_weeks: "Distinct active weeks",
  account_age_days: "Account age (days)",
  battle_top50_cumulative_days: "Days in Battle Top 50",
  city_top10_cumulative_days: "Days in City Top 10",
  national_top25_cumulative_days: "Days in National Top 25",
  global_top100_cumulative_days: "Days in Global Top 100",
  global_top100_consecutive_days: "Consecutive days in Global Top 100",
  global_top250_cumulative_days: "Days in Global Top 250",
  global_top10_category_seasons: "Global Top 10 category seasons",
  top1_creator_quarters: "#1 creator quarters",
  wins_in_all_master_categories: "Wins across all master categories",
  seasonal_championship_wins: "Seasonal championship wins",
  annual_founder_event_wins: "Annual Founder event wins",
  hidden_founder_missions_completed: "Hidden Founder missions completed",
  missions_span_years: "Mission span (years)",
  accepted_beta_contributions: "Accepted beta contributions",
  paid_royal_periods_completed: "Royal Pass periods completed",
  referrals_became_paid_royal: "Referrals who became Royal Pass",
  joined_during_founding_period: "Joined during the Founding period",
  first_100_founders: "Among the first 100 Founders",
  verified: "Verified account",
  no_serious_violation: "No serious violations",
  months_without_serious_violation: "Months without a serious violation",
  only_approved_freezes: "Only approved account freezes",
  serious_strike_during_streak: "Serious strike during streak",
  payment_disputes_open: "Open payment disputes",
  single_crown_hold_days: "Longest single crown hold (days)",
  win_rate_min_pct: "Minimum win rate (%)",
  across_qualifying_posts: "Across qualifying posts",
};

function humanize(key: string): string {
  if (OVERRIDES[key]) return OVERRIDES[key];
  const spaced = key.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

export interface UnlockRequirement {
  key: string;
  label: string;
  target: number;
}

export function extractRequirements(requirementLogic: unknown): UnlockRequirement[] {
  const rl = (requirementLogic ?? {}) as { metrics?: Record<string, number> };
  const metrics = rl.metrics ?? {};
  return Object.entries(metrics)
    .filter(([, v]) => typeof v === "number")
    .map(([k, v]) => ({ key: k, label: humanize(k), target: v as number }));
}

export function formatRequirementLine(req: UnlockRequirement): string {
  // Boolean-style gates (verified, first_100_founders, ...) have target 1
  const isFlag =
    req.target === 1 &&
    (req.key === "verified" ||
      req.key === "first_100_founders" ||
      req.key === "joined_during_founding_period" ||
      req.key === "no_serious_violation" ||
      req.key === "only_approved_freezes");
  if (isFlag) return req.label;
  return `${req.label}: ${formatNumber(req.target)}`;
}
