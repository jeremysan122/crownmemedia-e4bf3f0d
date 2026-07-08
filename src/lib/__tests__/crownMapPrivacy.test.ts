import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * Source-level contract tests for the Crown Map Points privacy hardening.
 *
 * These lock the migration that:
 *   1. Drops the unsafe "any signed-in user can read every row" policy.
 *   2. Adds owner-or-admin SELECT + admin-only write policies.
 *   3. Adds a safe public RPC `get_crown_map_public_points` that returns
 *      ONLY aggregate/coarse fields (no user_id, no exact lat/lng).
 *   4. Adds an owner-only RPC `get_my_crown_map_points`.
 *   5. Adds a service-role/admin refresh job `refresh_crown_map_points`
 *      that never caches exact coords.
 *
 * They read the migration files directly so the contract is enforced
 * without needing a live DB in CI.
 */

const MIG_DIR = resolve(process.cwd(), "supabase/migrations");
const ALL_MIG = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
  .join("\n\n-- FILE BREAK --\n\n");

const DOC = readFileSync(resolve(process.cwd(), "docs/CROWN_MAP.md"), "utf8");

describe("crown_map_points privacy hardening", () => {
  it("drops the unsafe 'authenticated readable' policy", () => {
    expect(ALL_MIG).toMatch(
      /DROP POLICY IF EXISTS "crown_map_points readable to signed-in users" ON public\.crown_map_points/,
    );
  });

  it("adds owner-or-admin SELECT policy on crown_map_points", () => {
    expect(ALL_MIG).toMatch(/CREATE POLICY "cmp_select_own_or_admin"/);
    expect(ALL_MIG).toMatch(/auth\.uid\(\) = user_id/);
    expect(ALL_MIG).toMatch(/has_role\(auth\.uid\(\), 'security_admin'::public\.app_role\)/);
  });

  it("locks writes on crown_map_points to admins", () => {
    expect(ALL_MIG).toMatch(/CREATE POLICY "cmp_write_admin_only"/);
  });

  it("revokes anon access and grants only SELECT to authenticated", () => {
    expect(ALL_MIG).toMatch(/REVOKE ALL ON public\.crown_map_points FROM anon/);
    expect(ALL_MIG).toMatch(/GRANT SELECT ON public\.crown_map_points TO authenticated/);
    expect(ALL_MIG).toMatch(/GRANT ALL\s+ON public\.crown_map_points TO service_role/);
  });

  it("defines the safe public RPC without user_id or exact lat/lng in its return signature", () => {
    const rpc = ALL_MIG.match(
      /CREATE OR REPLACE FUNCTION public\.get_crown_map_public_points[\s\S]*?\$\$;/,
    )?.[0];
    expect(rpc, "get_crown_map_public_points must exist").toBeTruthy();
    // Return columns must be the coarse set only.
    expect(rpc!).toMatch(/coarse_lat\s+numeric/);
    expect(rpc!).toMatch(/coarse_lng\s+numeric/);
    expect(rpc!).toMatch(/refreshed_at\s+timestamptz/);
    // Must NOT return user_id or raw lat/lng columns.
    expect(rpc!).not.toMatch(/RETURNS TABLE[\s\S]*?user_id/);
    expect(rpc!).not.toMatch(/RETURNS TABLE[\s\S]*?\blat\s+double/);
    expect(rpc!).not.toMatch(/RETURNS TABLE[\s\S]*?\blng\s+double/);
    // Coordinates must be rounded (coarsened).
    expect(rpc!).toMatch(/round\(avg\(p\.lat\)::numeric, 1\)/);
    expect(rpc!).toMatch(/round\(avg\(p\.lng\)::numeric, 1\)/);
  });

  it("grants EXECUTE on the safe public RPC to anon + authenticated", () => {
    expect(ALL_MIG).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_crown_map_public_points\(text, text, int\) TO anon, authenticated/,
    );
  });

  it("defines an owner-only RPC restricted to authenticated", () => {
    expect(ALL_MIG).toMatch(/CREATE OR REPLACE FUNCTION public\.get_my_crown_map_points\(\)/);
    expect(ALL_MIG).toMatch(/WHERE user_id = auth\.uid\(\)/);
    expect(ALL_MIG).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_my_crown_map_points\(\) TO authenticated/,
    );
  });

  it("defines a refresh job that never caches exact coordinates and is admin/service-only", () => {
    const fn = ALL_MIG.match(
      /CREATE OR REPLACE FUNCTION public\.refresh_crown_map_points\(\)[\s\S]*?\$\$;/,
    )?.[0];
    expect(fn, "refresh_crown_map_points must exist").toBeTruthy();
    // Auth gate: signed-in callers must be admin; service_role has auth.uid() = NULL.
    expect(fn!).toMatch(/RAISE EXCEPTION 'not authorized'/);
    // Coords must be inserted as NULL — no exact caching.
    expect(fn!).toMatch(/NULL::double precision,\s*--?\s*exact coords intentionally not cached|NULL::double precision,\s*\n\s*NULL::double precision/);
    expect(ALL_MIG).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.refresh_crown_map_points\(\) TO service_role/,
    );
  });
});

describe("CROWN_MAP.md documents the new privacy posture", () => {
  it("marks crown_map_points as activated with the privacy-safe posture", () => {
    expect(DOC).toContain("`public.crown_map_points` is now **activated**");
    expect(DOC).toContain("get_crown_map_public_points");
    expect(DOC).toContain("get_my_crown_map_points");
    expect(DOC).toContain("refresh_crown_map_points");
  });

  it("lists what is never publicly exposed", () => {
    expect(DOC).toMatch(/Never publicly exposed:.*user_id.*exact.*lat/i);
  });
});
