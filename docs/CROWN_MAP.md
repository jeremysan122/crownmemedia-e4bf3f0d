# Crown Map — Launch Hardening (v1.0)

## Canonical route

- **Canonical route:** `/map` (see `App.tsx`, `BottomNav`, `DesktopSidebar`, `FeedRightRail`).
- **Legacy redirect:** `/crown-map` → `/map` (query string preserved) via `CrownMapLegacyRedirect`.
- **Share URLs** built in `CrownMap.tsx` use `/map`. All filters round-trip:
  `scope`, `category`, `q`, `view`, `mine`, `heat`, `holder`, `exact`, `min`.

## Data source (intentional decision)

Crown Map currently reads from **`public.crowns`** with an embedded
`profiles` join. `public.crown_map_points` exists as a reserved
denormalized read table for a future phase but is **intentionally unused
at launch**:

| Table | Rows (prod) | Status |
| --- | --- | --- |
| `crowns` | ~14 (active) | Live read source |
| `crown_map_points` | 0 | Reserved / not yet backfilled |

Rationale:
- With only ~14 active crowns, an indexed join on `profiles` is well under
  20ms and adds zero cost — a denormalized cache would be pure overhead.
- The refresh/backfill job for `crown_map_points` is deferred to v1.1
  along with the native shell and IAP work already scheduled.
- We are **not dropping the table** (per no-delete policy) — this doc is
  the single source of truth that it is reserved-not-dead.

If Crown Map ever becomes a DB-load contributor (>1% of Cloud spend or
p95 > 200ms), migrate the read path to `crown_map_points` and add a
trigger on `crowns` that upserts into `crown_map_points`.

## RLS / grants

- `/map` route is protected (`ProtectedRoute`), so **authenticated-only**.
- `public.crown_map_points`: `SELECT` granted to `authenticated` only.
- `public.crowns`: existing RLS unchanged; readable to `authenticated`.
- **Docs previously said anon could read `crown_map_points` — corrected
  here.** Authenticated-only is the intentional launch posture.

## Private schema grants

The concerning `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO
authenticated, anon` from migration `20260610085040` was **already
superseded** by migration `20260610153902`, which:

1. `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM authenticated, anon`
2. Grants execute **only** on the specific public-safe wrappers:
   `bump_filter_streak`, `ensure_my_wallet`, `is_royal_pass_active`,
   `purchase_boost`, `send_royal_gift`.
3. Sets `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM
   authenticated, anon` so **future** private helpers are not
   auto-exposed.

No further migration is needed for this finding.

## Share cards audit

`share_cards` policy (`invalidated_at IS NULL`, authenticated `SELECT`)
exposes only:
- `image_path` (public storage path of a pre-rendered card image)
- `metadata` (already sanitized by the generator)
- `is_sensitive_safe` flag

Sensitivity/visibility gating happens at **generation time** (the edge
function refuses to mint a card for deleted / hidden / private /
sensitive-blocked / non-approved content and stamps `invalidated_at` when
the underlying content changes state). The read policy therefore does
not need per-user visibility joins.

## Realtime correctness

`useRealtimeChannel` on `crowns` now guards every incoming payload with
`rowMatchesFilters()` before mutating visible state:

- `scope`, `category`, `mineOnly`, min-score, region query (exact/partial)
  are validated from the payload directly.
- Holder-username is re-validated inside `upsertRow` after the
  `profiles` join resolves.
- Non-matching rows are proactively removed from the visible list so a
  filter-change race can't leave stale pins.

## Performance / DB usage

- Text/number filters (`q`, `holder`, `min score`) are debounced 350ms →
  one fetch per burst, not per keystroke.
- `count: "estimated"` replaces `count: "exact"` (pg_class row-estimate,
  no COUNT scan).
- Mobile "Apply filters" still commits a single fetch (guarded by the
  existing `crownMapMobileFilters` test).

## Error / retry UX

- `loadError` state renders a friendly banner + "Try again" button
  driven by `reloadKey`.
- Raw Supabase / PostgREST / RLS error text is only ever `console.error`'d.
- Empty state only renders when `!loadError && !loading && rows === 0`.

## Test coverage

- `crownMapContracts.test.ts` — locks: `/map` share URL, legacy redirect,
  no `count:"exact"`, realtime filter guard, debounced filters, friendly
  error UI, empty-state gating.
- `crownMapMobileFilters.test.ts` — locks mobile Apply flow (unchanged).
