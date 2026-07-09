/**
 * Automated edge-case coverage for Scrolls (Shorts) reposts.
 *
 * Locks the client-side behavior for:
 *   - Reposting a repost: server code 'is_repost' surfaces a friendly block
 *     message; client never bypasses check_repost_eligibility.
 *   - Double-tap protection: the Repost button is disabled once reposted
 *     AND while the RepostDialog is open, so a fast second tap can't fire
 *     a second insert. Server-side idempotency via request_id is the final
 *     backstop.
 *   - Pull-to-refresh / re-hydration consistency: after items are (re)loaded,
 *     Shorts re-runs the myReposts hydration query and re-subscribes to
 *     realtime updates keyed off the visible IDs so repost_count stays
 *     accurate.
 *   - Undo UX: loading toast, rollback on failure with a friendly reason,
 *     success toast that mentions the 5-minute window.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const shorts = read("src/pages/Shorts.tsx");
const repostLib = read("src/lib/repost.ts");
const dialog = read("src/components/RepostDialog.tsx");

const migrations = readdirSync(join(process.cwd(), "supabase", "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => read(join("supabase", "migrations", f)))
  .join("\n\n");

describe("Scrolls: reposting a repost is blocked server-side", () => {
  it("check_repost_eligibility returns 'is_repost' when parent has a parent_post_id", () => {
    // Find the latest definition.
    const matches = migrations.match(
      /CREATE OR REPLACE FUNCTION public\.check_repost_eligibility[\s\S]+?\$function\$;/g,
    ) ?? migrations.match(
      /CREATE OR REPLACE FUNCTION public\.check_repost_eligibility[\s\S]+?\$\$;/g,
    );
    expect(matches, "check_repost_eligibility not found").toBeTruthy();
    const latest = matches![matches!.length - 1];
    expect(latest).toMatch(/'is_repost'/);
  });

  it("create_repost delegates to check_repost_eligibility (so is_repost is enforced)", () => {
    const matches = migrations.match(
      /CREATE OR REPLACE FUNCTION public\.create_repost\([\s\S]+?\$\$;/g,
    );
    expect(matches, "create_repost not found").toBeTruthy();
    const latest = matches![matches!.length - 1];
    expect(latest).toMatch(/check_repost_eligibility\s*\(/);
  });

  it("friendlyRepostMessage maps 'is_repost' to a clear user-facing string", () => {
    expect(repostLib).toMatch(/is_repost:\s*["']Reposts of reposts aren't allowed\.["']/);
  });
});

describe("Scrolls: double-tap protection", () => {
  it("Repost button is disabled once reposted OR while the dialog is open", () => {
    // const disabled = !!repostScroll || reposted || undoingId === myReposts[p.id];
    expect(shorts).toMatch(
      /const\s+disabled\s*=\s*!!repostScroll\s*\|\|\s*reposted\s*\|\|\s*undoingId\s*===\s*myReposts\[p\.id\]/,
    );
    expect(shorts).toMatch(/disabled=\{disabled\}/);
  });

  it("onClick short-circuits when already reposted (no duplicate dialog opens)", () => {
    expect(shorts).toMatch(/onClick=\{\(\)\s*=>\s*!reposted\s*&&\s*setRepostScroll\(p\)\}/);
  });

  it("Server idempotency: create_repost accepts a stable p_request_id per dialog session", () => {
    expect(dialog).toMatch(/requestIdRef\.current\s*=\s*crypto\.randomUUID\(\)/);
    expect(dialog).toMatch(/requestId:\s*requestIdRef\.current/);
    expect(repostLib).toMatch(/p_request_id:\s*args\.requestId/);
  });

  it("Idempotent replay (repost_attempts_log) returns 'idempotent_replay' without inserting again", () => {
    const matches = migrations.match(
      /CREATE OR REPLACE FUNCTION public\.create_repost\([\s\S]+?\$\$;/g,
    );
    expect(matches).toBeTruthy();
    expect(matches!.join("\n")).toMatch(/'idempotent_replay'/);
  });
});

describe("Scrolls: pull-to-refresh / realtime consistency", () => {
  it("Realtime subscription re-binds to the visible items list", () => {
    expect(shorts).toMatch(/\.channel\("shorts-posts-counts"\)/);
    expect(shorts).toMatch(/event:\s*"UPDATE",\s*schema:\s*"public",\s*table:\s*"posts"/);
    // effect depends on `items` so a refresh (loadInitial) re-subscribes
    // with a fresh visibleIds set.
    expect(shorts).toMatch(/\}, \[items\]\);\s*\n\s*\n?\s*const handleUndoRepost/);
  });

  it("myReposts hydration effect re-runs when items change (covers pull-to-refresh)", () => {
    expect(shorts).toMatch(/\}, \[items, user\?\.id\]\);/);
    expect(shorts).toMatch(/\.in\("parent_post_id",\s*parentIds\)/);
  });

  it("Realtime UPDATE payload writes repost_count into the local item (keeps count live)", () => {
    expect(shorts).toMatch(/repost_count:\s*row\.repost_count\s*\?\?\s*0/);
  });

  it("posts table is enabled in supabase_realtime publication (server side)", () => {
    expect(migrations).toMatch(/ALTER PUBLICATION supabase_realtime ADD TABLE public\.posts/);
    expect(migrations).toMatch(/ALTER TABLE public\.posts REPLICA IDENTITY FULL/);
  });
});

describe("Scrolls: Undo UX (toast state, disabled state, rollback)", () => {
  it("Shows a loading toast while the undo RPC is in-flight", () => {
    expect(shorts).toMatch(/toast\.loading\(["']Undoing repost…["']\)/);
    expect(shorts).toMatch(/toast\.dismiss\(inflightId\)/);
  });

  it("Success toast mentions the 5-minute undo window on the initial repost", () => {
    expect(shorts).toMatch(/You can undo this repost for the next 5 minutes/);
  });

  it("Undo failure rolls back optimistic state AND shows a friendly reason", () => {
    expect(shorts).toMatch(/setMyReposts\(prevMap\)/);
    expect(shorts).toMatch(/friendlyUndoRepostMessage\(res\.code\)/);
    expect(shorts).toMatch(/Couldn't undo repost/);
    expect(shorts).toMatch(/Your repost is still live/);
  });

  it("Undo success confirms the parent-owner notification was removed", () => {
    expect(shorts).toMatch(/Repost undone/);
    expect(shorts).toMatch(/notification was also removed/);
  });

  it("Button flips to a highlighted 'Reposted' state and is aria-pressed", () => {
    expect(shorts).toMatch(/aria-pressed=\{reposted\}/);
    expect(shorts).toMatch(/reposted\s*\?\s*"Reposted"/);
    expect(shorts).toMatch(/ring-2 ring-primary/);
  });

  it("undoRepost helper surfaces every server code with a friendly string", () => {
    for (const code of ["not_authenticated", "not_found", "not_owner", "not_a_repost", "window_expired"]) {
      expect(repostLib).toMatch(new RegExp(`${code}:`));
    }
  });
});
