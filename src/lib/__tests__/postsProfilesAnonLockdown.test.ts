/**
 * Source-contract regression for the 2026-07-23 lockdown migrations that
 * restored strict column-level SELECT allowlists on `public.posts` and
 * `public.profiles`, plus the safe public projections
 * `public.posts_public` and `public.profiles_public`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIG_DIR = join(process.cwd(), "supabase", "migrations");
const ALL_SQL = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
  .join("\n\n-- FILE BREAK --\n\n");

describe("posts anon/authenticated column lockdown (2026-07-23)", () => {
  it("some migration revokes table-wide SELECT on posts from anon/authenticated", () => {
    expect(ALL_SQL).toMatch(/REVOKE SELECT ON public\.posts FROM anon, authenticated/);
    const grants = [...ALL_SQL.matchAll(/GRANT SELECT \(([\s\S]*?)\) ON public\.posts TO (anon|authenticated)/g)];
    expect(grants.length).toBeGreaterThanOrEqual(2);
  });

  it("no migration ever grants anon SELECT on sensitive posts columns", () => {
    const anonGrants = [...ALL_SQL.matchAll(/GRANT SELECT \(([\s\S]*?)\) ON public\.posts TO anon/g)]
      .map((m) => m[1]);
    for (const col of [
      "post_lat",
      "post_lng",
      "location_captured_at",
      "submission_key",
      "client_request_id",
      "moderation_notes",
      "moderation_status",
      "moderated_by",
      "ai_searchable_text",
      "ai_suggested_main_category_slug",
    ]) {
      for (const grant of anonGrants) {
        expect(grant, `anon posts grant must exclude ${col}`).not.toMatch(new RegExp(`\\b${col}\\b`));
      }
    }
  });
});

describe("posts_public safe view (2026-07-23)", () => {
  it("view is created with security_invoker=on and security_barrier=true", () => {
    expect(ALL_SQL).toMatch(/CREATE VIEW public\.posts_public[\s\S]*security_invoker\s*=\s*on/);
    expect(ALL_SQL).toMatch(/CREATE VIEW public\.posts_public[\s\S]*security_barrier\s*=\s*true/);
  });

  it("view is granted SELECT to anon and authenticated", () => {
    expect(ALL_SQL).toMatch(/GRANT SELECT ON public\.posts_public TO anon,\s*authenticated/);
  });

  it("view does NOT project exact coordinates or internal fields", () => {
    const viewBody =
      ALL_SQL.match(/CREATE VIEW public\.posts_public[\s\S]*?FROM public\.posts p/)?.[0] ?? "";
    expect(viewBody).toBeTruthy();
    for (const col of [
      "post_lat",
      "post_lng",
      "location_captured_at",
      "submission_key",
      "client_request_id",
      "moderation_notes",
      "moderation_status",
      "moderated_by",
      "ai_searchable_text",
    ]) {
      expect(viewBody, `posts_public must not expose ${col}`).not.toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it("view filters removed/archived/unapproved posts", () => {
    const viewBody =
      ALL_SQL.match(/CREATE VIEW public\.posts_public[\s\S]*?FROM public\.posts p[\s\S]*?;/)?.[0] ?? "";
    expect(viewBody).toMatch(/is_removed\s*=\s*false/);
    expect(viewBody).toMatch(/is_archived\s*=\s*false/);
    expect(viewBody).toMatch(/publish_status\s*=\s*'approved'/);
    expect(viewBody).toMatch(/can_view_posts_of/);
  });
});

describe("profiles anon/authenticated column lockdown (2026-07-23)", () => {
  it("some migration revokes table-wide SELECT on profiles from anon/authenticated", () => {
    expect(ALL_SQL).toMatch(/REVOKE SELECT ON public\.profiles FROM anon, authenticated/);
  });

  it("no anon grant on profiles exposes sensitive PII", () => {
    const anonGrants = [...ALL_SQL.matchAll(/GRANT SELECT \(([\s\S]*?)\) ON public\.profiles TO anon/g)]
      .map((m) => m[1]);
    for (const col of ["email", "phone", "date_of_birth", "gender", "stripe_customer_id", "is_suspended"]) {
      for (const grant of anonGrants) {
        expect(grant, `anon profiles grant must exclude ${col}`).not.toMatch(new RegExp(`\\b${col}\\b`));
      }
    }
  });

  it("profiles_public safe view is granted to anon (unchanged)", () => {
    expect(ALL_SQL).toMatch(/GRANT SELECT ON public\.profiles_public TO anon, authenticated/);
  });
});

describe("crown map: raw points remain private, public via geo_public_centers", () => {
  it("crown_map_points has no anon grants across migrations", () => {
    // Any GRANT ... ON public.crown_map_points TO anon anywhere is a regression.
    const hits = [...ALL_SQL.matchAll(/GRANT[^;]+ON public\.crown_map_points[^;]+TO[^;]*\banon\b/g)];
    expect(hits.length).toBe(0);
  });

  it("geo_public_centers is the anon-safe geo surface", () => {
    expect(ALL_SQL).toMatch(/GRANT SELECT[^;]*ON public\.geo_public_centers[^;]*TO[^;]*anon/);
  });
});
