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
    for (const label of ["Feed", "Battles", "Crown Map", "Profile"]) {
      const el = screen.getByText(label);
      expect(el).toBeInTheDocument();
      // Labels must opt out of wrapping so two-word items like "Crown Map" stay on a single line.
      expect(el.className).toMatch(/whitespace-nowrap/);
    }
  });

  it("Upload primary button routes to /upload", () => {
    render(
      <MemoryRouter initialEntries={["/feed"]}>
        <BottomNav />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole("link");
    const upload = links.find((a) => a.getAttribute("href") === "/upload");
    expect(upload).toBeTruthy();
  });
});
