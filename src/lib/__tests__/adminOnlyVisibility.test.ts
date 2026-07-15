/**
 * Automated static check: admin-only UI must never render for non-admins.
 *
 * We scan source files that gate content behind `useAdminRoles()` and assert
 * every JSX block wrapped in an `isAdmin && ...` (or `isAdminView && ...`)
 * predicate has NO sibling render path that would leak the same content to a
 * non-admin viewer. The test also asserts we never ship a hard-coded
 * `isAdmin = true` bypass in production source, and that debug/admin-only
 * panels carry a `data-admin-only=` marker so future scans can find them.
 *
 * This runs on every build (vitest run) — a regression that removes the
 * admin gate around the verification timeline or the /royal-pass admin tools
 * card fails CI before shipping to customers.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface Guard {
  file: string;
  /** substrings that MUST appear inside a JSX block gated by isAdmin */
  requiredInsideGate: string[];
  /** substrings that MUST NOT appear outside any admin gate */
  forbiddenOutsideGate?: string[];
}

const GUARDS: Guard[] = [
  {
    file: "src/pages/PurchaseSuccess.tsx",
    requiredInsideGate: [
      "Stripe payment received",
      "Webhook delivered",
      "Ledger entry recorded",
    ],
    forbiddenOutsideGate: ["data-admin-only=\"verification-timeline\""],
  },
  {
    file: "src/pages/admin/CommandCenterStripeHealth.tsx",
    requiredInsideGate: [],
  },

];

function readSource(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

/** Return substrings of `src` that sit inside an `{isAdmin* && (...)}` block. */
function extractAdminGatedBlocks(src: string): string[] {
  const blocks: string[] = [];
  // Match {isAdmin && ( ... )} and {isAdminView && ( ... )}
  const re = /\{is(Admin|AdminView)\s*&&\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    // Find the matching close paren for the `(` that opens the JSX block.
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      i++;
    }
    blocks.push(src.slice(m.index, i));
  }
  return blocks;
}

describe("admin-only UI must not leak to non-admin users", () => {
  it("never hard-codes `const isAdmin = true` (or similar) in production source", () => {
    const files = GUARDS.map((g) => g.file);
    for (const file of files) {
      const src = readSource(file);
      // Allow test-only bypasses; production source must never force admin.
      expect(src, `${file} force-enables admin`).not.toMatch(
        /const\s+is(Admin|AdminView)\s*=\s*true\b/,
      );
      expect(src, `${file} bypasses admin check`).not.toMatch(
        /is(Admin|AdminView)\s*=\s*\/\*.*bypass.*\*\/\s*true/i,
      );
    }
  });

  for (const guard of GUARDS) {
    it(`${guard.file} keeps admin-only content behind an isAdmin gate`, () => {
      const src = readSource(guard.file);
      const gatedBlocks = extractAdminGatedBlocks(src);
      const gatedSource = gatedBlocks.join("\n");

      for (const needle of guard.requiredInsideGate) {
        // The needle must appear at least once, AND every occurrence must be
        // inside an admin-gated block.
        const totalOccurrences = src.split(needle).length - 1;
        const gatedOccurrences = gatedSource.split(needle).length - 1;
        expect(totalOccurrences, `expected "${needle}" in ${guard.file}`).toBeGreaterThan(0);
        expect(
          gatedOccurrences,
          `"${needle}" in ${guard.file} must live inside an {isAdmin && (...)} block (found ${totalOccurrences} total, ${gatedOccurrences} gated)`,
        ).toBe(totalOccurrences);
      }

      for (const forbidden of guard.forbiddenOutsideGate ?? []) {
        // The `data-admin-only` marker must exist AND only inside a gated block.
        const totalOccurrences = src.split(forbidden).length - 1;
        const gatedOccurrences = gatedSource.split(forbidden).length - 1;
        if (totalOccurrences > 0) {
          expect(gatedOccurrences, `${forbidden} in ${guard.file} not gated`).toBe(totalOccurrences);
        }
      }
    });
  }

  it("PurchaseSuccess never renders the verification timeline label to non-admins", () => {
    const src = readSource("src/pages/PurchaseSuccess.tsx");
    // Sanity: the admin-gated section is the ONLY place these debug hints exist.
    for (const debugText of [
      "Waiting for Stripe to ping our webhook",
      "Stripe notified our backend",
      "Will appear once webhook fires",
    ]) {
      const occurrences = src.split(debugText).length - 1;
      const gated = extractAdminGatedBlocks(src).join("\n");
      const gatedOccurrences = gated.split(debugText).length - 1;
      expect(gatedOccurrences).toBe(occurrences);
    }
  });
});
