# Category System, Discovery & Competition Upgrade — Phased Plan

The brief touches almost every surface in CrownMe (Upload, Feed, Discover, Battles, Leaderboards, Search, Profile, plus a new ranking/analytics layer). Shipping it in one pass would break existing crowns, rankings, and share cards. I'll break it into 4 phases. Each phase is independently shippable and testable.

We already have foundations from earlier work:
- `main_categories`, `subcategories`, `category_tags`, `category_follows`, `category_suggestions` tables
- `posts.main_category_slug` / `posts.subcategory_slug` (backfilled from legacy `CrownCategory`)
- `CategoryPicker`, `CategoryHub` (`/c/:mainSlug/:subSlug`), `Discover`, `AdminCategories`
- 15-hub / ~140-topic master list seeded with `legacy_enum` mapping preserved

This plan builds on top of that — no destructive migration of existing crowns.

---

## Phase 1 — Upload + Feed Filters (Foundation Hardening)

**Goal:** Every new post is guaranteed to have a valid (category, topic) pair, and users can filter the Feed by them.

- Upload: enforce required Master Category + Topic via stepped flow; block publish until both set; validate topic belongs to category (server-side trigger).
- Feed: persistent filter chip bar (All / Hub / Topic). Selection persists in `localStorage` and as URL params. Reactive query — no full refresh.
- DB: add CHECK trigger ensuring `posts.subcategory_slug` belongs to `posts.main_category_slug`. Backfill any nulls to `royal-crowns / overall`.

## Phase 2 — Discover Redesign + Category Detail

**Goal:** Premium browsing surface; one tap from hub card to topic list.

- Rebuild `Discover.tsx` with sections: Trending Hubs, Trending Topics, Recently Crowned, Rising Stars, Popular Near You (uses existing `profile.country/state/city`), Featured Competitions.
- Hub cards: icon, gradient, active competitors (7d), post count, trending arrow. Single-tap opens hub page.
- `CategoryHub` upgrade: show all topics inside the hub as a grid, plus Crown Holder strip, Top Competitors, Recent Winners, Active Battles widget.

## Phase 3 — Leaderboards (Category + Topic, Location + Time scoped)

**Goal:** Rankable competition surface.

- New tables:
  - `category_rankings(period, scope_type, scope_value, main_slug, subcategory_slug, user_id, rank, prev_rank, votes, crown_streak, snapshot_at)`
  - Index on `(period, scope_type, scope_value, main_slug, subcategory_slug, rank)`.
- Edge function `snapshot-category-ranks` (cron, hourly): recompute Today/Week/Month/AllTime × Global/Country/State/City for each hub+topic, capped per scope.
- UI: `/leaderboard/:mainSlug?topic=&scope=&period=` with movement arrows, crown indicators, animated rank changes (Framer Motion).
- Reuse `useLiveRank` patterns.

## Phase 4 — Battles, Search, Profile Integration

- **Battles:** add category/topic filter chips + location + sort (Trending/Newest/Most Competitive). Filter `battles` query by participant post category.
- **Search:** extend search index to return Categories, Topics, Category/Topic Leaderboards, Crown Holders. Update `Search.tsx` result grouping.
- **Profile:** new `ProfileCategoryRankings` card — top 5 hubs/topics with location-scoped rank (e.g., "Cars #14 in Green Bay"). Pulls from `category_rankings`.

---

## Technical Details

### Validation trigger (Phase 1)
```sql
CREATE OR REPLACE FUNCTION validate_post_category() RETURNS trigger AS $$
BEGIN
  IF NEW.main_category_slug IS NULL OR NEW.subcategory_slug IS NULL THEN
    RAISE EXCEPTION 'Posts must have main_category_slug and subcategory_slug';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM subcategories s
    JOIN main_categories m ON m.id = s.main_category_id
    WHERE m.slug = NEW.main_category_slug AND s.slug = NEW.subcategory_slug
  ) THEN
    RAISE EXCEPTION 'subcategory_slug % does not belong to main_category_slug %', NEW.subcategory_slug, NEW.main_category_slug;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
```

### Ranking snapshot strategy (Phase 3)
- Compute incrementally: only re-rank scopes touched by posts/votes in last hour.
- `prev_rank` carried forward from previous snapshot row → enables movement arrows without extra writes.

### Files to add/edit (high level)
- `src/pages/Upload.tsx` — stepped flow + validation
- `src/pages/Feed.tsx` + new `FeedFilterChips.tsx` — filter chips
- `src/pages/Discover.tsx` — full rebuild
- `src/pages/CategoryHub.tsx` — topic grid + widgets
- `src/pages/CategoryLeaderboard.tsx` (new)
- `src/pages/Battles.tsx` + filters
- `src/pages/Search.tsx` — category-aware results
- `src/components/profile/ProfileCategoryRankings.tsx` (new)
- `supabase/functions/snapshot-category-ranks/index.ts` (new edge fn)
- Migrations: validation trigger, `category_rankings` table, indexes

---

## Recommendation

Approve **Phase 1 now** so I can land the foundation (required category/topic on every post + feed filters). I'll surface Phases 2–4 for approval one at a time so you can review before each ships.

Reply with **"go phase 1"**, or pick a different starting phase / different scope.