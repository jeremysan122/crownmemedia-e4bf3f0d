# Visual regression tests

Playwright snapshot tests for the share-card pipeline. Uses **threshold-based
diffing**, not exact zero-difference — see `playwright.config.ts`:

| Knob                | Value | Why                                              |
| ------------------- | ----- | ------------------------------------------------ |
| `threshold`         | 0.2   | per-pixel YIQ tolerance (font hinting / AA)      |
| `maxDiffPixelRatio` | 0.02  | up to 2% of pixels may differ overall            |
| `animations`        | off   | freezes Framer / CSS transitions during capture  |

This catches real bugs (wrong avatar, missing crown, broken layout, stale
image after edit) without flaking on sub-pixel rendering noise.

## Run

```bash
# one-time
bunx playwright install chromium webkit

# point at a real post + profile in your DB
E2E_POST_ID=<uuid> E2E_PROFILE_USERNAME=<handle> bunx playwright test

# update baselines after an intentional UI change
E2E_POST_ID=<uuid> E2E_PROFILE_USERNAME=<handle> \
  bunx playwright test --update-snapshots
```

If `PLAYWRIGHT_BASE_URL` isn't set, Playwright will boot `bun run dev` itself
on `http://localhost:8080`.

## What's covered

1. **Post share dialog** — preview card on `/p/:id`.
2. **Profile share dialog** — preview card on `/u/:username`.
3. **Downloaded PNG ≡ preview** — runs `html-to-image` in-page and compares
   the resulting PNG against the same baseline as the preview, so a
   regression in either path fails the test.

The downloaded-PNG test uses a slightly looser `maxDiffPixelRatio: 0.05`
because `html-to-image`'s SVG-foreign-object renderer produces marginally
different AA than the live DOM — still tight enough to catch real drift.
