// Standard Verification eligibility (free path, 10k+ followers).
//
// The server exposes two RPCs:
//
// - `verification_eligibility_progress(_user_id)` — read-only checklist for
//   the signed-in user. Returns a stable jsonb document so the UI can render
//   each requirement as a row with current/required values and a pass flag.
// - `request_standard_verification()` — auto-approves the caller if all
//   checks pass, otherwise returns the current progress so the UI can show
//   what's still missing. The paid `$1.99/mo` path is unchanged.
//
// This module is the only place that knows the wire shape — components and
// tests import these types instead of touching `.rpc` directly.

import { supabase } from "@/integrations/supabase/client";

export type EligibilityCheckKey =
  | "followers"
  | "profile_photo"
  | "bio"
  | "account_age"
  | "posts"
  | "battles_won"
  | "crowns_held"
  | "votes_received"
  | "good_standing"
  | "no_serious_violations"
  | "email_verified"
  | "phone_verified";

export interface EligibilityCheck {
  pass: boolean;
  label: string;
  /** Present for numeric checks (followers, account_age, posts, battles_won, crowns_held, votes_received). */
  current?: number;
  required?: number;
}

export interface EligibilityProgress {
  verified: boolean;
  eligible: boolean;
  checks: Partial<Record<EligibilityCheckKey, EligibilityCheck>>;
}

// Stable rendering order. `phone_verified` only appears when the platform
// has phone verification enabled — `orderedChecks` skips it if the server
// didn't return that key.
const CHECK_ORDER: EligibilityCheckKey[] = [
  "followers",
  "profile_photo",
  "bio",
  "account_age",
  "posts",
  "battles_won",
  "crowns_held",
  "votes_received",
  "good_standing",
  "no_serious_violations",
  "email_verified",
  "phone_verified",
];

/** Stable order so the UI doesn't reshuffle between renders. */
export function orderedChecks(p: EligibilityProgress): Array<{ key: EligibilityCheckKey } & EligibilityCheck> {
  return CHECK_ORDER.map((k) => ({ key: k, ...(p.checks?.[k] ?? { pass: false, label: k }) }));
}

/**
 * 0..1 fraction toward the threshold for numeric checks; 0 or 1 for booleans.
 * Used to draw progress bars next to follower / posts / account-age rows.
 */
export function checkFraction(c: EligibilityCheck): number {
  if (typeof c.current === "number" && typeof c.required === "number" && c.required > 0) {
    return Math.max(0, Math.min(1, c.current / c.required));
  }
  return c.pass ? 1 : 0;
}

/** How many of the checks currently pass. */
export function passedCount(p: EligibilityProgress): { passed: number; total: number } {
  const rows = orderedChecks(p);
  return { passed: rows.filter((r) => r.pass).length, total: rows.length };
}

export async function fetchEligibilityProgress(userId: string): Promise<EligibilityProgress> {
  const { data, error } = await supabase.rpc(
    "verification_eligibility_progress" as any,
    { _user_id: userId } as any,
  );
  if (error) throw error;
  return data as unknown as EligibilityProgress;
}

export type StandardVerificationResult =
  | { status: "approved"; request_id: string; progress: EligibilityProgress }
  | { status: "not_eligible"; progress: EligibilityProgress }
  | { status: "already_verified" };

export async function requestStandardVerification(): Promise<StandardVerificationResult> {
  const { data, error } = await supabase.rpc("request_standard_verification" as any);
  if (error) throw error;
  return data as unknown as StandardVerificationResult;
}
