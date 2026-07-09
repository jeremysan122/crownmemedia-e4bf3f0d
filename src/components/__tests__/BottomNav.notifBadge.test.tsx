/**
 * Source-contract coverage for the Bottom Nav notifications badge.
 *
 * Locks:
 *   - The bottom nav renders a Notifications entry linking to /notifications.
 *   - It reads unread counts from the shared useUnreadByType hook (realtime
 *     with focus/visibility polling fallback — no per-render channel leak).
 *   - Badge shows only when count > 0.
 *   - Display is capped at "99+".
 *   - DMs are excluded (they have their own icon), matching AppShell logic.
 *   - No raw backend error text is rendered.
 *   - Marking notifications read (via the Notifications page) resets the
 *     unread count so the badge disappears — the Notifications page calls
 *     mark_all_notifications_read and the shared hook re-emits from realtime.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const bottomNav = read("src/components/BottomNav.tsx");
const notifsPage = read("src/pages/Notifications.tsx");
const useUnread = read("src/hooks/useUnreadByType.ts");

describe("BottomNav: notifications badge wiring", () => {
  it("includes a Notifications ('Alerts') item linking to /notifications", () => {
    expect(bottomNav).toMatch(/to:\s*["']\/notifications["']/);
    expect(bottomNav).toMatch(/icon:\s*Bell/);
  });

  it("reads unread counts from useUnreadByType (shared realtime singleton)", () => {
    expect(bottomNav).toMatch(/from\s+"@\/hooks\/useUnreadByType"/);
    expect(bottomNav).toMatch(/useUnreadByType\(\)/);
  });

  it("excludes DMs from the notif badge (matches AppShell top-bar logic)", () => {
    expect(bottomNav).toMatch(/unread\.total\s*-\s*unread\.dm/);
  });

  it("caps the display at 99+", () => {
    expect(bottomNav).toMatch(/notifCount\s*>\s*99\s*\?\s*["']99\+["']/);
  });

  it("hides the badge when count is 0", () => {
    // showBadge === true only when notifCount > 0
    expect(bottomNav).toMatch(/notifCount\s*>\s*0/);
    expect(bottomNav).toMatch(/showBadge\s*&&/);
  });

  it("uses the shared destructive pill styling with tabular-nums + a11y label", () => {
    expect(bottomNav).toMatch(/bg-destructive/);
    expect(bottomNav).toMatch(/tabular-nums/);
    expect(bottomNav).toMatch(/`\$\{label\},\s*\$\{notifCount\}\s+unread`/);
  });

  it("does not render raw backend error text anywhere in the bottom nav", () => {
    expect(bottomNav).not.toMatch(/err\.message|error\.message/);
  });
});

describe("Unread reset behavior", () => {
  it("opening Notifications page exposes a Mark all read action wired to the RPC", () => {
    expect(notifsPage).toMatch(/mark_all_notifications_read/);
    expect(notifsPage).toMatch(/Mark all read/);
  });

  it("useUnreadByType listens to * events on notifications so read-flag flips propagate", () => {
    expect(useUnread).toMatch(/event:\s*"\*"/);
    expect(useUnread).toMatch(/table:\s*"notifications"/);
  });

  it("useUnreadByType refreshes on focus/visibility (fallback if realtime drops)", () => {
    expect(useUnread).toMatch(/visibilitychange/);
    expect(useUnread).toMatch(/window\.addEventListener\(["']focus["']/);
  });

  it("shared singleton prevents double-counting on reconnect", () => {
    expect(useUnread).toMatch(/let currentUserId/);
    expect(useUnread).toMatch(/if\s*\(currentUserId\s*===\s*userId\s*&&\s*channel\)\s*return/);
  });
});
