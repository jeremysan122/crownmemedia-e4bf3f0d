/**
 * Vote / crown regression contract. Locks the invariants proven by the
 * live signed-in probe in the previous turn:
 *
 *   1. votes.INSERT is INSERT-scoped to auth.uid() = user_id, so a client
 *      cannot cast a vote as somebody else.
 *   2. votes.DELETE is scoped to auth.uid() = user_id, so a client cannot
 *      remove another user's vote (idempotent double-tap is fine — you can
 *      only ever remove your own).
 *   3. The `votes_recalc` trigger runs at nested depth and updates
 *      `posts.vote_count` / `posts.crown_score`. Both guard triggers on
 *      posts must allow that path (see `permissionContract.test.ts`).
 *   4. Direct client UPDATE of a post's protected columns is denied both
 *      by the column-level UPDATE grant on `posts` (allowlist) AND by the
 *      guard triggers at depth 1.
 */
import { describe, it, expect } from "vitest";
import { allMigrationsSql, latestFunctionDefinition } from "./_migrationEffectiveState";

describe("crown/vote — client contract", () => {
  const sql = allMigrationsSql();

  it("votes INSERT policy scopes to auth.uid() = user_id", () => {
    // Match any surviving INSERT policy on votes and require the auth.uid()
    // = user_id predicate somewhere in its WITH CHECK clause.
    expect(sql).toMatch(
      /CREATE POLICY[^;]*ON\s+public\.votes[\s\S]*?FOR\s+INSERT[\s\S]*?WITH\s+CHECK[\s\S]*?auth\.uid\(\)\s*=\s*user_id/i,
    );
  });

  it("votes DELETE policy scopes to auth.uid() = user_id", () => {
    expect(sql).toMatch(
      /CREATE POLICY[^;]*ON\s+public\.votes[\s\S]*?FOR\s+DELETE[\s\S]*?USING[\s\S]*?auth\.uid\(\)\s*=\s*user_id/i,
    );
  });

  it("posts guard triggers block direct protected-column edits at top level (depth 1)", () => {
    const guard = latestFunctionDefinition("posts_prevent_protected_column_changes");
    // The depth bypass must come AFTER the immutable-column raise, so
    // direct user edits (depth 1) still fall through to the protected-column
    // block below. Confirm the RAISE for protected fields is still present.
    expect(guard).toMatch(/Not permitted to modify protected post field/);
    expect(guard).toMatch(/crown_score\s+IS DISTINCT FROM/);
    expect(guard).toMatch(/vote_count\s+IS DISTINCT FROM/);
  });
});
