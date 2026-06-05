# CrownMeMedia

A social voting and royalty-themed media platform where users post photos and videos, earn crowns, battle for regional rankings, send royal gifts, and compete on the Crown Map.

## Tech Stack

- React 18 + Vite + TypeScript
- Tailwind CSS + shadcn/ui
- Lovable Cloud (Supabase) — auth, database, storage, edge functions
- **Package manager: [bun](https://bun.sh)** (CI uses `bun install --frozen-lockfile`; `bun.lockb` is the source of truth)

## Setup

```bash
bun install
bun run dev
```

## Environment Variables

Copy `.env.example` to `.env` and fill in values from your Lovable Cloud project. The `.env` file is git-ignored and must never be committed.

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=
```

Optional:

```
# Set to "true" only in staging to let uploads proceed if the moderation
# function is unreachable. Defaults to false (fail-closed) for production.
VITE_MODERATION_FAIL_OPEN=
```

Server-side (never expose to the client; configure via Lovable secrets / GitHub Actions secrets):

```
SUPABASE_SERVICE_ROLE_KEY=     # only for seed scripts & edge functions
```

## Scripts

```bash
bun run dev                    # local dev server
bun run build                  # production build
bun run lint                   # eslint
bun run test                   # vitest (CI mode)
bun run test:watch             # vitest watch
bun run seed:launch-fixtures   # create idempotent launch personas + posts
bun run cleanup:launch-fixtures
bunx playwright test           # e2e
```

## Routes — share links

- `/post/:id` — canonical post detail page
- `/p/:id` — public short-link alias used by share cards / OG / external sharing (renders the same page)

Both routes resolve identically. New external share surfaces should prefer `/p/:id`.

## Categories

The launch taxonomy lives in `public.categories` and `public.subcategories` — what's seeded in those tables is the source of truth for hubs, leaderboards, filters, and the Upload picker. Update product copy to match the seeded set; do not document an aspirational hub/topic count.

## Edge Functions

`supabase/functions/` is the **only** canonical location for edge functions. A previous root-level `functions/` directory has been removed to prevent deploy drift. Per-function settings live in `supabase/config.toml`.

## Deployment

The project deploys via Lovable. Frontend changes go live via the Publish action; backend (edge functions, migrations) deploys automatically.
