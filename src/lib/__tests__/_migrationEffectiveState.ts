/**
 * Shared helper for regression tests that must reason about the *effective*
 * latest state of `supabase/migrations/`, not any single historical file.
 *
 * PostgreSQL applies migrations in filename order. For an idempotent object
 * (`CREATE OR REPLACE FUNCTION`, `CREATE POLICY ... OR REPLACE`,
 * `GRANT`/`REVOKE`) only the *last* matching statement wins. Tests that
 * pattern-match the whole concatenated corpus therefore keep passing after
 * a superseding migration silently removes a required rule.
 *
 * These helpers give tests a way to ask "what does the current schema
 * actually enforce?" while still being pure/deterministic (no DB call).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIG_DIR = join(process.cwd(), "supabase", "migrations");

let cache: string | null = null;
export function allMigrationsSql(): string {
  if (cache) return cache;
  cache = readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => `-- >>> FILE: ${f}\n${readFileSync(join(MIG_DIR, f), "utf8")}`)
    .join("\n\n");
  return cache;
}

/**
 * Extract the LAST `CREATE OR REPLACE FUNCTION public.<name>(...) ... $$;`
 * (or `$function$;`) block. Uses non-greedy matching bounded on the
 * plpgsql end-marker so overlapping function bodies do not bleed together.
 */
export function latestFunctionDefinition(name: string): string {
  const sql = allMigrationsSql();
  const re = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\b[\\s\\S]*?\\$(?:function)?\\$;`,
    "g",
  );
  let last: string | null = null;
  for (const m of sql.matchAll(re)) last = m[0];
  if (!last) throw new Error(`no CREATE OR REPLACE FUNCTION public.${name} in migrations`);
  return last;
}

/**
 * Returns true when the LAST GRANT/REVOKE touching (privilege, role, table)
 * is a GRANT — i.e. the privilege is currently held. Whole-table grants
 * only; column-level grants have a different syntax and are handled in
 * `lastColumnGrantHolds`.
 */
export function lastTableGrantHolds(
  privilege: string,
  role: string,
  qualifiedTable: string,
): boolean {
  const sql = allMigrationsSql();
  const t = qualifiedTable.replace(".", "\\.");
  // Match either the specific privilege OR `GRANT ALL` (which implies it).
  // Column-scoped grants (`GRANT SELECT (col1, col2) ...`) are skipped —
  // they satisfy PostgREST for the listed columns but do NOT satisfy a
  // whole-table capability requirement.
  const grantRe = new RegExp(
    `GRANT\\b[^;]*?\\b(?:${privilege}|ALL)\\b[^;]*?ON\\s+(?:TABLE\\s+)?${t}\\b[^;]*?\\bTO\\b[^;]*?\\b${role}\\b[^;]*;`,
    "gi",
  );
  const revokeRe = new RegExp(
    `REVOKE\\b[^;]*?\\b(?:${privilege}|ALL)\\b[^;]*?ON\\s+(?:TABLE\\s+)?${t}\\b[^;]*?\\bFROM\\b[^;]*?\\b${role}\\b[^;]*;`,
    "gi",
  );
  let lastGrant = -1, lastRevoke = -1;
  for (const m of sql.matchAll(grantRe)) {
    const snippet = m[0];
    // Skip column-scoped grants.
    if (/\b(?:SELECT|INSERT|UPDATE|REFERENCES)\s*\(/i.test(snippet)) continue;
    lastGrant = Math.max(lastGrant, m.index ?? -1);
  }
  for (const m of sql.matchAll(revokeRe)) lastRevoke = Math.max(lastRevoke, m.index ?? -1);
  return lastGrant > lastRevoke;
}

/**
 * Returns true when the LAST GRANT/REVOKE touching a WHOLE-table privilege
 * (`GRANT SELECT ON public.foo TO role`) is a REVOKE — i.e. the role is
 * currently blocked from that whole-table privilege. Column-level grants
 * targeting individual columns are NOT counted as whole-table grants.
 */
export function anonWholeTableSelectIsBlocked(qualifiedTable: string): boolean {
  const sql = allMigrationsSql();
  const t = qualifiedTable.replace(".", "\\.");
  // GRANT SELECT ON public.foo TO anon  — no column list after SELECT.
  const wholeGrant = new RegExp(
    `GRANT\\s+SELECT(?:\\s*,\\s*[A-Z]+)*\\s+ON\\s+(?:TABLE\\s+)?${t}\\b[^;]*\\bTO\\b[^;]*\\banon\\b[^;]*;`,
    "gi",
  );
  const wholeRevoke = new RegExp(
    `REVOKE\\s+(?:ALL|SELECT(?:\\s*,\\s*[A-Z]+)*)\\s+ON\\s+(?:TABLE\\s+)?${t}\\b[^;]*\\bFROM\\b[^;]*\\banon\\b[^;]*;`,
    "gi",
  );
  let lastGrant = -1, lastRevoke = -1;
  for (const m of sql.matchAll(wholeGrant)) {
    // Skip column-scoped grants: they look like GRANT SELECT (col1, col2) ...
    const snippet = sql.slice(m.index ?? 0, (m.index ?? 0) + m[0].length);
    if (/SELECT\s*\(/i.test(snippet)) continue;
    lastGrant = Math.max(lastGrant, m.index ?? -1);
  }
  for (const m of sql.matchAll(wholeRevoke)) lastRevoke = Math.max(lastRevoke, m.index ?? -1);
  // If there is no grant at all, treat as blocked (nothing to revoke).
  if (lastGrant === -1) return true;
  return lastRevoke > lastGrant;
}
