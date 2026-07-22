import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = join(
  root,
  "supabase/migrations/20260722160000_full_social_rls_permission_revision.sql",
);
const sql = readFileSync(migrationPath, "utf8");
const rollback = readFileSync(
  join(root, "supabase/rollback/20260722160000_full_social_rls_permission_revision_compat.sql"),
  "utf8",
);

describe("final social-platform RLS revision", () => {
  it("is a schema-wide default-deny baseline", () => {
    expect(sql).toMatch(/ALTER TABLE %I\.%I ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC/);
    expect(sql).toMatch(/permissive = 'PERMISSIVE'/);
    expect(sql).toMatch(/anon_read_tables constant text\[\]/);
    expect(sql).toMatch(/RLS disabled on:/);
  });

  it("keeps profile PII and moderation fields out of the public projection", () => {
    const view = sql.match(/CREATE VIEW public\.profiles_public[\s\S]*?FROM public\.profiles;/)?.[0] ?? "";
    expect(view).toContain("security_invoker = true");
    for (const protectedColumn of [
      "first_name", "last_name", "verification_plan", "banned_reason",
      "deletion_requested_at", "deactivated_at", "banned_by",
    ]) {
      expect(view).not.toMatch(new RegExp(`\\b${protectedColumn}\\b`));
    }
    expect(sql).not.toMatch(/GRANT SELECT ON public\.profiles TO (?:anon|authenticated)/);
    expect(sql).toMatch(/get_my_profile\(\) TO authenticated/);
    expect(sql).toContain("super_admin_required_for_privileged_target");
  });

  it("removes post internals and precise coordinates from browser reads", () => {
    const grant = sql.match(/GRANT SELECT \([\s\S]*?\) ON public\.posts TO anon, authenticated;/)?.[0] ?? "";
    expect(grant).toContain("post_location_precision");
    for (const protectedColumn of [
      "submission_key", "client_request_id", "moderation_notes", "moderated_by",
      "moderated_at", "sensitive_reason", "ai_searchable_text", "post_lat",
      "post_lng", "location_captured_at",
    ]) {
      expect(grant).not.toMatch(new RegExp(`\\b${protectedColumn}\\b`));
    }
    expect(sql).not.toMatch(/GRANT SELECT ON public\.posts TO/);
    expect(sql).toMatch(/has_column_privilege\('anon', 'public\.posts', 'post_lat', 'SELECT'\)/);
  });

  it("makes comments, reactions, bookmarks and votes inherit parent visibility", () => {
    expect(sql).toMatch(/anonymous comments inherit visible parent[\s\S]*EXISTS \(SELECT 1 FROM public\.posts/);
    expect(sql).toMatch(/authenticated comments inherit visible parent[\s\S]*EXISTS \(SELECT 1 FROM public\.posts/);
    expect(sql).toMatch(/votes insert on visible parent[\s\S]*EXISTS \(SELECT 1 FROM public\.posts/);
    expect(sql).toMatch(/comment reactions inherit visible comment[\s\S]*EXISTS \(SELECT 1 FROM public\.comments/);
    expect(sql).toMatch(/users add visible post bookmarks[\s\S]*EXISTS \(SELECT 1 FROM public\.posts/);
  });

  it("does not call authenticated-only admin helpers from anonymous policies", () => {
    const anonymousComments = sql.match(
      /CREATE POLICY "anonymous comments inherit visible parent"[\s\S]*?;\n\nCREATE POLICY/,
    )?.[0] ?? "";
    const anonymousFollows = sql.match(
      /CREATE POLICY "anonymous follow graph visible by relationship privacy"[\s\S]*?;\nCREATE POLICY/,
    )?.[0] ?? "";

    expect(anonymousComments).not.toContain("is_any_admin");
    expect(anonymousFollows).not.toContain("is_any_admin");
  });

  it("enforces blocks, account state, private follow approvals and DM preferences", () => {
    expect(sql).toMatch(/can_view_social_actor[\s\S]*is_banned[\s\S]*is_suspended[\s\S]*deactivated_at[\s\S]*deletion_requested_at/);
    expect(sql).toMatch(/can_view_social_actor[\s\S]*FROM public\.blocks/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.follow_requests/);
    expect(sql).toMatch(/REVOKE ALL ON public\.follows FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/set_follow_state\(_target_id uuid, _follow boolean\)/);
    expect(sql).toMatch(/respond_follow_request\(_request_id uuid, _accept boolean\)/);
    expect(sql).toMatch(/can_send_dm_to[\s\S]*who_can_dm = 'followers'/);
    expect(sql).toMatch(/trg_messages_enforce_social_permissions/);
  });

  it("keeps financial writes and provider identifiers off browser roles", () => {
    expect(sql).toMatch(/financial_tables text\[\][\s\S]*'wallets'[\s\S]*'shekel_ledger'[\s\S]*'stripe_events'/);
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.%I FROM anon, authenticated/);
    expect(sql).toMatch(/shekel_bundles[\s\S]*stripe_price_id[\s\S]*protected column is readable/);
  });

  it("uses RPC follow mutations throughout the browser client", () => {
    const clientFiles = [
      "src/pages/Profile.tsx",
      "src/pages/Onboarding.tsx",
      "src/pages/Discover.tsx",
      "src/components/profile/UserListDialog.tsx",
      "src/components/desktop/FeedRightRail.tsx",
    ].map((path) => readFileSync(join(root, path), "utf8")).join("\n");
    expect(clientFiles).toContain("changeFollowState");
    expect(clientFiles).not.toMatch(/from\(["']follows["']\)[\s\S]{0,100}\.(?:insert|delete)\(/);
  });

  it("provides a legacy-client rollback without restoring sensitive grants", () => {
    expect(rollback).toContain("DROP TRIGGER IF EXISTS trg_follows_enforce_approved_relationship");
    expect(rollback).toContain('DROP POLICY IF EXISTS "anonymous comments inherit visible parent"');
    expect(rollback).not.toMatch(/GRANT SELECT ON public\.(?:profiles|posts)/);
    expect(rollback).not.toMatch(/GRANT (?:INSERT|UPDATE|DELETE).*public\.(?:wallets|shekel_ledger)/);
  });
});
