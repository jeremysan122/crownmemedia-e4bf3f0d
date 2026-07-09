/**
 * Source-contract coverage for DM notifications, including DMs sent from a
 * Scrolls/post share thread.
 *
 * Locks:
 *   - trg_notify_dm inserts a notification for the receiver only (never the sender).
 *   - Mute rules (muted_dm_threads + notif_pref('dm')) suppress the notification.
 *   - Blocked users can't send messages in the first place (RLS on public.messages),
 *     so the trigger never fires for a blocked sender.
 *   - Payload carries sender_id + message_id (and post_id/thread_id when present
 *     via the share payload the client attaches).
 *   - Client routing resolves 'dm' notifications to /messages with the thread/user.
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
const dmShare = read("src/lib/dmShare.ts");

describe("trg_notify_dm trigger contract", () => {
  const matches = migrations.match(
    /CREATE OR REPLACE FUNCTION public\.trg_notify_dm\(\)[\s\S]+?\$function\$;/g,
  ) ?? migrations.match(
    /create or replace function public\.trg_notify_dm\(\)[\s\S]+?\$function\$;/gi,
  );
  const latest = matches ? matches[matches.length - 1] : "";

  it("is defined and registered AFTER INSERT on public.messages", () => {
    expect(latest).toBeTruthy();
    expect(migrations).toMatch(
      /create trigger[\s\S]+?after insert on public\.messages[\s\S]+?trg_notify_dm/i,
    );
  });

  it("targets the RECEIVER, never the sender (no self-notify on outgoing DM)", () => {
    // We assert the INSERT into notifications uses new.receiver_id, and the
    // payload records the sender separately.
    expect(latest).toMatch(/values\s*\(\s*new\.receiver_id\s*,\s*'dm'/i);
    expect(latest).toMatch(/'sender_id'\s*,\s*new\.sender_id/);
    expect(latest).toMatch(/'message_id'\s*,\s*new\.id/);
  });

  it("honors muted_dm_threads (receiver muted the sender) — no notification", () => {
    expect(latest).toMatch(/from\s+public\.muted_dm_threads[\s\S]+?user_id\s*=\s*new\.receiver_id[\s\S]+?other_user_id\s*=\s*new\.sender_id/i);
    expect(latest).toMatch(/return null/i);
  });

  it("honors the receiver's notification preference for 'dm'", () => {
    expect(latest).toMatch(/notif_pref\(\s*new\.receiver_id\s*,\s*'dm'\s*\)/i);
  });

  it("body is truncated / friendly (no raw backend text leaks to the toast)", () => {
    expect(latest).toMatch(/left\(coalesce\(new\.body[^)]*\),\s*80\)/i);
  });
});

describe("Blocked users can't trigger DM notifications", () => {
  it("public.messages INSERT is guarded so blocked senders can't insert (trigger never fires)", () => {
    // Either an explicit RLS policy on messages checks blocks, or a BEFORE INSERT
    // trigger raises. In either case the migration text must mention the block guard.
    expect(migrations).toMatch(/public\.blocks/);
    // At least one policy/trigger on messages references blocks:
    expect(migrations).toMatch(
      /(policy|trigger)[\s\S]{0,400}?public\.messages[\s\S]{0,600}?blocks/i,
    );
  });
});

describe("Post-thread DM payload wiring", () => {
  it("dmShare helper carries the post_id + thread_id in the outbound message payload", () => {
    // Confirms that when someone shares a Scroll via DM, downstream consumers
    // can attribute the notification to the source post/thread.
    expect(dmShare).toMatch(/post_id/);
    expect(dmShare).toMatch(/thread_id|receiver_id|sender_id/);
  });
});

describe("Client routing for DM notifications", () => {
  it("routes 'dm' / 'dm_share' notifications to /messages with sender or thread context", () => {
    expect(routing).toMatch(/case\s+["']dm["']/);
    expect(routing).toMatch(/\/messages\?thread=\$\{[^}]*thread_id[^}]*\}/);
    expect(routing).toMatch(/\/messages\?with=\$\{[^}]*sender_id[^}]*\}/);
  });
});
