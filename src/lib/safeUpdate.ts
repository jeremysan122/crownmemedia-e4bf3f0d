import { supabase } from "@/integrations/supabase/client";

/**
 * Hard guard against unfiltered UPDATEs which trigger Postgres
 * "UPDATE requires a WHERE clause" errors.
 *
 * Always pass a non-empty `filters` object whose values are NOT undefined/null/empty string.
 *
 * Usage:
 *   await safeUpdate("profiles", { bio }, { id: user.id });
 */
type Filters = Record<string, string | number | boolean>;

export function assertFilters(filters: Filters, table?: string) {
  if (!filters || typeof filters !== "object") {
    throw new Error(`Refusing UPDATE on ${table ?? "table"}: filters object missing`);
  }
  const entries = Object.entries(filters);
  if (entries.length === 0) {
    throw new Error(`Refusing UPDATE on ${table ?? "table"}: no WHERE filters supplied`);
  }
  for (const [k, v] of entries) {
    if (v === undefined || v === null || v === "") {
      throw new Error(
        `Refusing UPDATE on ${table ?? "table"}: filter "${k}" is empty (got ${String(v)})`
      );
    }
  }
}

export async function safeUpdate<T extends Record<string, unknown>>(
  table: string,
  values: T,
  filters: Filters
) {
  assertFilters(filters, table);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = (supabase as any).from(table).update(values);
  for (const [k, v] of Object.entries(filters)) {
    q = q.eq(k, v);
  }
  return q;
}
