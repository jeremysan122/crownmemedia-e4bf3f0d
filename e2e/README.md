# Visual regression tests

Playwright snapshot tests for the share-card pipeline. Uses
**threshold-based diffing** (not exact zero-difference) — see
`playwright.config.ts`:

| Knob                | Value | Why                                              |
| ------------------- | ----- | ------------------------------------------------ |
| `threshold`         | 0.2   | per-pixel YIQ tolerance (font hinting / AA)      |
| `maxDiffPixelRatio` | 0.02  | up to 2% of pixels may differ overall            |
| `animations`        | off   | freezes Framer / CSS transitions during capture  |

## Fixtures — automatic, no manual IDs required

`e2e/global-setup.ts` resolves a test post + profile in this order:

1. **Env override** — `E2E_POST_ID` + `E2E_PROFILE_USERNAME` if both set.
2. **Cached seed** — `e2e/.seed.json` from a previous run (git-ignored).
3. **Auto-seed** — calls `e2e/seed.ts` which uses
   `SUPABASE_SERVICE_ROLE_KEY` to create (or reuse) a deterministic test
   user namespaced with the prefix **`e2e_share_test`**.

If none of the three are available, setup throws with a clear message
explaining exactly which env var to add — tests don't silently skip.

### Safety guarantees of the auto-seed

- **Namespaced**: every row carries the `e2e_share_test` prefix
  (email `e2e_share_test@crownme.test`, username `e2e_share_test`,
  `submission_key = e2e_share_test_post_v1`).
- **Idempotent**: re-running reuses the same user, profile, and post.
  Force a fresh seed with `E2E_RESEED=1`.
- **Refuses to clobber**: if it ever finds a profile or post under the
  test ID whose username/key does NOT match the prefix, it aborts.
- **Service-role-only**: anon clients can't run the seed; the key is
  read from `SUPABASE_SERVICE_ROLE_KEY` (never committed).
- **Production-safe**: no production user data is read or modified.

## Run

```bash
# one-time
bunx playwright install chromium webkit

# add SUPABASE_SERVICE_ROLE_KEY to your local .env, then:
bunx playwright test

# force a fresh seed
E2E_RESEED=1 bunx playwright test

# manual reseed (no test run)
bun run e2e/seed.ts

# update baselines after an intentional UI change
bunx playwright test --update-snapshots
```

If `PLAYWRIGHT_BASE_URL` isn't set, Playwright will boot `bun run dev`
itself on `http://localhost:8080`.

## What's covered

1. **Post share dialog** — preview card on `/p/:id`.
2. **Profile share dialog** — preview card on `/u/:username`.
3. **Downloaded PNG ≡ preview** — runs `html-to-image` in-page and
   compares the resulting PNG against the same baseline, so a regression
   in either path fails the test.

## Cleanup

The seeded user/post are reused across runs by design. To remove them
entirely, delete the auth user with email `e2e_share_test@crownme.test`
from Lovable Cloud → Users; the profile and post cascade.
