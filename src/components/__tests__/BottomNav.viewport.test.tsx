import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BottomNav, { LAST_TAB_KEY, getRememberedBottomTab } from "../BottomNav";

/**
 * Simulated end-to-end check that the bottom navigation:
 *   1. is rendered (and visible) on mobile + tablet, hidden on desktop
 *   2. reflects the active tab via NavLink's `active` class
 *   3. persists the active tab to localStorage so we can restore it next visit
 *
 * We can't actually resize jsdom's screen, but the visibility contract is encoded
 * in the `lg:hidden` Tailwind class. Asserting the class is the layout equivalent
 * of asserting display:none at the lg breakpoint (>=1024px).
 */

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe("BottomNav viewport behavior", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const routes = ["/feed", "/battles", "/upload", "/me", "/map"];

  it.each(routes)("renders on mobile/tablet for %s and hides on desktop (lg+)", (path) => {
    renderAt(path);
    const nav = screen.getByTestId("bottom-nav");
    // Visible on viewports < lg (mobile + tablet)
    expect(nav).toBeInTheDocument();
    // The lg:hidden utility hides the nav from desktop (>=1024px) only
    expect(nav.className).toMatch(/\blg:hidden\b/);
    // Make sure no other utility forces it hidden on smaller screens
    expect(nav.className).not.toMatch(/\bhidden\b(?!\s|:)/); // "hidden" without a responsive prefix
    expect(nav.className).not.toMatch(/\bmd:hidden\b/);
  });

  it("marks the active tab on the current route", () => {
    renderAt("/battles");
    const battles = screen.getByTestId("bottom-nav-battles");
    expect(battles.className).toMatch(/text-primary/);
    const feed = screen.getByTestId("bottom-nav-feed");
    expect(feed.className).not.toMatch(/text-primary(?!-)/);
  });

  it("persists the last selected bottom-nav tab so it can be restored on return", () => {
    renderAt("/map");
    expect(localStorage.getItem(LAST_TAB_KEY)).toBe("/map");
    expect(getRememberedBottomTab()).toBe("/map");
  });

  it("ignores routes that aren't bottom-nav tabs when remembering", () => {
    renderAt("/settings");
    expect(getRememberedBottomTab()).toBeNull();
  });

  it("does not render on splash/auth/age-gate screens", () => {
    for (const p of ["/", "/auth", "/age-gate"]) {
      const { unmount } = renderAt(p);
      expect(screen.queryByTestId("bottom-nav")).toBeNull();
      unmount();
    }
  });
});
