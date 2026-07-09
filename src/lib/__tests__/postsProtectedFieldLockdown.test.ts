/**
 * Source-contract test for the posts protected-field lockdown migration.
 *
 * Locks the guarantees that block the scanner finding
 * "Users can manipulate their own post's ranking and moderation fields":
 *
 *  - BEFORE UPDATE trigger `trg_posts_guard_protected_fields` on public.posts
 *    blocking non-admin edits to every protected column.
 *  - RESTRICTIVE UPDATE policy scoped to owner/admin/moderator.
 *  - Admin-only SECURITY DEFINER RPC `admin_moderate_post` gated to
 *    admin/moderator with audit-log write, callable only by authenticated.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIG_DIR = join(process.cwd(), "supabase", "migrations");
const allSql = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
  .join("\n\n");

const PROTECTED = [
  "crown_score",
  "vote_count",
  "comment_count",
  "share_count",
  "repost_count",
  "battle_wins",
  "moderation_status",
  "moderation_notes",
  "moderated_by",
  "moderated_at",
  "is_removed",
  "publish_status",
  "sensitive_reason",
  "content_rating",
  "is_sensitive",
  "submission_key",
  "client_request_id",
  "crown_shield_until",
  "royal_boost_until",
  "spotlight_until",
  "vote_boost_until",
  "ai_searchable_text",
  "ai_suggested_main_category_slug",
];

describe("posts protected-field lockdown", () => {
  it("defines the guard trigger function on public.posts", () => {
    expect(allSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.posts_guard_protected_fields/,
    );
    expect(allSql).toMatch(
      /CREATE TRIGGER trg_posts_guard_protected_fields[\s\S]*BEFORE UPDATE ON public\.posts/,
    );
  });

  it("guards every protected column with a NEW/OLD comparison", () => {
    const fn =
      allSql.match(
        /CREATE OR REPLACE FUNCTION public\.posts_guard_protected_fields[\s\S]+?\$\$;/,
      )?.[0] ?? "";
    expect(fn).toBeTruthy();
    for (const col of PROTECTED) {
      expect(
        fn,
        `protected column ${col} is not guarded`,
      ).toMatch(new RegExp(`NEW\\.${col}\\s+IS DISTINCT FROM\\s+OLD\\.${col}`));
    }
  });

  it("only admin/moderator/service_role can bypass the guard", () => {
    const fn =
      allSql.match(
        /CREATE OR REPLACE FUNCTION public\.posts_guard_protected_fields[\s\S]+?\$\$;/,
      )?.[0] ?? "";
    expect(fn).toMatch(/has_role\(auth\.uid\(\)\s*,\s*'admin'::app_role\)/);
    expect(fn).toMatch(/has_role\(auth\.uid\(\)\s*,\s*'moderator'::app_role\)/);
    expect(fn).toMatch(/'service_role'/);
  });

  it("raises 42501 insufficient_privilege on protected-field change", () => {
    const fn =
      allSql.match(
        /CREATE OR REPLACE FUNCTION public\.posts_guard_protected_fields[\s\S]+?\$\$;/,
      )?.[0] ?? "";
    expect(fn).toMatch(/ERRCODE\s*=\s*'42501'/);
  });

  it("adds an AS RESTRICTIVE UPDATE policy on public.posts", () => {
    expect(allSql).toMatch(
      /CREATE POLICY "Posts: deny mutation of protected fields"[\s\S]*AS RESTRICTIVE[\s\S]*FOR UPDATE[\s\S]*TO authenticated/,
    );
  });

  it("keeps safe editable fields owner-editable (not enumerated as protected)", () => {
    const fn =
      allSql.match(
        /CREATE OR REPLACE FUNCTION public\.posts_guard_protected_fields[\s\S]+?\$\$;/,
      )?.[0] ?? "";
    for (const safe of [
      "caption",
      "hashtags",
      "tagged_user_ids",
      "alt_texts",
      "photo_filter",
      "video_filter",
      "edited_at",
    ]) {
      expect(
        fn,
        `${safe} must remain owner-editable and NOT be guarded`,
      ).not.toMatch(new RegExp(`NEW\\.${safe}\\s+IS DISTINCT FROM`));
    }
  });

  it("exposes admin_moderate_post RPC gated to admin/moderator with audit log", () => {
    const fn = allSql.match(
      /CREATE OR REPLACE FUNCTION public\.admin_moderate_post[\s\S]+?\$\$;/,
    )?.[0];
    expect(fn).toBeTruthy();
    expect(fn!).toMatch(/SECURITY DEFINER/);
    expect(fn!).toMatch(/has_role\(auth\.uid\(\)\s*,\s*'admin'::app_role\)/);
    expect(fn!).toMatch(/has_role\(auth\.uid\(\)\s*,\s*'moderator'::app_role\)/);
    expect(fn!).toMatch(/admin_audit_log/);
    expect(allSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.admin_moderate_post\(uuid, text, boolean, text, text, text\) TO authenticated, service_role/,
    );
    expect(allSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_moderate_post\(uuid, text, boolean, text, text, text\) FROM PUBLIC, anon/,
    );
  });
});
