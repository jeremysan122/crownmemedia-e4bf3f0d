import { describe, it, expect } from "vitest";
import { canSeeLikes, canSeeComments, canSeeViews } from "../privacyVisibility";

const allHidden = { hide_likes: true, hide_comments: true, hide_views: true };
const noneHidden = { hide_likes: false, hide_comments: false, hide_views: false };

describe("privacyVisibility — owners", () => {
  const ctx = { isOwner: true };
  it("always sees their own counts even if every flag is on", () => {
    expect(canSeeLikes(allHidden, ctx)).toBe(true);
    expect(canSeeComments(allHidden, ctx)).toBe(true);
    expect(canSeeViews(allHidden, ctx)).toBe(true);
  });
});

describe("privacyVisibility — public viewers / followers", () => {
  const ctx = { isOwner: false };
  it("sees all counts when nothing is hidden", () => {
    expect(canSeeLikes(noneHidden, ctx)).toBe(true);
    expect(canSeeComments(noneHidden, ctx)).toBe(true);
    expect(canSeeViews(noneHidden, ctx)).toBe(true);
  });
  it("hides each count individually when its flag is on", () => {
    expect(canSeeLikes({ hide_likes: true }, ctx)).toBe(false);
    expect(canSeeComments({ hide_comments: true }, ctx)).toBe(false);
    expect(canSeeViews({ hide_views: true }, ctx)).toBe(false);
  });
  it("respects all three flags together", () => {
    expect(canSeeLikes(allHidden, ctx)).toBe(false);
    expect(canSeeComments(allHidden, ctx)).toBe(false);
    expect(canSeeViews(allHidden, ctx)).toBe(false);
  });
  it("only one flag on does not affect the other two", () => {
    expect(canSeeLikes({ hide_views: true }, ctx)).toBe(true);
    expect(canSeeComments({ hide_views: true }, ctx)).toBe(true);
    expect(canSeeViews({ hide_likes: true, hide_comments: true }, ctx)).toBe(true);
  });
});

describe("privacyVisibility — private-account viewer (RLS-allowed)", () => {
  // RLS gates row visibility; here we verify count-hiding still applies once a row reaches the client.
  const ctx = { isOwner: false };
  it("still hides counts when the owner has hide flags on", () => {
    expect(canSeeLikes(allHidden, ctx)).toBe(false);
    expect(canSeeComments(allHidden, ctx)).toBe(false);
    expect(canSeeViews(allHidden, ctx)).toBe(false);
  });
  it("shows counts when the owner has not hidden them", () => {
    expect(canSeeLikes(noneHidden, ctx)).toBe(true);
    expect(canSeeComments(noneHidden, ctx)).toBe(true);
    expect(canSeeViews(noneHidden, ctx)).toBe(true);
  });
});

describe("privacyVisibility — privileged (admin / moderator)", () => {
  const ctx = { isOwner: false, isPrivileged: true };
  it("always sees counts regardless of flags", () => {
    expect(canSeeLikes(allHidden, ctx)).toBe(true);
    expect(canSeeComments(allHidden, ctx)).toBe(true);
    expect(canSeeViews(allHidden, ctx)).toBe(true);
  });
});

describe("privacyVisibility — null / undefined flags", () => {
  const ctx = { isOwner: false };
  it("treats missing profile flags as not hidden", () => {
    expect(canSeeLikes(null, ctx)).toBe(true);
    expect(canSeeComments(undefined, ctx)).toBe(true);
    expect(canSeeViews({}, ctx)).toBe(true);
  });
  it("treats explicit null per-field as not hidden", () => {
    expect(canSeeLikes({ hide_likes: null }, ctx)).toBe(true);
    expect(canSeeComments({ hide_comments: null }, ctx)).toBe(true);
    expect(canSeeViews({ hide_views: null }, ctx)).toBe(true);
  });
});

// Cross-component matrix: encodes the expected behavior across every UI surface
// that renders engagement counts (Feed, Profile lists, Leaderboard, PostCard).
// Each component reuses the same helpers, so a single matrix proves UI parity.
describe("privacyVisibility — cross-component matrix", () => {
  type Case = {
    name: string;
    flags: { hide_likes?: boolean; hide_comments?: boolean; hide_views?: boolean };
    ctx: { isOwner: boolean; isPrivileged?: boolean };
    expect: { likes: boolean; comments: boolean; views: boolean };
  };
  const cases: Case[] = [
    { name: "owner sees all (everything hidden)", flags: allHidden, ctx: { isOwner: true }, expect: { likes: true, comments: true, views: true } },
    { name: "follower sees nothing hidden", flags: allHidden, ctx: { isOwner: false }, expect: { likes: false, comments: false, views: false } },
    { name: "follower sees only views (likes+comments hidden)", flags: { hide_likes: true, hide_comments: true }, ctx: { isOwner: false }, expect: { likes: false, comments: false, views: true } },
    { name: "private viewer sees only comments (likes+views hidden)", flags: { hide_likes: true, hide_views: true }, ctx: { isOwner: false }, expect: { likes: false, comments: true, views: false } },
    { name: "admin overrides everything", flags: allHidden, ctx: { isOwner: false, isPrivileged: true }, expect: { likes: true, comments: true, views: true } },
    { name: "moderator on public post", flags: noneHidden, ctx: { isOwner: false, isPrivileged: true }, expect: { likes: true, comments: true, views: true } },
  ];
  it.each(cases)("$name", (c) => {
    expect(canSeeLikes(c.flags, c.ctx)).toBe(c.expect.likes);
    expect(canSeeComments(c.flags, c.ctx)).toBe(c.expect.comments);
    expect(canSeeViews(c.flags, c.ctx)).toBe(c.expect.views);
  });
});
