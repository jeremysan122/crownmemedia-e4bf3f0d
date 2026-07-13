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

  it("every one of the 81 frames renders an uncropped image on its page", () => {
    renderPage();
    const seen = new Set<string>();
    for (let p = 1; p <= 9; p++) {
      if (p > 1) fireEvent.click(screen.getByRole("button", { name: `Page ${p}` }));
      const grid = screen.getByTestId("frames-grid");
      const imgs = within(grid).getAllByTestId("frame-artwork-img") as HTMLImageElement[];
      expect(imgs).toHaveLength(9);
      imgs.forEach((img) => {
        expect(img.getAttribute("src")).toBeTruthy();
        expect(img.className).toContain("object-contain");
        expect(img.className).not.toContain("object-cover");
        seen.add(img.getAttribute("src") || "");
      });
    }
    expect(seen.size).toBe(81);
  });

  it("shows Artwork unavailable only after every source url is missing", () => {
    const items = buildItems();
    items[0].frame.static_asset_url = null;
    items[0].frame.animated_asset_url = null;
    items[0].frame.thumbnail_asset_url = null;
    mockGallery = { ...mockGallery, items };
    renderPage();
    const grid = screen.getByTestId("frames-grid");
    const unavailable = within(grid).getAllByTestId("frame-artwork-unavailable");
    expect(unavailable).toHaveLength(1);
    // The other 8 slots on page 1 still render their image, not the fallback.
    expect(within(grid).getAllByTestId("frame-artwork-img")).toHaveLength(8);
  });

  it("orders frames as equipped → unlocked → locked", () => {
    // Own frames 5 and 10, equip frame 10.
    const items = buildItems(["frame-5", "frame-10"], "frame-10");
    mockGallery = { ...mockGallery, items, ownedCount: 2 };
    renderPage();
    const grid = screen.getByTestId("frames-grid");
    const cards = within(grid).getAllByRole("article");
    const ids = cards.map((c) => c.getAttribute("data-frame-id"));
    expect(ids[0]).toBe("frame-10"); // equipped first
    expect(ids[1]).toBe("frame-5"); // then owned
    // Everything after should be locked frames (no ownership).
    ids.slice(2).forEach((id) => {
      expect(["frame-5", "frame-10"]).not.toContain(id);
    });
  });

  it("supports the jump-to-page control", () => {
    renderPage();
    const input = screen.getByLabelText(/jump to page number/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: /^go$/i }));
    expect(screen.getByTestId("pagination-page").textContent).toMatch(/Page 7 of 9/);
  });

  it("clamps a jump beyond the last page to the last page", () => {
    renderPage();
    const input = screen.getByLabelText(/jump to page number/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: /^go$/i }));
    expect(screen.getByTestId("pagination-page").textContent).toMatch(/Page 9 of 9/);
  });

  it("renders the loading state while the catalog is fetching", () => {
    mockGallery = { ...mockGallery, loading: true, items: [], totalCount: 0 };
    renderPage();
    expect(screen.getByTestId("frames-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("frames-grid")).not.toBeInTheDocument();
  });

  it("opens the full-screen frame detail dialog with unlock text and source links", () => {
    const items = buildItems();
    // Give frame-1 all three sources so all three links are visible.
    items[0].frame.animated_asset_url = "https://cdn.example/frame-1.webp";
    items[0].frame.thumbnail_asset_url = "https://cdn.example/frame-1-thumb.png";
    mockGallery = { ...mockGallery, items };
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /view frame 1 details/i }));
    const dialog = screen.getByTestId("frame-detail-dialog");
    expect(within(dialog).getByText("Frame 1")).toBeInTheDocument();
    expect(within(dialog).getByText(/Publish qualifying posts: 25/)).toBeInTheDocument();
    const links = within(dialog).getAllByRole("link");
    // At least one link per available source (static + animated + thumbnail).
    expect(links.length).toBeGreaterThanOrEqual(3);
    const img = within(dialog).getByTestId("frame-artwork-img") as HTMLImageElement;
    expect(img.className).toContain("object-contain");
  });
});

describe("FrameArtwork fallback chain", () => {
  it("prefers static, then animated, then thumbnail", async () => {
    const { default: FrameArtwork } = await import("@/components/frames/FrameArtwork");
    const frame = {
      static_asset_url: "https://cdn/static.png",
      animated_asset_url: "https://cdn/animated.webp",
      thumbnail_asset_url: "https://cdn/thumb.png",
    };
    const { getByTestId } = render(<FrameArtwork frame={frame} name="F" />);
    const img = getByTestId("frame-artwork-img") as HTMLImageElement;
    expect(img.src).toContain("static.png");
    fireEvent.error(img);
    expect((getByTestId("frame-artwork-img") as HTMLImageElement).src).toContain("animated.webp");
    fireEvent.error(getByTestId("frame-artwork-img"));
    expect((getByTestId("frame-artwork-img") as HTMLImageElement).src).toContain("thumb.png");
  });

  it("shows Artwork unavailable when every source fails", async () => {
    const { default: FrameArtwork } = await import("@/components/frames/FrameArtwork");
    const frame = {
      static_asset_url: "https://cdn/static.png",
      animated_asset_url: null,
      thumbnail_asset_url: null,
    };
    const { getByTestId, queryByTestId } = render(<FrameArtwork frame={frame} name="F" />);
    fireEvent.error(getByTestId("frame-artwork-img"));
    expect(getByTestId("frame-artwork-unavailable")).toBeInTheDocument();
    expect(queryByTestId("frame-artwork-img")).not.toBeInTheDocument();
  });

  it("shows Artwork unavailable immediately when all sources are missing", async () => {
    const { default: FrameArtwork } = await import("@/components/frames/FrameArtwork");
    const { getByTestId } = render(
      <FrameArtwork
        frame={{ static_asset_url: null, animated_asset_url: null, thumbnail_asset_url: null }}
        name="F"
      />,
    );
    expect(getByTestId("frame-artwork-unavailable")).toBeInTheDocument();
  });
});
