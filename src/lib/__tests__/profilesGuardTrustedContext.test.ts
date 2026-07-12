/**
 * Wave 8.2b Stage 1 — profile guard trusted-context source contract.
 *
 * Locks the fix proven live via probe RPC + Edge Function:
 *   - Real PostgREST service-role → server-owned protected-field UPDATE
 *     persists (guard bypass by role GUC and JWT-claims role).
 *   - Untrusted contexts (psql sandbox_exec, authenticated user) still fall
 *     into the default reversion branch.
 *
 * Runtime proof captured in agent transcript:
 *   - Before fix: server_owned_change_persisted = false for both real
 *     service-role and psql — every protected column reverted.
 *   - After fix:  service_role path persists; psql sandbox_exec path still
 *     reverts (as intended — psql is NOT a trusted service-role context).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIG_DIR = join(process.cwd(), "supabase", "migrations");
const allSql = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
  .join("\n\n");

const latestGuard =
  allSql.match(
    /CREATE OR REPLACE FUNCTION public\.profiles_guard_protected_fields[\s\S]+?\$function\$;/g,
  )?.slice(-1)[0] ?? "";

describe("profiles_guard_protected_fields — trusted context recognition", () => {
  it("has a canonical body available", () => {
    expect(latestGuard).toBeTruthy();
    expect(latestGuard).toMatch(/SECURITY DEFINER/);
    expect(latestGuard).toMatch(/SET search_path TO 'public'/);
  });

  it("recognises the modern PostgREST role GUC", () => {
    expect(latestGuard).toMatch(
      /current_setting\('role',\s*true\)\s*=\s*'service_role'/,
    );
  });

  it("recognises the service_role claim inside the JSON JWT claims", () => {
    expect(latestGuard).toMatch(/current_setting\('request\.jwt\.claims',\s*true\)/);
    expect(latestGuard).toMatch(/::jsonb\s*\)\s*->>\s*'role'/);
    expect(latestGuard).toMatch(/jwt_role\s*=\s*'service_role'/);
  });

  it("preserves the legacy request.jwt.claim.role scalar GUC", () => {
    expect(latestGuard).toMatch(
      /current_setting\('request\.jwt\.claim\.role',\s*true\)\s*=\s*'service_role'/,
    );
  });

  it("requires MATCHED context: DB role GUC AND a service_role JWT claim (neither alone is trusted)", () => {
    // Extract service_role_context assignment block.
    const m = latestGuard.match(
      /service_role_context\s*:=\s*\(([\s\S]+?)\);/,
    );
    expect(m, "service_role_context assignment must exist").not.toBeNull();
    const body = m![1];
    // Must contain the DB role GUC check AND'd with the JWT claim disjunction.
    expect(body).toMatch(/role_guc\s*=\s*'service_role'/);
    expect(body).toMatch(/\bAND\b/);
    expect(body).toMatch(/jwt_role\s*=\s*'service_role'/);
    expect(body).toMatch(
      /current_setting\('request\.jwt\.claim\.role',\s*true\)\s*=\s*'service_role'/,
    );
    // Must NOT be a bare OR chain that treats jwt_role alone as trusted.
    // Sanity: there is no top-level OR immediately joining role_guc to jwt_role.
    expect(body).not.toMatch(/role_guc\s*=\s*'service_role'\s*OR\s+jwt_role/);
  });

  it("preserves admin/moderator bypass", () => {
    expect(latestGuard).toMatch(/has_role\(auth\.uid\(\)\s*,\s*'admin'::app_role\)/);
    expect(latestGuard).toMatch(/has_role\(auth\.uid\(\)\s*,\s*'moderator'::app_role\)/);
  });

  it("does NOT trust a bare custom GUC as sole authorization", () => {
    // A previous proposed fix used lovable.profiles_guard_bypass alone.
    // That was explicitly rejected — authenticated callers can set custom
    // GUCs. Ensure it is not present, or if present is not the sole check.
    const usesBareCustomGuc =
      /current_setting\('lovable\.profiles_guard_bypass'[^)]*\)\s*=\s*'1'/.test(latestGuard);
    if (usesBareCustomGuc) {
      // If it is used, must be paired with a service-role signal.
      expect(latestGuard).toMatch(
        /lovable\.profiles_guard_bypass[\s\S]{0,300}service_role/,
      );
    }
    expect(usesBareCustomGuc).toBe(false);
  });

  it("still reverts every Royal Pass and legacy protected column in the default branch", () => {
    for (const col of [
      "is_suspended",
      "crowns_held",
      "crowns_total",
      "battle_wins",
      "followers_count",
      "following_count",
      "votes_received",
      "votes_given",
      "is_banned",
      "banned_at",
      "banned_by",
      "banned_reason",
      "deactivated_at",
      "deletion_requested_at",
      "verified",
      "verified_at",
      "verification_plan",
      "boost_tokens_balance",
      "is_founder",
      "founder_granted_at",
      "founder_title",
      "royal_frame_variant",
    ]) {
      expect(
        latestGuard,
        `${col} must be reverted in the default (non-privileged) branch`,
      ).toMatch(new RegExp(`NEW\\.${col}\\s+:=\\s+OLD\\.${col}`));
    }
  });

  it("has a BEFORE UPDATE trigger installed on public.profiles", () => {
    expect(allSql).toMatch(
      /CREATE TRIGGER trg_profiles_guard_protected_fields[\s\S]*BEFORE UPDATE ON public\.profiles/,
    );
  });

  it("has no leftover diagnostic probe function reference in the latest migration state", () => {
    // Probe was created and dropped in the same turn cycle.
    const create =
      /CREATE OR REPLACE FUNCTION public\._lovable_probe_profile_guard_context/g;
    const drop =
      /DROP FUNCTION IF EXISTS public\._lovable_probe_profile_guard_context/g;
    const creates = (allSql.match(create) ?? []).length;
    const drops = (allSql.match(drop) ?? []).length;
    // Every create must be matched by a drop.
    expect(drops).toBeGreaterThanOrEqual(creates);
  });
});
