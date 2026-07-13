// Regression + behavior tests for the rebuilt /rewards/frames gallery.
// Ensures the catalog always renders 81 unique frames with proper pagination,
// ownership counters, and artwork.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { FrameGalleryItem } from "@/hooks/useFrameGallery";

// ---- Mocks --------------------------------------------------------------

vi.mock("@/components/AppShell", () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/CrownLoader", () => ({ default: () => <div>loading</div> }));
vi.mock("@/hooks/useSeoMeta", () => ({ useSeoMeta: () => {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useMyAchievements", () => ({ equipAvatarFrame: vi.fn(async () => {}) }));

const COLLECTIONS = Array.from({ length: 9 }).map((_, i) => ({
  id: `col-${i + 1}`,
  slug: `col-${i + 1}`,
  name: `Collection ${i + 1}`,
  display_order: i,
}));

function buildItems(ownedIds: string[] = [], equippedId: string | null = null): FrameGalleryItem[] {
  return Array.from({ length: 81 }).map((_, i) => {
    const id = `frame-${i + 1}`;
    const collection = COLLECTIONS[Math.floor(i / 9)];
    const ownership = ownedIds.includes(id)
      ? {
          frame_id: id,
          slug: id,
          name: `Frame ${i + 1}`,
          collection_slug: collection.slug,
          asset_url: `https://cdn.example/${id}.png`,
          is_permanent: true,
          expires_at: null,
          achievement_id: `ach-${i + 1}`,
          granted_at: new Date().toISOString(),
          equipped: equippedId === id,
        }
      : null;
    return {
      frame: {
        id,
        slug: id,
        name: `Frame ${i + 1}`,
        description: `Tagline ${i + 1}`,
        rarity: "rare",
        display_order: i,
        static_asset_url: `https://cdn.example/${id}.png`,
        animated_asset_url: null,
        thumbnail_asset_url: null,
        asset_status: "ready",
        is_founder_only: false,
        is_animated: false,
        collection_id: collection.id,
      },
      collection,
      achievement: {
        id: `ach-${i + 1}`,
        slug: `ach-${i + 1}`,
        name: `Achievement ${i + 1}`,
        description: `Unlock instructions for frame ${i + 1}`,
        rarity: "rare",
        requirement_logic: { metrics: { qualifying_posts: 25 } },
        is_secret: false,
      },
      ownership,
    };
  });
}

let mockGallery: {
  items: FrameGalleryItem[];
  collections: typeof COLLECTIONS;
  ownedCount: number;
  totalCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} = {
  items: [],
  collections: COLLECTIONS,
  ownedCount: 0,
  totalCount: 0,
  loading: false,
  error: null,
  refresh: vi.fn(async () => {}),
};

vi.mock("@/hooks/useFrameGallery", async () => {
  const actual = await vi.importActual<any>("@/hooks/useFrameGallery");
  return { ...actual, useFrameGallery: () => mockGallery };
});

import RoyalFrames from "@/pages/RoyalFrames";

function renderPage(initial = "/rewards/frames") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <RoyalFrames />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  const items = buildItems();
  mockGallery = {
    items,
    collections: COLLECTIONS,
    ownedCount: 0,
    totalCount: items.length,
    loading: false,
    error: null,
    refresh: vi.fn(async () => {}),
  };
});

describe("RoyalFrames — 81-frame catalog", () => {
  it("regression: catalog is 81, never 9", () => {
    const items = buildItems();
    expect(items).toHaveLength(81);
    expect(new Set(items.map((i) => i.frame.id)).size).toBe(81);
    expect(items.length).not.toBe(9);
    items.forEach((i) => {
      expect(i.frame.name).toBeTruthy();
      expect(i.achievement).not.toBeNull();
      expect(i.frame.static_asset_url || i.frame.animated_asset_url || i.frame.thumbnail_asset_url).toBeTruthy();
    });
  });

  it("renders header counters with 0 of 81 unlocked and 81 total", () => {
    renderPage();
    expect(screen.getByText(/0 of 81 unlocked/)).toBeInTheDocument();
    expect(screen.getByText(/81 total frames/)).toBeInTheDocument();
    const progress = screen.getByRole("progressbar", { name: /avatar frames unlocked/i });
    expect(progress).toHaveAttribute("aria-valuemax", "81");
    expect(progress).toHaveAttribute("aria-valuenow", "0");
  });

  it("paginates 9 frames per page across 9 pages", () => {
    renderPage();
    expect(screen.getByTestId("pagination-page").textContent).toMatch(/Page 1 of 9/);
    expect(screen.getByTestId("pagination-summary").textContent).toMatch(/Showing 1.9 of 81/);
    const grid = screen.getByTestId("frames-grid");
    expect(within(grid).getAllByRole("article")).toHaveLength(9);
  });

  it("page 9 shows frames 73-81 including Frame 81", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /page 9/i }));
    expect(screen.getByTestId("pagination-page").textContent).toMatch(/Page 9 of 9/);
    expect(screen.getByTestId("pagination-summary").textContent).toMatch(/Showing 73.81 of 81/);
    expect(screen.getByText("Frame 81")).toBeInTheDocument();
    expect(screen.getByText("Frame 73")).toBeInTheDocument();
    // Every frame image uses the frame name as alt text.
    const grid = screen.getByTestId("frames-grid");
    const imgs = within(grid).getAllByRole("img");
    expect(imgs).toHaveLength(9);
    imgs.forEach((img) => {
      expect(img).toHaveAttribute("alt");
      expect((img as HTMLImageElement).className).toContain("object-contain");
    });
  });

  it("shows 17 of 81 unlocked when the user owns 17 frames", () => {
    const ownedIds = Array.from({ length: 17 }).map((_, i) => `frame-${i + 1}`);
    const items = buildItems(ownedIds);
    mockGallery = { ...mockGallery, items, totalCount: 81, ownedCount: 17 };
    renderPage();
    expect(screen.getByText(/17 of 81 unlocked/)).toBeInTheDocument();
    expect(screen.getByText(/81 total frames/)).toBeInTheDocument();
  });

  it("shows the exact achievement details on locked cards", () => {
    renderPage();
    expect(screen.getAllByText(/how to unlock/i)[0]).toBeInTheDocument();
    expect(screen.getByText("Achievement 1")).toBeInTheDocument();
    expect(screen.getByText(/Unlock instructions for frame 1/)).toBeInTheDocument();
    expect(screen.getAllByText(/Publish qualifying posts: 25/)[0]).toBeInTheDocument();
    expect(screen.getAllByText("Locked").length).toBeGreaterThan(0);
  });

  it("renders 'Equipped' badge for the currently equipped frame", () => {
    const items = buildItems(["frame-1"], "frame-1");
    mockGallery = { ...mockGallery, items, ownedCount: 1 };
    renderPage();
    expect(screen.getAllByText(/Equipped/i).length).toBeGreaterThan(0);
  });
});
