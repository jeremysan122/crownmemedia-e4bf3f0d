/**
 * Stage B — Source-contract guard.
 *
 * Ensures the effective (final) definition of every function that mutates
 * `public.wallets.shekel_balance` for a DEBIT (`shekel_balance = shekel_balance - ...`)
 * is one of the sanctioned functions: the centralized primitive `debit_shekels`
 * or the Royal reversal / refund funnel. Credits (`shekel_balance + ...`) are
 * allowed for grant/bonus flows.
 *
 * We iterate migrations in chronological order and keep the *last* body defined
 * for each `schema.function_name` — that's what Postgres actually executes.
 *
 * If this test fails, route the new spending path through `public.debit_shekels`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIG_DIR = join(process.cwd(), "supabase", "migrations");

const ALLOWED = new Set<string>([
  "public.debit_shekels",
  "public.handle_royal_refund",
  "public.handle_royal_dispute_created",
  "public.handle_royal_dispute_won",
  "public.handle_royal_dispute_lost",
  "public.handle_royal_dispute_reinstated",
  "public.refund_gift",
  "public.process_royal_reversal",
  // Provider-only refund funnels intentionally bypass user-spend checks so a
  // chargeback can record debt even after the purchased currency was spent.
  "public.reverse_provider_shekel_purchase",
  "public.reverse_stripe_one_time_purchase",
]);

// Debit against wallet balance, tolerant of newlines/whitespace between
// `UPDATE public.wallets` and `SET shekel_balance = shekel_balance - ...`.
const DEBIT_RE = /UPDATE\s+public\.wallets\b[\s\S]{0,120}?SET\s+shekel_balance\s*=\s*shekel_balance\s*-/i;

// Split a SQL blob into function bodies keyed by `schema.name`. A function
// body extends from its CREATE line to the next CREATE FUNCTION or EOF.
function splitFunctions(sql: string): Array<{ key: string; body: string; start: number; end: number }> {
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(public|private)\.([a-z_][a-z0-9_]*)/gi;
  const heads: Array<{ key: string; idx: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) heads.push({ key: `${m[1].toLowerCase()}.${m[2].toLowerCase()}`, idx: m.index });
  return heads.map((h, i) => ({
    key: h.key,
    body: sql.slice(h.idx, i + 1 < heads.length ? heads[i + 1].idx : sql.length),
    start: h.idx,
    end: i + 1 < heads.length ? heads[i + 1].idx : sql.length,
  }));
}

describe("Direct wallet debit guard (effective definitions only)", () => {
  it("no unsanctioned function's latest body debits public.wallets.shekel_balance directly", () => {
    const files = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
    const latest = new Map<string, { file: string; body: string }>();
    const topLevelOffenders: Array<{ file: string }> = [];

    for (const file of files) {
      const sql = readFileSync(join(MIG_DIR, file), "utf8");
      const fns = splitFunctions(sql);
      for (const fn of fns) latest.set(fn.key, { file, body: fn.body });

      // Detect debits outside any function body (would run at migration time).
      // Splice from last to first so earlier start/end offsets stay valid.
      let outside = sql;
      for (let i = fns.length - 1; i >= 0; i--) {
        outside = outside.slice(0, fns[i].start) + outside.slice(fns[i].end);
      }
      if (DEBIT_RE.test(outside)) topLevelOffenders.push({ file });
    }

    const fnOffenders: Array<{ fn: string; file: string }> = [];
    for (const [key, { file, body }] of latest) {
      if (!DEBIT_RE.test(body)) continue;
      if (ALLOWED.has(key)) continue;
      fnOffenders.push({ fn: key, file });
    }

    expect(
      { fnOffenders, topLevelOffenders },
      `Direct wallet debits found outside sanctioned functions. Route them through public.debit_shekels.`,
    ).toEqual({ fnOffenders: [], topLevelOffenders: [] });
  });
});
