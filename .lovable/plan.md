## What's already done (this turn)

- Battle cards on the Battles page now render the post's saved filter (`posts.filter`) instead of raw image.
- Challenge dialog post-picker shows filtered thumbnails and no longer clips a row of tiles (`max-h-48` → `max-h-72`), so the 4th tile no longer appears to "overlap" the row above.
- Accept Battle dialog shows filtered thumbnails for the challenger's post, your selected post, and every option in the grid.

## What's left to do

### 1. Battles tabs — redefine semantics

Update `src/lib/battlesPagination.ts`:

- Add `declined` to `TabKey` and `TAB_KEYS`.
- Rewrite `tabPredicate`:
  - `active` — any battle with `status='active'` and not yet ended (platform-wide, no viewer scope).
  - `pending` — viewer's own battles where `status='pending'`.
  - `mine` — viewer's own battles where `status='active'` and not ended.
  - `done` (Past) — viewer's own battles that have ended (winner decided OR `ends_at` passed).
  - `declined` — viewer's own battles where `status in ('declined','cancelled')`.

Update `src/pages/Battles.tsx`:

- Add `declined` to all per-tab state maps (`tabLoading`, `tabError`, `inFlightLoad`).
- Add `<TabsTrigger value="declined">Declined</TabsTrigger>` next to Past. Switch the `TabsList` grid from `grid-cols-4` to `grid-cols-5`.
- Change `fetchPage` so `forTab === 'active'` runs a platform-wide query (no `challenger_id/opponent_id` viewer filter, plus a server-side `status='active'` filter) while the other four tabs keep the existing viewer-scoped query.
- Keep the same keyset cursor shape — both query shapes are ordered by `(created_at DESC, id DESC)` so the pagination helpers stay untouched.
- Render the same `<TabsContent>` block for Declined as Past, with empty-state copy "No declined or canceled battles."

### 2. Feed — sticky header + sensitivity blur

`src/pages/Feed.tsx`:

- Bump the inner Tabs strip from `sticky top-0 z-20` to sit below the AppShell header (`sticky top-[56px] z-30` on mobile, `top-0` on lg+) so the global header doesn't cover or get covered by it.
- Add `pt-2` spacing above the first post so a sensitivity-blurred first card doesn't visually merge into the translucent header.

`src/components/AppShell.tsx`:

- Strengthen the mobile header backdrop so a sensitive post's purple blur doesn't bleed through as a flat band. Replace `glass` with `bg-background/85 backdrop-blur-md` on the mobile header (keeps the frosted feel while removing the see-through purple band the user circled).

`src/components/PostCard.tsx`:

- The blurred sensitive backdrop already lives inside an `overflow-hidden` image container, so it's already card-bounded. No change needed beyond the header opacity above.

### 3. Tests

- Update `src/lib/__tests__/battlesPagination.test.ts` (if it exists) — extend the `tabPredicate` cases to cover the new semantics (active=platform-wide, declined=own declined/cancelled) and the new tab key.

## Out of scope

- Realtime subscription for the platform-wide Active feed is left as-is (filtered on the client by `tabPredicate`); a follow-up can move to a server-side filtered channel if needed.
- No schema changes required.
