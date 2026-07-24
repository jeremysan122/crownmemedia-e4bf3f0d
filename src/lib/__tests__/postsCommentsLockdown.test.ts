/**
 * Source-contract tests for the posts + comments UPDATE lockdown and the
 * server-controlled repost_count.
 *
 * Verifies the SQL migration + client contracts without needing a live DB.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIG_DIR = join(process.cwd(), "supabase", "migrations");
const allSql = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort() // chronological (filenames are timestamp-prefixed)
  .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
  .join("\n\n");

const POSTS_PROTECTED = [
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
  "is_sensitive",
  "sensitive_reason",
  "content_rating",
  "royal_boost_until",
  "vote_boost_until",
  "spotlight_until",
  "crown_shield_until",
  "publish_status",
];

const POSTS_SAFE_OWNER = [
  "caption",
  "hashtags",
  "alt_texts",
  "filter",
  "photo_filter",
  "video_filter",
  "filter_type",
  "location_enabled",
  "location_source",
  "location_label",
  "city",
  "state",
  "country",
  "region_name",
  "region_type",
  "post_location_precision",
  "edited_at",
  "is_archived",
  "archived_at",
  "pinned_at",
  "repost_caption",
];

describe("posts UPDATE lockdown", () => {
  it("revokes broad UPDATE and grants only owner-safe columns", () => {
    expect(allSql).toMatch(/REVOKE\s+UPDATE\s+ON\s+public\.posts\s+FROM\s+authenticated/i);
    // Locate the FINAL grant block (last occurrence wins in migration order).
    // Use [^)] to prevent the non-greedy match from crossing block boundaries.
    const grantBlocks = [...allSql.matchAll(
      /GRANT UPDATE\s*\(([^)]+)\)\s*ON\s+public\.posts\s+TO\s+authenticated/gi,
    )];
    expect(grantBlocks.length).toBeGreaterThan(0);
    const cols = grantBlocks[grantBlocks.length - 1][1];
    for (const c of POSTS_SAFE_OWNER) {
      expect(cols).toMatch(new RegExp(`\\b${c}\\b`));
    }
    // Admin-only columns must NOT appear in the final owner grant.
    // (Enforced defense-in-depth by the guard trigger — checked below.)
    for (const c of ["crown_score", "vote_count", "comment_count", "share_count", "repost_count", "moderation_status", "is_removed", "royal_boost_until"]) {
      expect(cols, `column ${c} leaked into tightened grant`).not.toMatch(new RegExp(`\\b${c}\\b`));
    }
    for (const c of ["post_lat", "post_lng", "location_captured_at"]) {
      expect(cols, `precise location column ${c} leaked into owner update grant`).not.toMatch(new RegExp(`\\b${c}\\b`));
    }
  });

  it("BEFORE UPDATE guard trigger blocks non-admin changes to every protected field", () => {
    const fn = allSql.match(
      /CREATE OR REPLACE FUNCTION public\.posts_prevent_protected_column_changes[\s\S]+?\$\$;/,
    )?.[0];
    expect(fn).toBeTruthy();
    for (const c of POSTS_PROTECTED) {
      expect(fn!).toMatch(new RegExp(`NEW\\.${c}\\s+IS DISTINCT FROM\\s+OLD\\.${c}`));
    }
    // service_role and admin/moderator bypass
    expect(fn!).toMatch(/current_setting\('role'.*\)\s*=\s*'service_role'/);
    expect(fn!).toMatch(/has_role\(auth\.uid\(\)\s*,\s*'admin'::app_role\)/);
    expect(fn!).toMatch(/has_role\(auth\.uid\(\)\s*,\s*'moderator'::app_role\)/);
    // Immutable columns are locked for everyone except service_role
    for (const c of ["id", "user_id", "created_at", "parent_post_id"]) {
      expect(fn!).toMatch(new RegExp(`NEW\\.${c}\\s+IS DISTINCT FROM\\s+OLD\\.${c}`));
    }
    expect(allSql).toMatch(/CREATE TRIGGER posts_prevent_protected_column_changes[\s\S]{0,200}BEFORE UPDATE ON public\.posts/);
  });
});

describe("comments UPDATE lockdown", () => {
  it("revokes broad UPDATE and final grant is body+edited_at only", () => {
    expect(allSql).toMatch(/REVOKE\s+UPDATE\s+ON\s+public\.comments\s+FROM\s+authenticated/i);
    const grantBlocks = [...allSql.matchAll(
      /GRANT UPDATE\s*\(([^)]+)\)\s*ON\s+public\.comments\s+TO\s+authenticated/gi,
    )];
    expect(grantBlocks.length).toBeGreaterThan(0);
    const cols = grantBlocks[grantBlocks.length - 1][1];
    expect(cols).toMatch(/\bbody\b/);
    expect(cols).toMatch(/\bedited_at\b/);
    for (const c of ["is_removed", "reply_count", "mention_user_ids", "user_id", "post_id", "created_at"]) {
      expect(cols).not.toMatch(new RegExp(`\\b${c}\\b`));
    }
  });

  it("BEFORE UPDATE guard trigger blocks owner edits to is_removed/reply_count/mention_user_ids", () => {
    const fn = allSql.match(
      /CREATE OR REPLACE FUNCTION public\.comments_prevent_protected_column_changes[\s\S]+?\$\$;/,
    )?.[0];
    expect(fn).toBeTruthy();
    for (const c of ["is_removed", "reply_count", "mention_user_ids"]) {
      expect(fn!).toMatch(new RegExp(`NEW\\.${c}\\s+IS DISTINCT FROM\\s+OLD\\.${c}`));
    }
    for (const c of ["id", "user_id", "post_id", "parent_id", "created_at"]) {
      expect(fn!).toMatch(new RegExp(`NEW\\.${c}\\s+IS DISTINCT FROM\\s+OLD\\.${c}`));
    }
    expect(fn!).toMatch(/has_role\(auth\.uid\(\)\s*,\s*'admin'::app_role\)/);
    expect(fn!).toMatch(/has_role\(auth\.uid\(\)\s*,\s*'moderator'::app_role\)/);
    expect(allSql).toMatch(/CREATE TRIGGER comments_prevent_protected_column_changes[\s\S]{0,200}BEFORE UPDATE ON public\.comments/);
  });
});

describe("posts.repost_count column + maintenance", () => {
  it("adds a non-negative repost_count with default 0", () => {
    expect(allSql).toMatch(/ADD COLUMN IF NOT EXISTS repost_count integer NOT NULL DEFAULT 0/);
    expect(allSql).toMatch(/CHECK \(repost_count >= 0\)/);
  });

  it("backfills repost_count from active repost shells only", () => {
    // Backfill excludes removed and archived reposts
    const backfill = allSql.match(
      /WITH counts AS \([\s\S]+?parent_post_id IS NOT NULL[\s\S]+?is_removed = false[\s\S]+?is_archived = false[\s\S]+?GROUP BY parent_post_id/,
    );
    expect(backfill).toBeTruthy();
  });

  it("maintenance trigger handles INSERT, UPDATE(is_removed/is_archived), DELETE and never goes below 0", () => {
    const fn = allSql.match(
      /CREATE OR REPLACE FUNCTION public\.posts_maintain_repost_count[\s\S]+?\$\$;/,
    )?.[0];
    expect(fn).toBeTruthy();
    expect(fn!).toMatch(/TG_OP = 'INSERT'/);
    expect(fn!).toMatch(/TG_OP = 'UPDATE'/);
    expect(fn!).toMatch(/TG_OP = 'DELETE'/);
    // Two GREATEST(0, repost_count - 1) sites (update-inactive + delete)
    const clamps = fn!.match(/GREATEST\(0,\s*repost_count\s*-\s*1\)/g);
    expect(clamps && clamps.length).toBeGreaterThanOrEqual(2);
    // Only touches the parent's repost_count, never other fields
    const updates = fn!.match(/UPDATE public\.posts[\s\S]+?WHERE id =/g) ?? [];
    for (const u of updates) {
      expect(u).toMatch(/SET repost_count/);
      expect(u).not.toMatch(/user_id\s*=/);
      expect(u).not.toMatch(/crown_score\s*=/);
    }
    expect(allSql).toMatch(/CREATE TRIGGER posts_maintain_repost_count[\s\S]{0,200}AFTER INSERT OR UPDATE OF is_removed, is_archived OR DELETE/);
  });

  it("recalculate_repost_count / recalculate_all_repost_counts are admin-gated", () => {
    const one = allSql.match(/CREATE OR REPLACE FUNCTION public\.recalculate_repost_count[\s\S]+?\$\$;/)?.[0];
    const all = allSql.match(/CREATE OR REPLACE FUNCTION public\.recalculate_all_repost_counts[\s\S]+?\$\$;/)?.[0];
    expect(one).toBeTruthy();
    expect(all).toBeTruthy();
    for (const fn of [one!, all!]) {
      expect(fn).toMatch(/current_setting\('role'.*\)\s*=\s*'service_role'/);
      expect(fn).toMatch(/has_role\(auth\.uid\(\)\s*,\s*'admin'::app_role\)/);
    }
  });
});

describe("client query contract carries repost_count", () => {
  const postQuery = readFileSync(join(process.cwd(), "src/lib/postQuery.ts"), "utf8");
  const postCard = readFileSync(join(process.cwd(), "src/components/PostCard.tsx"), "utf8");

  it("POST_SELECT and PARENT_SELECT include repost_count", () => {
    const postSel = postQuery.match(/POST_SELECT\s*=\s*`([\s\S]+?)`/)?.[1] ?? "";
    const parentSel = postQuery.match(/PARENT_SELECT\s*=\s*`([\s\S]+?)`/)?.[1] ?? "";
    expect(postSel).toMatch(/\brepost_count\b/);
    expect(parentSel).toMatch(/\brepost_count\b/);
  });

  it("PostCard seeds counts.reposts from parent when isRepost and from own post otherwise", () => {
    // seed pulls repost_count from parent OR self
    expect(postCard).toMatch(/repost_count:\s*post\.parent!\.repost_count\s*\?\?\s*0/);
    expect(postCard).toMatch(/repost_count:\s*post\.repost_count\s*\?\?\s*0/);
    // counts state carries reposts
    expect(postCard).toMatch(/reposts:\s*seed\.repost_count/);
    // realtime patch updates reposts
    expect(postCard).toMatch(/reposts:\s*\(?row\.repost_count/);
    // Repost button renders the count when > 0
    expect(postCard).toMatch(/counts\.reposts\s*>\s*0/);
  });
});

describe("admin/moderator RPC contracts", () => {
  it("admin_set_post_removed / admin_moderate_comment / admin_update_post are role-gated and definer", () => {
    for (const name of [
      "admin_set_post_removed",
      "admin_moderate_comment",
      "admin_update_post",
      "admin_update_posts_bulk",
    ]) {
      const fn = allSql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}[\\s\\S]+?\\$\\$;`))?.[0];
      expect(fn, `${name} must be defined`).toBeTruthy();
    }
    const setRemoved = allSql.match(/CREATE OR REPLACE FUNCTION public\.admin_set_post_removed[\s\S]+?\$\$;/)![0];
    expect(setRemoved).toMatch(/has_role\(auth\.uid\(\)\s*,\s*'admin'::app_role\)/);
    expect(setRemoved).toMatch(/has_role\(auth\.uid\(\)\s*,\s*'moderator'::app_role\)/);
    expect(setRemoved).toMatch(/SECURITY DEFINER/);

    const updatePost = allSql.match(/CREATE OR REPLACE FUNCTION public\.admin_update_post\(\s*_post_id[\s\S]+?\$\$;/)![0];
    expect(updatePost).toMatch(/allowed\s+text\[\]\s*:=\s*ARRAY\[/);
    expect(updatePost).toMatch(/Field % not allowed in admin_update_post/);
    expect(updatePost).toMatch(/moderated_by\s*=\s*auth\.uid\(\)/);
    expect(updatePost).toMatch(/moderated_at\s*=\s*now\(\)/);
  });

  it("client admin helpers route through the new RPCs (no direct posts/comments UPDATE from client)", () => {
    const adminLib = readFileSync(join(process.cwd(), "src/lib/admin.ts"), "utf8");
    const adminPage = readFileSync(join(process.cwd(), "src/pages/Admin.tsx"), "utf8");
    const cmdCenter = readFileSync(join(process.cwd(), "src/pages/admin/CommandCenterContent.tsx"), "utf8");

    for (const src of [adminLib, adminPage, cmdCenter]) {
      expect(src).not.toMatch(/\.from\(\s*["']posts["']\s*\)\s*\.update\(/);
      expect(src).not.toMatch(/\.from\(\s*["']comments["']\s*\)\s*\.update\(/);
    }
    expect(adminLib).toMatch(/rpc\(\s*["']admin_set_post_removed["']/);
    expect(adminLib).toMatch(/rpc\(\s*["']admin_moderate_comment["']/);
    expect(cmdCenter).toMatch(/rpc\(\s*["']admin_update_post["']/);
    expect(cmdCenter).toMatch(/rpc\(\s*["']admin_update_posts_bulk["']/);
  });
});
