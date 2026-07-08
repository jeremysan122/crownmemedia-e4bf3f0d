# Crown Map — Launch Hardening (v1.0)

## Canonical route

- **Canonical route:** `/map` (see `App.tsx`, `BottomNav`, `DesktopSidebar`, `FeedRightRail`).
- **Legacy redirect:** `/crown-map` → `/map` (query string preserved) via `CrownMapLegacyRedirect`.
- **Share URLs** built in `CrownMap.tsx` use `/map`. All filters round-trip:
  `scope`, `category`, `q`, `view`, `mine`, `heat`, `holder`, `exact`, `min`.

## Data source

Crown Map's client read path continues to query **`public.crowns`** (joined
with `profiles`) for the visible list/map — that path is fast (~14 active
crowns), well-tested, and locked for launch.

`public.crown_map_points` is now **activated** as a privacy-safe cache /
future denormalized read table. It is **never queried directly from the
browser**. All client access goes through security-definer RPCs that
enforce what a caller may see.

| Surface                                 | Read source                                       |
| --------------------------------------- | ------------------------------------------------- |
| Crown Map list + map pins (v1.0)        | `public.crowns` (RLS-gated)                       |
| Safe public aggregate (anon-callable)   | `public.get_crown_map_public_points(...)`         |
| Owner-only raw points                   | `public.get_my_crown_map_points()`                |
| Admin/security debug                    | Direct `crown_map_points` (RLS-gated to admins)   |
| Refresh job (service_role / admin only) | `public.refresh_crown_map_points()`               |

## Privacy policy for `crown_map_points`

- **Never publicly exposed:** `user_id`, exact `lat`/`lng`, address,
  device location, or any identifier that pinpoints a person.
- **Publicly exposed only via `get_crown_map_public_points`:** aggregate
  region info — `region_type`, `region_name`, `category`, `score`,
  `rank`, `crown_count`, `post_count`, `coarse_lat`/`coarse_lng`
  (rounded to ~11 km), and `refreshed_at`.
- **Refresh policy:** `refresh_crown_map_points()` never writes exact
  coords — the `lat`/`lng` columns are populated as `NULL` until a
  future phase intentionally attaches public post location. Coarse
  coordinates are computed at read time inside the RPC and are always
  aggregate-averaged, never per-user.

## RLS / grants (post-launch hardening)

### `public.crown_map_points`
- `anon`: **no access** (no GRANT, no policy).
- `authenticated`: `SELECT` only; RLS restricts to `auth.uid() = user_id`.
- `admin` / `security_admin`: `SELECT` all rows for moderation/debug.
- `admin`: `INSERT`/`UPDATE`/`DELETE` via the admin-write policy.
- `service_role`: full access (bypasses RLS) — used by the refresh job.

Previous state (fixed in this pass): a single policy `USING (true)` for
`authenticated` allowed every signed-in user to read every row —
including `user_id`, `lat`, `lng`. That policy is dropped.

### RPCs
- `get_crown_map_public_points(_category, _region_type, _limit)` —
  `SECURITY DEFINER`, `STABLE`, executable by `anon` + `authenticated`.
  Returns aggregate/coarse rows only.
- `get_my_crown_map_points()` — `SECURITY DEFINER`, `STABLE`,
  executable by `authenticated` only. Returns `auth.uid()` rows only.
- `refresh_crown_map_points()` — `SECURITY DEFINER`, executable by
  `service_role`. Raises `not authorized` if a signed-in caller lacks
  the `admin` role.

## Private schema grants

The concerning `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO
authenticated, anon` from migration `20260610085040` was **already
superseded** by migration `20260610153902` (see previous revision of
this doc for details). No further action needed.

## Share cards audit

Unchanged. `share_cards` policy (`invalidated_at IS NULL`, authenticated
`SELECT`) exposes only pre-rendered, sanitized card data. Sensitivity
gating happens at generation time.

## Realtime correctness

Unchanged. `useRealtimeChannel` on `crowns` guards every incoming
payload with `rowMatchesFilters()` before mutating visible state.

## Performance / DB usage

Unchanged. Debounced text/number filters (350ms), `count: "estimated"`,
mobile "Apply filters" one-shot commit.

## Error / retry UX

Unchanged. `loadError` banner + "Try again". Raw Supabase/PostgREST/RLS
error text is only ever `console.error`'d.

## Deferred features (v1.1+) — labeling audit

These are intentionally scoped out of launch and either **disabled** or
**clearly labeled** in the UI so no one thinks they're active:

- **MutedWords** (`src/pages/MutedWords.tsx`): copy states "Full
  enforcement across every feed, comment, and notification lands in
  v1.1." The list is persisted; enforcement expands next.
- **Preferences** — `who_can_tag`, `who_can_mention`, `who_can_dm`,
  `tag_review_required`: rendered as **disabled** "Coming soon"
  controls; no fake settings are saved to the DB.
- **RestrictedAccounts**: copy notes that downstream enforcement expands
  in v1.1.
- **Data export**: server-side audited flow is v1.1.
- **RankHistoryTimeline**: empty-state renders "Rank history coming
  soon" with a friendly message.
- **Native app / Capacitor / RevenueCat / IAP / native push**: scaffolding
  lives in `docs/NATIVE_APP_PLAN.md` and does not affect the PWA build.

## Test coverage

- `crownMapContracts.test.ts` — locks `/map` canonical route, legacy
  redirect, no `count:"exact"`, realtime filter guard, debounced
  filters, friendly error UI, empty-state gating.
- `crownMapMobileFilters.test.ts` — locks mobile Apply flow.
- `crownMapPrivacy.test.ts` — locks: `crown_map_points` RLS is
  owner-or-admin (no `USING (true)` policy), safe public RPC exists
  with anon `EXECUTE`, owner-only + refresh RPCs exist with correct
  grants, and no `user_id`/exact-`lat`/`lng` field leaks from the
  public RPC.
