/**
 * Feed RLS / column-grant regression contract (source-level).
 *
 * Locks in the invariants that caused the "permission denied for table posts"
 * regression and the earlier repost self-join crash. These are enforced by
 * grepping the canonical query source so no future refactor can silently
 * reintroduce them without a failing test.
 *
 * Rules under test:
 *  - POST_SELECT does NOT contain a `parent:posts!` self-join (would break
 *    the Feed when the schema cache can't resolve the self-relationship).
 *  - `hydrateParents()` remains the batched parent hydration path.
 *  - POST_SELECT and PARENT_SELECT both include `aspect_ratio` (public-safe
 *    display metadata readable by anon + authenticated).
 *  - Restricted / internal columns are NEVER selected by the canonical query
 *    (submission_key, client_request_id, moderation_notes, moderated_by,
 *    moderated_at) — column-level grants block them, so selecting them
 *    would 403 the entire Feed.
 *  - Feed queries filter out `is_removed` / `is_archived` rows so
 *    hidden/deleted content cannot leak, and rely on user-facing empty/error
 *    states (never surface raw PostgREST error text).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const read = (p: string) =>
  readFileSync(path.resolve(__dirname, "../../../", p), "utf8");

const postQuery = read("src/lib/postQuery.ts");
const feed = read("src/pages/Feed.tsx");

const RESTRICTED_COLUMNS = [
  "submission_key",
  "client_request_id",
  "moderation_notes",
  "moderated_by",
  "moderated_at",
  "sensitive_reason",
];

describe("Feed RLS / column-grant contract", () => {
  it("POST_SELECT does not use a posts→posts self-join for parents", () => {
    // The parent metadata must be batch-hydrated via hydrateParents(), never
    // pulled through an embedded self-relationship — PostgREST's schema cache
    // has historically failed on that shape in production. Guard against a
    // self-join reappearing inside either canonical SELECT string.
    const postSelect = postQuery.match(/POST_SELECT\s*=\s*`([\s\S]*?)`/)?.[1] ?? "";
    const parentSelect = postQuery.match(/PARENT_SELECT\s*=\s*`([\s\S]*?)`/)?.[1] ?? "";
    expect(postSelect).not.toMatch(/parent:posts!/);
    expect(parentSelect).not.toMatch(/parent:posts!/);
    expect(postQuery).toMatch(/export async function hydrateParents/);
  });

  it("POST_SELECT and PARENT_SELECT both include aspect_ratio", () => {
    // aspect_ratio is public-safe display metadata; postMediaFrame.ts depends
    // on it being present on both the current post and its hydrated parent.
    const postSelect = postQuery.match(/POST_SELECT\s*=\s*`([\s\S]*?)`/)?.[1] ?? "";
    const parentSelect = postQuery.match(/PARENT_SELECT\s*=\s*`([\s\S]*?)`/)?.[1] ?? "";
    expect(postSelect).toMatch(/\baspect_ratio\b/);
    expect(parentSelect).toMatch(/\baspect_ratio\b/);
  });

  it("canonical post selects never reference restricted/internal columns", () => {
    const postSelect = postQuery.match(/POST_SELECT\s*=\s*`([\s\S]*?)`/)?.[1] ?? "";
    const parentSelect = postQuery.match(/PARENT_SELECT\s*=\s*`([\s\S]*?)`/)?.[1] ?? "";
    for (const col of RESTRICTED_COLUMNS) {
      expect(postSelect).not.toMatch(new RegExp(`\\b${col}\\b`));
      expect(parentSelect).not.toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it("Feed filters out removed posts and hydrates parents", () => {
    // Removed posts must never leak into the Feed regardless of RLS —
    // enforce the visibility filter at the query layer as a belt-and-braces
    // guard alongside the moderation policies. (Archived posts are hidden by
    // the moderation RLS policy, not by an explicit .eq filter here.)
    expect(feed).toMatch(/is_removed/);
    expect(feed).toMatch(/hydrateParents\(/);
  });

  it("Feed never surfaces raw PostgREST error text to end users", () => {
    // The error branch must log the raw error and set a friendly, generic
    // user-facing message — no template-literal interpolation of `error`.
    expect(feed).toMatch(/Couldn't load posts right now/);
    expect(feed).not.toMatch(/toast\.error\(\s*error\.message/);
    expect(feed).not.toMatch(/toast\.error\(\s*`[^`]*\$\{[^}]*error/);
    expect(feed).not.toMatch(/setLoadError\(\s*error\.message/);
  });

  it("Retry preserves prior posts instead of clearing them", () => {
    // The error handler must not call setPosts([]) — flashing a blank feed on
    // a transient failure is worse than leaving the previous rows visible
    // behind the retry banner.
    const errorBlock = feed.match(/if \(error\) \{[\s\S]*?return;\s*\}/)?.[0] ?? "";
    expect(errorBlock).not.toMatch(/setPosts\(\[\]\)/);
  });

  it("Retry uses a reload key rather than a no-op state toggle", () => {
    expect(feed).toMatch(/reloadKey/);
    expect(feed).toMatch(/setReloadKey\(\(k\)\s*=>\s*k\s*\+\s*1\)/);
  });
});
