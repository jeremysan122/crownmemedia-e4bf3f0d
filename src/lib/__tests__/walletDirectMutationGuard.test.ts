/**
 * Stage B — Source-contract guard.
 *
 * Ensures no migration introduces a direct debit against `public.wallets.shekel_balance`
 * outside the sanctioned primitives (`debit_shekels`) or the Royal refund/reversal
 * paths (`handle_royal_refund`, `handle_royal_dispute_*`, `refund_gift`). Credits
 * (`shekel_balance + ...`) are allowed for grant/bonus flows.
 *
 * If this test fails, route the new spending path through `public.debit_shekels`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIG_DIR = join(process.cwd(), "supabase", "migrations");

const ALLOWED_FUNCTION_NAMES = [
  "debit_shekels",
  "handle_royal_refund",
  "handle_royal_dispute_created",
  "handle_royal_dispute_won",
  "handle_royal_dispute_lost",
  "handle_royal_dispute_reinstated",
  "refund_gift",
  "process_royal_reversal", // internal helper reused by the dispute funnel
];

// Very small function-boundary parser: splits a SQL file at each
// `CREATE OR REPLACE FUNCTION public.<name>` and returns [{name, body}].
function splitFunctions(sql: string): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = [];
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-z_][a-z0-9_]*)/gi;
  let m: RegExpExecArray | null;
  const starts: Array<{ name: string; idx: number }> = [];
  while ((m = re.exec(sql)) !== null) starts.push({ name: m[1], idx: m.index });
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1].idx : sql.length;
    out.push({ name: s.name, body: sql.slice(s.idx, end) });
  }
  return out;
}

describe("Direct wallet debit guard", () => {
  it("only sanctioned functions may run `UPDATE public.wallets SET shekel_balance = shekel_balance -`", () => {
    const debitPattern = /UPDATE\s+public\.wallets\s+SET\s+shekel_balance\s*=\s*shekel_balance\s*-/i;

    const offenders: Array<{ file: string; fn: string | null }> = [];

    for (const file of readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort()) {
      const sql = readFileSync(join(MIG_DIR, file), "utf8");
      if (!debitPattern.test(sql)) continue;

      const fns = splitFunctions(sql);
      for (const fn of fns) {
        if (!debitPattern.test(fn.body)) continue;
        if (!ALLOWED_FUNCTION_NAMES.includes(fn.name)) {
          offenders.push({ file, fn: fn.name });
        }
      }

      // Detect top-level debits outside any function (rare but forbidden).
      const outside = fns.reduce((acc, fn) => acc.replace(fn.body, ""), sql);
      if (debitPattern.test(outside)) offenders.push({ file, fn: null });
    }

    expect(
      offenders,
      `Direct wallet debits found outside sanctioned functions. Route them through public.debit_shekels:\n${JSON.stringify(offenders, null, 2)}`,
    ).toEqual([]);
  });
});
