/**
 * Battle invitation UI must ONLY call the canonical RPCs and must route
 * every failure through `battleErrorMessage` so error codes map to safe
 * user-visible strings. Any regression that talks directly to the
 * `battles`/`live_battles` tables from the client, or that surfaces a raw
 * Postgres error to `toast`, breaks the screenshot flows and gets caught
 * here.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ACCEPT_DIALOG = readFileSync(
  join(process.cwd(), "src", "components", "battles", "AcceptBattleDialog.tsx"),
  "utf8",
);
const LIVE_HELPERS = readFileSync(
  join(process.cwd(), "src", "lib", "liveBattles.ts"),
  "utf8",
);
const ERROR_MAP = readFileSync(
  join(process.cwd(), "src", "lib", "battlesErrors.ts"),
  "utf8",
);

describe("battle invitation RPC wiring — Battles list dialog", () => {
  it("Accept calls supabase.rpc('accept_battle', { _battle_id, _opponent_post_id })", () => {
    expect(ACCEPT_DIALOG).toMatch(
      /supabase\.rpc\(\s*["']accept_battle["'][\s\S]{0,200}_battle_id[\s\S]{0,200}_opponent_post_id/,
    );
  });
  it("Decline calls supabase.rpc('decline_battle', { _battle_id })", () => {
    expect(ACCEPT_DIALOG).toMatch(
      /supabase\.rpc\(\s*["']decline_battle["'][\s\S]{0,120}_battle_id/,
    );
  });
  it("does NOT hit the battles table directly for accept/decline", () => {
    // Would-be regression: `.from('battles').update({ status: 'declined' })`
    expect(ACCEPT_DIALOG).not.toMatch(
      /\.from\(\s*["']battles["']\s*\)\s*\.(update|delete|insert)\(/,
    );
  });
  it("maps every RPC error through battleErrorMessage before toasting", () => {
    // The accept branch:
    expect(ACCEPT_DIALOG).toMatch(
      /toast\.error\(\s*battleErrorMessage\(\s*["']accept["']/,
    );
    // The decline branch:
    expect(ACCEPT_DIALOG).toMatch(
      /toast\.error\(\s*battleErrorMessage\(\s*["']decline["']/,
    );
    // Never dumps raw error.message to the toast:
    expect(ACCEPT_DIALOG).not.toMatch(/toast\.error\(\s*error\?\.\s*message/);
  });
  it("navigates on accept only after RPC success (routes to lobby via onResolved)", () => {
    // The dialog delegates post-accept navigation to onResolved; the
    // pattern is: on error → return early; on success → close + resolve.
    const acceptBlock =
      ACCEPT_DIALOG.match(/const\s+accept\s*=\s*async[\s\S]+?\};/)?.[0] ?? "";
    expect(acceptBlock).toMatch(/if\s*\(error\)\s*\{[\s\S]*?return;/);
    expect(acceptBlock).toMatch(/onResolved\?\.\(\)/);
  });
});

describe("live battle invitation RPC wiring — helpers", () => {
  it("acceptLiveBattle → live_battle_accept({ _battle_id })", () => {
    expect(LIVE_HELPERS).toMatch(
      /export\s+async\s+function\s+acceptLiveBattle[\s\S]{0,220}rpc\(\s*["']live_battle_accept["'][\s\S]{0,80}_battle_id/,
    );
  });
  it("declineLiveBattle → live_battle_decline({ _battle_id })", () => {
    expect(LIVE_HELPERS).toMatch(
      /export\s+async\s+function\s+declineLiveBattle[\s\S]{0,220}rpc\(\s*["']live_battle_decline["'][\s\S]{0,80}_battle_id/,
    );
  });
  it("cancelLiveBattle → live_battle_cancel({ _battle_id })", () => {
    expect(LIVE_HELPERS).toMatch(
      /export\s+async\s+function\s+cancelLiveBattle[\s\S]{0,220}rpc\(\s*["']live_battle_cancel["'][\s\S]{0,80}_battle_id/,
    );
  });
  it("never mutates live_battles directly from the client helpers", () => {
    expect(LIVE_HELPERS).not.toMatch(
      /\.from\(\s*["']live_battles["']\s*\)\s*\.(update|delete|insert)\(/,
    );
  });
});

describe("battle error-code mapping — safe user strings", () => {
  // The RPC error strings from the DB definitions are the source of truth.
  // Each one must have a human phrasing so we never surface raw SQL.
  const REQUIRED_HINTS = [
    "not signed in",
    "battle not found",
    "battle not pending",       // stale/repeated action
    "only opponent can accept",
    "only participants can decline",
    "not battle-eligible",
    "no longer challengeable",
  ];
  for (const hint of REQUIRED_HINTS) {
    it(`maps "${hint}" to a user-safe string`, () => {
      expect(ERROR_MAP).toMatch(new RegExp(hint.replace(/ /g, "\\s+"), "i"));
    });
  }
});
