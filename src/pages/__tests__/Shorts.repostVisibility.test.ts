/**
 * Source-contract test for Repost button visibility on Shorts (reels).
 *
 * Locks the visibility rules across Feed / Shorts / Battles so the same rules
 * apply everywhere:
 *   - Repost button is hidden ONLY for the post owner.
 *   - Anonymous viewers see the button (dialog surfaces "Sign in to repost").
 *   - Server (check_repost_eligibility / create_repost) is the source of
 *     truth for all eligibility rules — the client never bypasses it.
 *   - Repost count is rendered next to the Repost control when > 0.
 *
 * Also guards the SQL fix that stopped the repost dialog from surfacing
 * "Network error" when a viewer tried to repost an own/unavailable post:
 * check_repost_eligibility reasons must be single-quoted string literals,
 * not double-quoted identifiers.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const shorts = read("src/pages/Shorts.tsx");
const postCard = read("src/components/PostCard.tsx");

const migrations = readdirSync(join(process.cwd(), "supabase", "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(process.cwd(), "supabase", "migrations", f), "utf8"))
  .join("\n\n");

describe("Repost button visibility contract", () => {
  it("Shorts renders the Repost control for every viewer (server enforces self-repost block)", () => {
    // Product rule: Repost is always shown on Scrolls so the count is readable;
    // self-repost/owner-repost is blocked server-side by check_repost_eligibility
    // and surfaces a friendly "You can't repost your own post" message.
    expect(shorts).toMatch(/Repeat2/);
    expect(shorts).toMatch(/setRepostScroll\(p\)/);
    // Must NOT gate the button on ownership — anon + owner both see it.
    expect(shorts).not.toMatch(/!!user\?\.id\s*&&\s*user\.id\s*!==\s*p\.user_id[\s\S]*?Repeat2/);
  });


  it("Shorts renders the repost count next to the Repost control", () => {
    expect(shorts).toMatch(/p\.repost_count/);
  });

  it("Shorts routes taps through RepostDialog (server enforces eligibility)", () => {
    expect(shorts).toMatch(/setRepostScroll\(p\)/);
    expect(shorts).toMatch(/RepostDialog/);
  });

  it("Feed (PostCard) hides Repost only for the post owner and repost shells", () => {
    // Anonymous viewers must still see the button; dialog surfaces the
    // "Sign in to repost" prompt when they click.
    expect(postCard).toMatch(/!isOwner\s*&&\s*!isRepost/);
    expect(postCard).toMatch(/setRepostOpen\(true\)/);
    expect(postCard).toMatch(/counts\.reposts/);
  });

  it("Feed and Shorts both open the same RepostDialog component", () => {
    expect(postCard).toMatch(/<RepostDialog\b/);
    expect(shorts).toMatch(/<RepostDialog\b/);
  });
});

describe("check_repost_eligibility SQL string-literal fix", () => {
  it("uses single-quoted reason strings, never double-quoted identifiers", () => {
    const fn = migrations.match(
      /CREATE OR REPLACE FUNCTION public\.check_repost_eligibility[\s\S]+?\$function\$;/g,
    );
    expect(fn, "check_repost_eligibility migration not found").toBeTruthy();
    const latest = fn![fn!.length - 1];
    // The bug: `"You can\u2019t repost your own post."` — Postgres treats
    // double-quoted text as an identifier and throws at runtime, which the
    // client surfaces as "Network error".
    expect(latest).not.toMatch(/"You can/);
    expect(latest).not.toMatch(/"This post can/);
    // The fix: single-quoted literals with escaped apostrophes.
    expect(latest).toMatch(/'You can''t repost your own post\.'/);
    expect(latest).toMatch(/'This post can''t be reposted\.'/);
  });
});
