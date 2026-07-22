import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migration = readFileSync(
  join(root, "supabase/migrations/20260717190000_security_scan_remediation.sql"),
  "utf8",
);
const giftCheckout = readFileSync(
  join(root, "supabase/functions/create-royal-pass-gift-checkout/index.ts"),
  "utf8",
);
const commsCron = readFileSync(
  join(root, "supabase/functions/royal-pass-comms-cron/index.ts"),
  "utf8",
);
const config = readFileSync(join(root, "supabase/config.toml"), "utf8");

describe("launch security remediation", () => {
  it("removes blanket profile reads and grants only an explicit public allowlist", () => {
    expect(migration).toMatch(
      /REVOKE SELECT ON public\.profiles FROM PUBLIC, anon, authenticated/i,
    );
    const allowlist = migration.match(
      /GRANT SELECT \(([\s\S]+?)\) ON public\.profiles TO anon, authenticated/i,
    )?.[1];
    expect(allowlist).toBeTruthy();
    for (const privateColumn of [
      "first_name", "last_name", "banned_reason", "deactivated_at",
      "deletion_requested_at", "who_can_dm", "who_can_mention", "who_can_tag",
      "quiet_hours_start", "verification_plan", "boost_tokens_balance",
    ]) {
      expect(allowlist).not.toMatch(new RegExp(`\\b${privateColumn}\\b`));
    }
    for (const publicColumn of ["id", "username", "profile_photo_url", "bio", "crowns_held"])
      expect(allowlist).toMatch(new RegExp(`\\b${publicColumn}\\b`));
  });

  it("keeps pending battle negotiations participant-only", () => {
    expect(migration).toMatch(/DROP POLICY IF EXISTS "Battles viewable by everyone"/);
    expect(migration).toMatch(/status IN \('active'::public\.battle_status, 'completed'::public\.battle_status\)/);
    expect(migration).toMatch(/auth\.uid\(\) = challenger_id/);
    expect(migration).toMatch(/auth\.uid\(\) = opponent_id/);
  });

  it("removes moderation reports from Realtime and pins the mutable search path", () => {
    expect(migration).toMatch(/ALTER PUBLICATION supabase_realtime DROP TABLE public\.live_battle_reports/);
    expect(migration).toMatch(
      /ALTER FUNCTION public\.collection_completion_title_slug\(text\)[\s\S]*SET search_path = pg_catalog, public/,
    );
  });

  it("uses a server-owned allowlisted Stripe return URL", () => {
    expect(giftCheckout).toMatch(/safeReturnUrl\(req, "\/royal-pass", "\/royal-pass"\)/);
    expect(giftCheckout).not.toMatch(/return_url\s*\?\?/);
  });

  it("requires a verified service-role JWT before the comms scan runs", () => {
    expect(config).toMatch(/\[functions\.royal-pass-comms-cron\][\s\S]{0,80}verify_jwt = true/);
    expect(commsCron).toMatch(/isAuthorizedCronRequest\(req\)/);
    expect(commsCron).toMatch(/status: 401/);
    expect(commsCron.indexOf("isAuthorizedCronRequest(req)")).toBeLessThan(
      commsCron.indexOf("const counts = await run()"),
    );
  });
});
