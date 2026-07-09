/**
 * Notification UI contract for Scrolls reposts.
 *
 * Verifies the server-side notify_on_repost trigger and the client-side
 * NotificationToaster together deliver the "Someone reposted your Scroll"
 * toast to the ORIGINAL poster — but never to the reposter when they
 * repost their own post (which is already blocked by create_repost).
 *
 * These are source-contract tests: they read the migration + client files
 * and lock the guarantees so a future change can't silently break the
 * notification path.
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

const toaster = read("src/components/NotificationToaster.tsx");
const repostLib = read("src/lib/repost.ts");

describe("notify_on_repost trigger contract", () => {
  it("inserts a notification of type 'repost' into public.notifications", () => {
    expect(migrations).toMatch(/CREATE OR REPLACE FUNCTION public\.notify_on_repost/);
    expect(migrations).toMatch(/INSERT INTO public\.notifications[\s\S]+?'repost'::public\.notification_type/);
  });

  it("skips notifying when the reposter is the original owner (self-repost)", () => {
    // Self-repost is already blocked by create_repost, but the trigger
    // must remain defensive — a manual insert must not notify yourself.
    expect(migrations).toMatch(/v_parent_owner\s*=\s*NEW\.user_id[\s\S]*?RETURN NEW/);
  });

  it("targets the parent post owner, not the reposter", () => {
    expect(migrations).toMatch(/user_id\s+INTO\s+v_parent_owner\s+FROM\s+public\.posts/);
    expect(migrations).toMatch(/VALUES\s*\(\s*v_parent_owner\s*,/);
  });

  it("payload includes repost_id + parent_post_id so undo can clean it up", () => {
    expect(migrations).toMatch(/'repost_id'\s*,\s*NEW\.id/);
    expect(migrations).toMatch(/'parent_post_id'\s*,\s*NEW\.parent_post_id/);
  });

  it("undo_repost deletes the matching notification row so the toast can't linger", () => {
    expect(migrations).toMatch(
      /DELETE FROM public\.notifications[\s\S]+?'repost'::public\.notification_type[\s\S]+?\(payload->>'repost_id'\)::uuid\s*=\s*p_repost_id/,
    );
  });

  it("trigger fires only for repost rows (parent_post_id NOT NULL)", () => {
    expect(migrations).toMatch(
      /CREATE TRIGGER trg_notify_on_repost[\s\S]+?WHEN\s*\(NEW\.parent_post_id IS NOT NULL\)/,
    );
  });
});

describe("Global NotificationToaster delivery contract", () => {
  it("subscribes to INSERTs on public.notifications filtered to the current user", () => {
    expect(toaster).toMatch(/table:\s*"notifications"/);
    expect(toaster).toMatch(/filter:\s*`user_id=eq\.\$\{user\.id\}`/);
    expect(toaster).toMatch(/event:\s*"INSERT"/);
  });

  it("renders a toast for every unseen notification (no type filter — 'repost' passes through)", () => {
    expect(toaster).toMatch(/toast\(n\.title/);
    // No allow-list of notification types is imposed here.
    expect(toaster).not.toMatch(/n\.type\s*===\s*['"](?!repost)/);
  });

  it("de-dupes so a single repost never produces two toasts", () => {
    expect(toaster).toMatch(/seen\.current\.has\(n\.id\)/);
    expect(toaster).toMatch(/seen\.current\.add\(n\.id\)/);
  });
});

describe("Client never re-notifies when a self-repost is attempted", () => {
  it("friendlyRepostMessage maps 'own_post' to the user-facing block copy", () => {
    expect(repostLib).toMatch(/own_post:\s*["']You can't repost your own post\.["']/);
  });
});
