/**
 * Source-contract coverage for the notifications badge.
 *
 * The bottom nav intentionally does NOT render a notifications item —
 * that would duplicate the top header bell. Coverage here locks:
 *   - BottomNav has no /notifications entry, no Bell icon, no notif badge.
 *   - AppShell top header renders the Bell + destructive-pill unread badge
 *     capped at "99+", excluding DMs (they have their own icon).
 *   - The header count uses the shared useUnreadByType singleton
 *     (realtime + focus/visibility polling fallback).
 *   - Notifications page exposes Mark all read wired to the RPC so the
 *     header badge resets when the user opens Notifications.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const bottomNav = read("src/components/BottomNav.tsx");
const appShell = read("src/components/AppShell.tsx");
const notifsPage = read("src/pages/Notifications.tsx");
const useUnread = read("src/hooks/useUnreadByType.ts");

describe("BottomNav: no duplicate notifications item", () => {
  it("does not include a /notifications nav entry", () => {
    expect(bottomNav).not.toMatch(/to:\s*["']\/notifications["']/);
  });

  it("does not import or render the Bell icon", () => {
    expect(bottomNav).not.toMatch(/\bBell\b/);
  });

  it("does not render a bottom-nav-notif-badge element", () => {
    expect(bottomNav).not.toMatch(/bottom-nav-notif-badge/);
  });

  it("does not read useUnreadByType (header owns the badge)", () => {
    expect(bottomNav).not.toMatch(/useUnreadByType/);
  });
});

describe("Header notification badge (AppShell)", () => {
  it("renders a Bell link to /notifications", () => {
    expect(appShell).toMatch(/to="\/notifications"/);
    expect(appShell).toMatch(/<Bell\s/);
  });

  it("uses useUnreadByType for the unread count", () => {
    expect(appShell).toMatch(/from\s+"@\/hooks\/useUnreadByType"/);
    expect(appShell).toMatch(/useUnreadByType\(\)/);
  });

  it("excludes DMs from the notif badge", () => {
    expect(appShell).toMatch(/unread\.total\s*-\s*unread\.dm/);
  });

  it("hides the badge at 0 and caps display at 99+", () => {
    expect(appShell).toMatch(/notifCount\s*>\s*0/);
    expect(appShell).toMatch(/notifCount\s*>\s*99\s*\?\s*"99\+"/);
  });

  it("uses destructive pill styling with tabular-nums", () => {
    expect(appShell).toMatch(/bg-destructive/);
    expect(appShell).toMatch(/tabular-nums/);
  });

  it("uses an accessible aria-label mentioning unread count", () => {
    expect(appShell).toMatch(/aria-label=\{`Notifications\$\{notifCount \? `, \$\{notifCount\} unread` : ""\}`\}/);
  });

  it("does not render raw backend error text", () => {
    expect(appShell).not.toMatch(/err\.message|error\.message/);
  });
});

describe("Unread reset behavior", () => {
  it("Notifications page exposes Mark all read wired to the RPC", () => {
    expect(notifsPage).toMatch(/mark_all_notifications_read/);
    expect(notifsPage).toMatch(/Mark all read/);
  });

  it("useUnreadByType listens to * events on notifications", () => {
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
