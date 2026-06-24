# Dependency Security Status

_Last updated: 2026-06-24_

## High / Critical: CLEARED

`code--dependency_scan` reports **no high or critical severity vulnerabilities**.

| Package | Before | After | Notes |
| --- | --- | --- | --- |
| `@supabase/supabase-js` | 2.105.1 | **2.108.2** | Pulls in patched `ws` (clears GHSA-96hv-2xvq-fx4p and GHSA-58qx-3vcg-4xpx). |
| `react-router-dom` | 6.30.1 | **6.30.4** | Latest v6 patch. Clears the router XSS / open-redirect advisories on the v6 line. Held back from v7 to avoid breaking the existing route architecture (data routers, splat routes, `/:username` priority). |
| `recharts` | 2.15.4 | 2.15.4 (unchanged) | See follow-up below. |

### Verification (2026-06-24)
- `bun install` — clean, lockfile refreshed.
- `tsgo --noEmit` — passes.
- `bun run build` — production build succeeds.
- `bunx vitest run` — 394 passed, 45 skipped, 0 failed.
- `code--dependency_scan` — no high/critical findings.
- Manual spot-checks: admin charts (`RankHistoryTimeline`, command-center dashboards) render; feed/discover/DMs/realtime/auth unaffected (no API surface changes between supabase-js 2.105 → 2.108 or react-router 6.30.1 → 6.30.4).

## Medium: Accepted with follow-up

The remaining medium advisories are transitive and currently unfixable on the chosen major versions:

| Source | Advisory | Reason for accepting |
| --- | --- | --- |
| `recharts@2.15.4` → `lodash@4.17.21` | GHSA-r5fr-rjxr-66jc (`_.template` code injection), GHSA-xxjr-mmjv-4gpg / GHSA-f23m-r3pf-42rh (prototype pollution in `_.unset` / `_.omit`) | lodash 4.17.21 is the latest 4.x release; no upstream patch exists. CrownMe never calls `_.template`, `_.unset`, or `_.omit` directly, and Recharts uses lodash only internally for chart data shaping — not on attacker-controlled keys. |

**These findings are not marked as "ignored" in the scanner.** They remain visible so the team revisits them at each scan.

### Follow-up task: Evaluate Recharts v3 upgrade

- **Goal:** Move to `recharts@^3` to drop the lodash dependency entirely.
- **Risk:** v3 ships breaking API changes (component prop renames, axis defaults, tooltip payload shape). Affects every chart consumer:
  - `src/components/RankHistoryTimeline.tsx` (custom SVG — likely unaffected)
  - `src/components/ui/chart.tsx` (shadcn wrapper around Recharts primitives — needs review)
  - Admin Command Center dashboards (`CommandCenterCloudSpend`, `CommandCenterDbHealth`, `CommandCenterFinance`, `CommandCenterStripeHealth`, `CommandCenterOverview`, etc.)
  - Any creator/insights charts (`src/pages/Insights.tsx`)
- **Plan when scheduled:**
  1. Bump `recharts` to `^3` on a feature branch.
  2. Update `src/components/ui/chart.tsx` to the v3 Recharts primitives.
  3. Visual-regression every chart route via Playwright screenshots (light + dark theme).
  4. Re-run `code--dependency_scan` to confirm lodash is gone.
  5. Ship behind one PR so it can be reverted cleanly if charts regress.

## Overrides

None added. The high-severity fixes came from direct version bumps, so no `overrides` block is needed in `package.json`. If a future advisory requires pinning a transitive (e.g. forcing a newer `ws`), add it under `"overrides"` with a comment explaining why.
