import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BottomNav from "../BottomNav";

/**
 * Visual-regression guard for the mobile bottom nav.
 * Catches accidental label wraps (e.g. "Crown Map") and ensures the
 * "Crown a Post" / Upload primary action always navigates to /upload
 * across breakpoints.
 */
describe("BottomNav layout", () => {
  it("renders all five tabs with non-wrapping labels", () => {
    render(
      <MemoryRouter initialEntries={["/feed"]}>
        <BottomNav />
      </MemoryRouter>,
    );
    for (const label of ["Feed", "Scrolls", "Map", "Battles", "Ranks", "Profile"]) {
      const el = screen.getByText(label);
      expect(el).toBeInTheDocument();
      // Labels must opt out of wrapping so two-word items like "Crown Map" stay on a single line.
      expect(el.className).toMatch(/whitespace-nowrap/);
    }
  });

  it("primary action opens the Create sheet (not a route to /upload)", () => {
    render(
      <MemoryRouter initialEntries={["/feed"]}>
        <BottomNav />
      </MemoryRouter>,
    );
    // The IG-style + button is a sheet trigger, not a <Link>.
    const createBtn = screen.getByRole("button", { name: /create/i });
    expect(createBtn).toBeInTheDocument();
    // And there should be no legacy /upload link in the nav.
    const links = screen.queryAllByRole("link");
    expect(links.find((a) => a.getAttribute("href") === "/upload")).toBeUndefined();
  });
});
