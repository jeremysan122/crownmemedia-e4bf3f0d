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
  return wholeTableSelectIsBlocked(qualifiedTable, "anon");
}

/**
 * Same as `anonWholeTableSelectIsBlocked` but parameterized by role. Used to
 * lock the least-privilege contract that authenticated must NOT hold
 * whole-table SELECT on `posts` (only a column allowlist).
 */
export function wholeTableSelectIsBlocked(
  qualifiedTable: string,
  role: string,
): boolean {
  const sql = allMigrationsSql();
  const t = qualifiedTable.replace(".", "\\.");
  const r = role.replace(/[^a-z_]/gi, "");
  const wholeGrant = new RegExp(
    `GRANT\\s+SELECT(?:\\s*,\\s*[A-Z]+)*\\s+ON\\s+(?:TABLE\\s+)?${t}\\b[^;]*\\bTO\\b[^;]*\\b${r}\\b[^;]*;`,
    "gi",
  );
  const wholeRevoke = new RegExp(
    `REVOKE\\s+(?:ALL|SELECT(?:\\s*,\\s*[A-Z]+)*)\\s+ON\\s+(?:TABLE\\s+)?${t}\\b[^;]*\\bFROM\\b[^;]*\\b${r}\\b[^;]*;`,
    "gi",
  );
  let lastGrant = -1, lastRevoke = -1;
  for (const m of sql.matchAll(wholeGrant)) {
    const snippet = sql.slice(m.index ?? 0, (m.index ?? 0) + m[0].length);
    // Skip column-scoped grants: they look like GRANT SELECT (col1, col2) ...
    if (/SELECT\s*\(/i.test(snippet)) continue;
    lastGrant = Math.max(lastGrant, m.index ?? -1);
  }
  for (const m of sql.matchAll(wholeRevoke)) lastRevoke = Math.max(lastRevoke, m.index ?? -1);
  if (lastGrant === -1) return true;
  return lastRevoke > lastGrant;
}

/**
 * Extract the LAST column-scoped `GRANT SELECT (col1, col2, ...) ON public.<table> TO <role>;`
 * for a role. Returns the set of column names in that grant, or null if none.
 * Column-level GRANTs are additive across statements, so downstream callers
 * that need the *effective* column set should union results from every match
 * — but the "last one wins" semantics apply for identity/allowlist assertions
 * because the current authorization migrations issue one canonical grant per
 * role per table (after a REVOKE that clears prior column grants).
 */
export function latestColumnSelectGrant(
  qualifiedTable: string,
  role: string,
): Set<string> | null {
  const sql = allMigrationsSql();
  const t = qualifiedTable.replace(".", "\\.");
  const r = role.replace(/[^a-z_]/gi, "");
  // `REVOKE SELECT ON public.<table> FROM <role>` (whole-table, no column
  // list) revokes both table-level AND all column-level SELECT in Postgres.
  // We therefore find the last such REVOKE and union every column grant
  // issued after it — that is the effective column allowlist.
  const revokeRe = new RegExp(
    `REVOKE\\s+(?:ALL|SELECT(?:\\s*,\\s*[A-Z]+)*)\\s+ON\\s+(?:TABLE\\s+)?${t}\\b[^;]*\\bFROM\\b[^;]*\\b${r}\\b[^;]*;`,
    "gi",
  );
  let lastRevokeIdx = -1;
  for (const m of sql.matchAll(revokeRe)) {
    const snippet = m[0];
    if (/SELECT\s*\(/i.test(snippet)) continue; // column-specific REVOKE doesn't wipe others
    lastRevokeIdx = Math.max(lastRevokeIdx, m.index ?? -1);
  }
  const grantRe = new RegExp(
    `GRANT\\s+SELECT\\s*\\(([^)]*)\\)\\s*ON\\s+(?:TABLE\\s+)?${t}\\b[^;]*\\bTO\\b[^;]*\\b${r}\\b[^;]*;`,
    "gi",
  );
  const union = new Set<string>();
  let matched = false;
  for (const m of sql.matchAll(grantRe)) {
    if ((m.index ?? -1) <= lastRevokeIdx) continue;
    matched = true;
    for (const c of m[1].split(/[,\s]+/).map((x) => x.trim()).filter(Boolean)) {
      union.add(c);
    }
  }
  return matched ? union : null;
}


