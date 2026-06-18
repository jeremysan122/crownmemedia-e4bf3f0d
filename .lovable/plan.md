# Instagram-style Restructure: Posts, Scrolls & Edit

Mirror Instagram's structure and gestures across create, feed, scrolls, and edit — keeping CrownMe's gold/crown branding, existing data model (`posts` table with `content_type`), and current edit permissions (media still replaceable).

## 1. Unified Create Sheet (single `+` entry)

Replace the current Upload page entry with a single `+` button in the bottom nav that opens a full-height bottom sheet:

- **Tabs at top:** `Post` · `Scroll` (Story-style omitted per scope).
- **Step 1 — Library/Camera:** grid of recent device images, large preview on top (IG-classic). Multi-select toggle for carousel (Post only, up to 10). Scroll tab forces single video, 9:16, ≤30s.
- **Step 2 — Crop/Aspect:** pinch + drag crop. Post: 1:1 / 4:5 / Original. Scroll: locked 9:16.
- **Step 3 — Filter & Adjust:** horizontal filter strip (reuses existing `FilterPicker` + `cssFor`). Per-photo filter for carousels.
- **Step 4 — Details:** caption (500), location (city/state/country, required), category (CrownMe-specific — kept), alt text per photo, advanced (comments on/off, hide vote count). "Share" CTA in top-right.
- Persists to existing `post_drafts` so resume works across steps.

Routing: `/create` becomes the sheet host; old `/upload` redirects.

## 2. Post Viewer (Feed Card — IG-faithful)

Rebuild `PostCard` to match IG anatomy:

- Header row: avatar · username · • · location · `…` menu.
- Media: square/4:5, full-bleed within card. Swipeable carousel with dot indicator + index badge `1/4`. Double-tap = vote (CrownMe's "crown" reaction with gold heart-burst animation).
- Action row: Crown (like), Comment, Share-to-DM, Battle (replaces IG's "remix"), Bookmark right-aligned.
- Vote count line: "Crowned by @x and 1,234 others".
- Caption: username + caption, truncated to 2 lines with "more".
- Comments preview: "View all 42 comments" + latest 1.
- Timestamp small caps.

## 3. Scrolls Viewer (Reels-faithful)

Rebuild `Shorts.tsx` page:

- Full-screen vertical pager with snap scrolling (CSS `scroll-snap-type: y mandatory`), one Scroll per viewport.
- Right action rail: avatar+follow, Crown, Comment, Share, Battle, More.
- Bottom overlay: username · follow chip · caption (expandable) · audio/author row · category chip.
- Auto-play visible video, pause off-screen; tap to mute/unmute; progress bar at top.
- Preserves existing vote/comment/share RPCs.

## 4. Edit Post (kept permissive per your choice)

Restyle `EditPostDialog` into an IG-style "Edit info" screen but keep current capabilities (cover replace, carousel reorder, filter change, caption, category, location, alt text). Visual: full-screen sheet on mobile, two-column on desktop, segmented sections, gold "Save" in header. No backend changes.

## 5. Branding

IG-faithful spacing/iconography but CrownMe palette: gold accent for active states, crown icon replaces heart for likes, dark surfaces preserved. No font swap — keep existing CrownMe type.

## Technical Details

**New / changed files**
- `src/components/create/CreateSheet.tsx` (new) — sheet host with tab + step state machine.
- `src/components/create/steps/{LibraryStep,CropStep,FilterStep,DetailsStep}.tsx` (new).
- `src/components/feed/PostCard.tsx` — rewrite to IG anatomy; keep existing props/handlers.
- `src/components/feed/PostCarousel.tsx` (new) — swipeable with dots, double-tap detector.
- `src/pages/Shorts.tsx` — rewrite to snap pager + action rail (`ScrollPlayer`, `ScrollActionRail`).
- `src/components/EditPostDialog.tsx` — restyle only; logic unchanged.
- `src/components/nav/BottomNav.tsx` — replace upload link with `+` opening `CreateSheet`.
- `src/App.tsx` — `/upload` → redirect to `/`+sheet; keep `/p/:id`, `/scroll/:id` deep links.

**Data model**
- No schema changes. Uses existing `posts.content_type`, `image_urls`, `alt_texts`, `filter`, `category`, `city/state/country`, `post_drafts`.
- Existing RPCs (vote, share, battle, bookmark) reused.

**Gestures**
- Carousel + double-tap: lightweight pointer handlers (no new lib).
- Scrolls pager: native CSS scroll-snap + IntersectionObserver for play/pause.

**Out of scope**
- Stories, Notes, Reels remix/audio library, collab posts, tagging users (separate follow-up if wanted).
- No DB migration. No edit-lock change.

## Rollout

1. Create sheet + new routes (behind no flag — replaces current upload UI).
2. PostCard rewrite (drop-in).
3. Shorts rewrite.
4. EditPostDialog restyle.
5. Smoke test: create post (single + carousel), create Scroll, edit, vote, share-to-DM, battle.
