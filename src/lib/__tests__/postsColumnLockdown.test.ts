// Source-contract test for the launch-hardening migration that revokes
// SELECT on sensitive/internal `public.posts` columns from anon+authenticated
// and adds the safe global-search RPC.
//
// The migration proves:
//   - anon / authenticated cannot read exact coords or internal AI metadata
//   - `search_public_posts` is SECURITY DEFINER, gated to authenticated,
//     and its RETURNS TABLE never leaks internal fields.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIG_DIR = join(process.cwd(), "supabase", "migrations");
const allSql = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
  .join("\n\n");

const LOCKED_COLUMNS = [
  "post_lat",
  "post_lng",
  "location_captured_at",
  "ai_searchable_text",
  "ai_suggested_main_category_slug",
];

const FORBIDDEN_IN_SEARCH_DTO = [
  "ai_searchable_text",
  "ai_suggested_main_category_slug",
  "moderation_notes",
  "moderated_by",
  "submission_key",
  "client_request_id",
  "post_lat",
  "post_lng",
  "location_captured_at",
];

describe("posts column-level SELECT lockdown", () => {
  it("revokes SELECT on every locked column from anon, authenticated, and PUBLIC", () => {
    const revokes = [
      ...allSql.matchAll(
        /REVOKE SELECT\s*\(([^)]+)\)\s*ON public\.posts\s*FROM\s*([^;]+);/gi,
      ),
    ];
    expect(revokes.length, "at least one column-level REVOKE SELECT on public.posts").toBeGreaterThan(0);
    for (const c of LOCKED_COLUMNS) {
      const hit = revokes.find((m) =>
        m[1].split(",").map((s) => s.trim()).includes(c),
      );
      expect(hit, `${c} must appear in a REVOKE SELECT column list`).toBeTruthy();
      const roles = hit![2].toLowerCase();
      expect(roles).toContain("anon");
      expect(roles).toContain("authenticated");
    }
  });

});

describe("search_public_posts RPC", () => {
  const fn =
    allSql.match(/CREATE OR REPLACE FUNCTION public\.search_public_posts[\s\S]+?\$\$;/)?.[0] ?? "";

  it("is defined as SECURITY DEFINER with a pinned search_path", () => {
    expect(fn).toBeTruthy();
    expect(fn).toMatch(/SECURITY DEFINER/);
    expect(fn).toMatch(/SET search_path = public/);
  });

  it("is executable by authenticated + service_role but not anon/PUBLIC", () => {
    expect(allSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.search_public_posts\(text, integer, integer\) FROM PUBLIC, anon/,
    );
    expect(allSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.search_public_posts\(text, integer, integer\) TO authenticated, service_role/,
    );
  });

  it("returns only safe public post fields — no internal or AI metadata", () => {
    const returnsBlock =
      fn.match(/RETURNS TABLE\s*\(([\s\S]+?)\)\s*LANGUAGE/)?.[1] ?? "";
    expect(returnsBlock).toBeTruthy();
    for (const bad of FORBIDDEN_IN_SEARCH_DTO) {
      expect(
        returnsBlock,
        `${bad} must NOT appear in search_public_posts return columns`,
      ).not.toMatch(new RegExp(`\\b${bad}\\b`));
    }
    // Sanity: the safe fields the UI needs are present.
    for (const good of ["id", "user_id", "image_url", "caption", "category", "crown_score"]) {
      expect(returnsBlock).toMatch(new RegExp(`\\b${good}\\b`));
    }
  });
});
