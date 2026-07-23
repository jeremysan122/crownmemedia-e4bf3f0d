/**
 * Regression: mobile crown/vote failed with "Not permitted to modify
 * protected post field" (42501) after the July security migrations.
 *
 * Root cause: `posts_guard_protected_fields` and
 * `posts_prevent_protected_column_changes` both raised on protected-field
 * changes even when the change originated from a trusted nested trigger
 * (e.g. `votes_recalc` recomputing vote_count / crown_score). The sister
 * guard `posts_guard_owner_updates` already used `pg_trigger_depth() > 1`
 * as the escape hatch — the fix migration (20260723134713) applies the
 * same rule to the other two guards while keeping direct user tampering
 * blocked at depth 1.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIX = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260723134713_fix_posts_guard_trigger_depth_bypass.sql",
  ),
  "utf8",
);

function extractFn(name: string) {
  const re = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}[\\s\\S]+?\\$function\\$;`,
  );
  const match = FIX.match(re);
  if (!match) throw new Error(`function ${name} not found in fix migration`);
  return match[0];
}

describe("posts guard triggers allow nested recalc (depth > 1)", () => {
  for (const fn of [
    "posts_prevent_protected_column_changes",
    "posts_guard_protected_fields",
  ]) {
    it(`${fn} bypasses when pg_trigger_depth() > 1`, () => {
      const body = extractFn(fn);
      expect(body).toMatch(
        /IF\s+pg_trigger_depth\(\)\s*>\s*1\s+THEN\s+RETURN NEW;\s+END IF;/,
      );
    });
  }

  it("posts_prevent_protected_column_changes still blocks immutable identity swaps at every depth", () => {
    const body = extractFn("posts_prevent_protected_column_changes");
    // The immutable-column raise must appear ABOVE the depth bypass so it
    // catches a nested trigger trying to change user_id / id / created_at.
    const raiseIdx = body.indexOf("Cannot modify immutable post field");
    const bypassIdx = body.search(/pg_trigger_depth\(\)\s*>\s*1/);
    expect(raiseIdx).toBeGreaterThan(0);
    expect(bypassIdx).toBeGreaterThan(raiseIdx);
  });

  it("service_role and boost-sync short-circuits are preserved", () => {
    const body = extractFn("posts_prevent_protected_column_changes");
    expect(body).toMatch(/'service_role'/);
    expect(body).toMatch(/lovable\.boost_sync/);
  });
});
