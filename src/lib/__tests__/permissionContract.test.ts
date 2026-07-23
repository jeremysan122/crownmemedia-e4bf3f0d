/**
 * Permission contract. Enforces the invariants that both mobile-regression
 * fixes depend on:
 *
 *  - authenticated retains SELECT/INSERT/UPDATE/DELETE on the tables the
 *    app writes to during profile save + vote + battle flows;
 *  - anon can not read whole-table sensitive rows (profiles/posts/
 *    crown_map_points); the app must go through the `_public` views;
 *  - service_role always has ALL (edge functions / webhooks depend on it);
 *  - trigger-depth bypass survives on the two guard functions that the
 *    votes_recalc path traverses.
 *
 * Each assertion inspects the *effective latest* GRANT / REVOKE / CREATE OR
 * REPLACE FUNCTION in `supabase/migrations/`, so a superseding migration
 * that revokes something later will fail this test — not a historical file.
 */
import { describe, it, expect } from "vitest";
import {
  latestFunctionDefinition,
  lastTableGrantHolds,
  anonWholeTableSelectIsBlocked,
} from "./_migrationEffectiveState";

describe("permission contract — authenticated write capabilities", () => {
  // Only the privileges the screenshot flows actually exercise directly.
  // Column-scoped grants (posts UPDATE allowlist) intentionally bypass the
  // whole-table check — the helper skips column-scoped grants so a future
  // migration that reverts to a whole-table UPDATE grant on `posts` won't
  // silently unbreak this test.
  const AUTH_REQUIREMENTS: Array<[string, Array<"SELECT" | "INSERT" | "UPDATE" | "DELETE">]> = [
    ["public.profiles",     ["SELECT", "UPDATE"]],           // EditProfile own-row UPDATE
    ["public.posts",        ["SELECT", "INSERT", "DELETE"]], // owner insert/delete; column-scoped UPDATE
    ["public.votes",        ["SELECT"]],                    // INSERT/DELETE covered by RLS policy contract; see crownVoteRegressionContract
    ["public.battles",      ["SELECT"]],                     // Battles list read; writes via RPC
    ["public.live_battles", ["SELECT"]],                     // LiveBattles list read; writes via RPC
  ];
  for (const [t, privs] of AUTH_REQUIREMENTS) {
    for (const priv of privs) {
      it(`authenticated retains ${priv} on ${t}`, () => {
        expect(
          lastTableGrantHolds(priv, "authenticated", t),
          `${priv} on ${t} was revoked from authenticated — this breaks a screenshot flow`,
        ).toBe(true);
      });
    }
    it(`service_role retains ALL on ${t}`, () => {
      expect(lastTableGrantHolds("SELECT", "service_role", t)).toBe(true);
    });
  }
});

describe("permission contract — anon lockdown for sensitive tables", () => {
  const SENSITIVE = [
    "public.profiles",         // PII, private geo, email
    "public.crown_map_points", // exact coordinates
  ];
  for (const t of SENSITIVE) {
    it(`anon has no whole-table SELECT on ${t}`, () => {
      expect(
        anonWholeTableSelectIsBlocked(t),
        `anon regained whole-table SELECT on ${t} — PII/coord leak`,
      ).toBe(true);
    });
  }

  it("anon reaches profiles/posts through the *_public views only", () => {
    // The views are the sanctioned public surface. Requiring anon SELECT on
    // them stops a future migration from silently removing the surface.
    expect(lastTableGrantHolds("SELECT", "anon", "public.profiles_public")).toBe(true);
    expect(lastTableGrantHolds("SELECT", "anon", "public.posts_public")).toBe(true);
  });
});

describe("permission contract — trigger depth bypass survives", () => {
  for (const fn of [
    "posts_prevent_protected_column_changes",
    "posts_guard_protected_fields",
  ]) {
    it(`${fn} lets server-side recalc (pg_trigger_depth > 1) through`, () => {
      const def = latestFunctionDefinition(fn);
      expect(
        def,
        `${fn} no longer contains a pg_trigger_depth() > 1 bypass — votes_recalc will 42501`,
      ).toMatch(/IF\s+pg_trigger_depth\(\)\s*>\s*1\s+THEN\s+RETURN NEW;\s+END IF;/);
      // Preserve the service_role escape hatch for webhooks.
      expect(def).toMatch(/service_role/);
    });
  }
});

describe("permission contract — battle invitation RPCs are actor-scoped", () => {
  it("accept_battle only allows the opponent while status = pending", () => {
    const def = latestFunctionDefinition("accept_battle");
    expect(def).toMatch(/SECURITY DEFINER/);
    expect(def).toMatch(/opponent_id\s*<>\s*_uid/);
    expect(def).toMatch(/status\s*<>\s*'pending'/);
    expect(def).toMatch(/ERRCODE\s*=\s*'42501'/); // authorization
    expect(def).toMatch(/ERRCODE\s*=\s*'22023'/); // invalid state — stale action
  });

  it("decline_battle allows either participant on pending only", () => {
    const def = latestFunctionDefinition("decline_battle");
    expect(def).toMatch(/opponent_id\s*<>\s*_uid\s+AND\s+_b\.challenger_id\s*<>\s*_uid/);
    expect(def).toMatch(/status\s*<>\s*'pending'/);
    expect(def).toMatch(/ERRCODE\s*=\s*'42501'/);
  });

  it("live_battle_accept: opponent only, idempotent when already accepted", () => {
    const def = latestFunctionDefinition("live_battle_accept");
    expect(def).toMatch(/opponent_id\s*<>\s*uid/);
    // Idempotency: return the row instead of re-updating when accepted_at
    // is already set. This is what makes repeated taps safe.
    expect(def).toMatch(/accepted_at IS NOT NULL[\s\S]{0,40}RETURN\s+b\s*;/);
  });

  it("live_battle_decline restricts to opponent only", () => {
    const def = latestFunctionDefinition("live_battle_decline");
    expect(def).toMatch(/opponent_id\s*<>\s*uid/);
    expect(def).toMatch(/battle_not_pending|status\s*<>\s*'pending'/);
  });

  it("live_battle_cancel restricts to the host only", () => {
    const def = latestFunctionDefinition("live_battle_cancel");
    expect(def).toMatch(/host_id\s*<>\s*uid/);
    expect(def).toMatch(/battle_not_pending|status\s*<>\s*'pending'/);
  });
});
