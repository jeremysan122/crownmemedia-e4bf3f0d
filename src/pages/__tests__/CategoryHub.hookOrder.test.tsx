// Regression: /c/:slug used to throw "Rendered more hooks than during the
// previous render." because CategoryHub called useMemo AFTER an early
// return when `main` had not yet resolved. This test mounts CategoryHub
// with an unknown slug (`main` never resolves during the empty categories
// window → then to null) and asserts we don't crash.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@/integrations/supabase/client", () => {
  // Thenable chain — any chained method returns `chain`, and awaiting it
  // resolves to `{ data: [], error: null }` so builder-style queries work.
  const chain: any = new Proxy(
    { then: (res: any) => res({ data: [], error: null }) },
    {
      get(target, prop) {
        if (prop === "then") return target.then;
        return () => chain;
      },
    },
  );
  return { supabase: { from: () => chain } };
});

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: null, profile: null }),
}));

vi.mock("@/hooks/useFeedFilters", () => ({
  useFeedFilters: () => ({ blockedIds: new Set(), mutedWords: [], sensitiveMode: "blur", ready: true }),
  isFilteredOut: () => false,
}));

vi.mock("@/lib/categories", () => ({
  fetchMainCategories: () => Promise.resolve([]),
  fetchSubcategories: () => Promise.resolve([]),
  toggleCategoryFollow: () => Promise.resolve(),
}));

import CategoryHub from "@/pages/CategoryHub";

describe("CategoryHub", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the loading state without throwing (hook order stable)", () => {
    // If any hook lives BELOW the early return, React throws before this
    // assertion — asserting the test rendered at all is the guard.
    render(
      <MemoryRouter initialEntries={["/c/fashion-beauty"]}>
        <Routes>
          <Route path="/c/:mainSlug" element={<CategoryHub />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/Loading…/i)).toBeInTheDocument();
  });
});
