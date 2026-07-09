/**
 * Source-contract coverage for Scrolls/post comment notifications.
 *
 * Locks the server-side `trg_notify_comment` trigger and the client-side
 * routing/toaster contracts so:
 *   - When User B comments on User A's Scroll/post, A receives a notification.
 *   - When User A comments on their own post, no notification is created.
 *   - Payload carries post_id + comment_id + author_id (commenter).
 *   - Notification title/body are user-safe (no raw errors, capped body).
 *   - Deleted comments cannot re-fire the trigger.
 *   - Client routing sends the notification to /post/:id.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const migrations = readdirSync(join(process.cwd(), "supabase", "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => read(join("supabase", "migrations", f)))
  .join("\n\n");

const routing = read("src/lib/notificationRouting.ts");
const toaster = read("src/components/NotificationToaster.tsx");
const notifsPage = read("src/pages/Notifications.tsx");

describe("trg_notify_comment trigger contract", () => {
  const matches = migrations.match(
    /CREATE OR REPLACE FUNCTION public\.trg_notify_comment\(\)[\s\S]+?\$function\$;/g,
  ) ?? migrations.match(
    /create or replace function public\.trg_notify_comment\(\)[\s\S]+?\$function\$;/gi,
  );
  const latest = matches ? matches[matches.length - 1] : "";

  it("is registered on public.comments AFTER INSERT", () => {
    expect(latest).toBeTruthy();
    expect(migrations).toMatch(
      /create trigger[\s\S]+?after insert on public\.comments[\s\S]+?trg_notify_comment/i,
    );
  });

  it("resolves the post owner from public.posts (target = original author)", () => {
    expect(latest).toMatch(/select\s+user_id\s+into\s+v_owner\s+from\s+public\.posts\s+where\s+id\s*=\s*new\.post_id/i);
  });

  it("skips notifying when the commenter is the post owner (no self-notify)", () => {
    expect(latest).toMatch(/v_owner\s*=\s*new\.user_id[\s\S]*?return null/i);
  });

  it("payload includes post_id, comment_id, and commenter (author_id)", () => {
    expect(latest).toMatch(/'post_id'\s*,\s*new\.post_id/);
    expect(latest).toMatch(/'comment_id'\s*,\s*new\.id/);
    expect(latest).toMatch(/'author_id'\s*,\s*new\.user_id/);
  });

  it("body is truncated to a user-safe length (no raw backend text leaks)", () => {
    expect(latest).toMatch(/left\(new\.body,\s*80\)/i);
  });

  it("title is a friendly, user-facing string (not an error code)", () => {
    expect(latest).toMatch(/'New comment'/);
  });

  it("uses AFTER INSERT only — DELETE/UPDATE cannot re-fire duplicate notifications", () => {
    // trg fires only on tg_op = 'INSERT'; and the trigger DDL uses AFTER INSERT.
    expect(latest).toMatch(/tg_op\s*=\s*'INSERT'/i);
    expect(migrations).not.toMatch(/create trigger[\s\S]+?after (update|delete) on public\.comments[\s\S]+?trg_notify_comment/i);
  });
});

describe("Client routing/render contract for comment notifications", () => {
  it("routes 'comment' notifications to /post/:post_id", () => {
    expect(routing).toMatch(/case\s+["']comment["']/);
    expect(routing).toMatch(/\/post\/\$\{[^}]*post_id[^}]*\}/);
  });

  it("Notifications page never renders raw backend error text to users", () => {
    // On load failure it renders a friendly copy, not err.message.
    expect(notifsPage).toMatch(/Couldn't load notifications/);
    expect(notifsPage).not.toMatch(/\{err\.message\}/);
    expect(notifsPage).not.toMatch(/\{error\.message\}/);
  });

  it("global toaster de-dupes so a single comment can't produce two toasts", () => {
    expect(toaster).toMatch(/seen\.current\.has\(n\.id\)/);
  });
});
