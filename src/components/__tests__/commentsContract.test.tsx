/**
 * Comments contract — mobile/tablet must always use the universal popup.
 *
 * These tests are a guard against regressions where a comment button might:
 *   - navigate to /post/:id
 *   - render an embedded composer below the post on mobile/tablet
 *   - bypass the canonical postId / crownme:comment-added event
 *
 * We deliberately keep these tests source-level and event-level (rather than
 * trying to mount full PostCard with all of its Supabase/auth deps) so they
 * stay fast and stable while still locking in the contract.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { render as rtlRender, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const render = (ui: React.ReactElement) =>
  rtlRender(<QueryClientProvider client={makeClient()}>{ui}</QueryClientProvider>);

const read = (p: string) => readFileSync(path.resolve(__dirname, "../../../", p), "utf8");

describe("Mobile/tablet comments contract (source-level)", () => {
  const postCard = read("src/components/PostCard.tsx");
  const postDetailDialog = read("src/components/PostDetailDialog.tsx");
  const shorts = read("src/pages/Shorts.tsx");
  const feed = read("src/pages/Feed.tsx");

  it("PostCard comment button does not navigate to /post/:id", () => {
    // The only allowed /post/ reference in PostCard is the repost parent link.
    const matches = postCard.match(/\/post\//g) || [];
    expect(matches.length).toBeLessThanOrEqual(1);
    // And it must NOT live inside an onClick handler near MessageCircle.
    const msgIdx = postCard.indexOf("MessageCircle size=");
    const around = postCard.slice(Math.max(0, msgIdx - 600), msgIdx + 600);
    expect(around).not.toMatch(/navigate\(["'`]\/post\//);
    expect(around).not.toMatch(/to=["'`]\/post\//);
  });

  it("PostCard routes mobile/tablet comment clicks through the universal popup", () => {
    expect(postCard).toMatch(/useIsBelowDesktop/);
    expect(postCard).toMatch(/if \(isBelowDesktop\)/);
    expect(postCard).toMatch(/onCommentClick\(post\.id\)/);
    expect(postCard).toMatch(/CommentsDrawer/);
  });

  it("PostDetailDialog gates inline composer behind desktop", () => {
    expect(postDetailDialog).toMatch(/useIsBelowDesktop/);
    expect(postDetailDialog).toMatch(/CommentsDrawer/);
  });

  it("Shorts uses CommentsDrawer in place (no navigation to /post/:id on comment)", () => {
    // The only /post/ reference in Shorts is the shareable URL builder.
    const around = shorts.slice(
      shorts.indexOf("MessageCircle"),
      shorts.indexOf("MessageCircle") + 800,
    );
    expect(around).not.toMatch(/navigate\(["'`]\/post\//);
    expect(shorts).toMatch(/setCommentsPostId/);
  });

  it("Feed passes the canonical postId to the shared CommentsDrawer", () => {
    expect(feed).toMatch(/onCommentClick={setOpenComment}/);
    expect(feed).toMatch(/<CommentsDrawer\s+postId={openComment}/);
  });
});

// ---------------------------------------------------------------------------
// CommentsDrawer behavior
// ---------------------------------------------------------------------------
const insertMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: any[]) => fromMock(...args),
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", user_metadata: { username: "me" } } }),
}));

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import CommentsDrawer from "@/components/CommentsDrawer";
import { toast } from "sonner";

function setupQueryChain(rows: any[] = []) {
  // Chainable select().eq().eq().is().order() that resolves with { data: rows }
  const order = vi.fn().mockResolvedValue({ data: rows });
  const is = vi.fn().mockReturnValue({ order });
  const eq2 = vi.fn().mockReturnValue({ is, order });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2, is, order });
  const select = vi.fn().mockReturnValue({ eq: eq1, in: vi.fn().mockResolvedValue({ data: [] }) });
  return select;
}

describe("CommentsDrawer", () => {
  beforeEach(() => {
    insertMock.mockReset();
    fromMock.mockReset();
    fromMock.mockImplementation((table: string) => {
      if (table === "comments") {
        return {
          select: setupQueryChain([]),
          insert: (...args: any[]) => insertMock(...args),
        };
      }
      if (table === "comment_reactions") {
        return {
          select: () => ({ in: vi.fn().mockResolvedValue({ data: [] }) }),
        };
      }
      return { select: vi.fn(), insert: vi.fn() };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders a loading skeleton while comments load, then empty state", async () => {
    render(<CommentsDrawer postId="p1" onClose={() => {}} />);
    expect(await screen.findByTestId("comments-loading")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/Be the first to comment/i)).toBeInTheDocument(),
    );
  });

  it("optimistically shows the comment and dispatches crownme:comment-added on send", async () => {
    insertMock.mockResolvedValue({ error: null });
    const handler = vi.fn();
    window.addEventListener("crownme:comment-added", handler);

    render(<CommentsDrawer postId="p1" onClose={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText(/Be the first to comment/i)).toBeInTheDocument(),
    );

    const input = screen.getByLabelText("Add a comment") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hello world" } });
    fireEvent.click(screen.getByLabelText("Send comment"));

    // Optimistic row appears immediately.
    expect(await screen.findByText("hello world")).toBeInTheDocument();

    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    expect(insertMock).toHaveBeenCalledWith({
      post_id: "p1",
      user_id: "u1",
      body: "hello world",
    });

    await waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    const evt = handler.mock.calls[0][0] as CustomEvent;
    expect(evt.detail).toEqual({ postId: "p1" });

    window.removeEventListener("crownme:comment-added", handler);
  });

  it("rolls back optimistic row and restores text when insert fails", async () => {
    insertMock.mockResolvedValue({ error: { message: "boom" } });

    render(<CommentsDrawer postId="p1" onClose={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText(/Be the first to comment/i)).toBeInTheDocument(),
    );

    const input = screen.getByLabelText("Add a comment") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "oops" } });
    fireEvent.click(screen.getByLabelText("Send comment"));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("boom"));
    // Optimistic row is gone, text is restored.
    expect(screen.queryByText("oops")).not.toBeInTheDocument();
    expect((screen.getByLabelText("Add a comment") as HTMLInputElement).value).toBe("oops");
  });
});

describe("CommentsDrawer (logged-out)", () => {
  beforeEach(() => {
    fromMock.mockReset();
    fromMock.mockImplementation(() => ({
      select: setupQueryChain([]),
      insert: vi.fn(),
    }));
  });

  it("shows a sign-in prompt instead of the composer", async () => {
    vi.doMock("@/context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
    vi.resetModules();
    const { default: Drawer } = await import("@/components/CommentsDrawer");

    render(<Drawer postId="p1" onClose={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText(/Sign in/i)).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText("Add a comment")).not.toBeInTheDocument();
  });
});
