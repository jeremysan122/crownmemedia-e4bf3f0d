# CrownMe Launch Readiness Audit

**Audit date:** July 17, 2026
**Scope:** `crownmemedia.com`, Lovable deployment, GitHub repository, React/PWA client, Supabase migrations and Edge Functions, uploads and moderation, payments, privacy/data rights, CI/CD, observability, and native-app readiness
**Repository:** `jeremysan122/crownmemedia-e4bf3f0d`
**Audited main commit:** `2b26d2da27e7436bc0ff78d61272b4d49c5fbe13`
**Original production verdict:** **RED — DO NOT LAUNCH**
**Remediation branch verdict:** **CODE GATES PASS; PRODUCTION LAUNCH REMAINS ON HOLD**

## Remediation result (July 17, 2026)

The repository findings were remediated on `agent/launch-readiness-remediation`
where they could be closed safely in code. Production launch remains on hold
until the external and infrastructure gates below are completed with real
staging/production credentials. This distinction is intentional: passing local
code gates does not prove that Lovable, Supabase, Stripe, RevenueCat, GitHub, DNS,
backups, or native-store settings are correct.

### Implemented in this branch

- Added validated runtime configuration, a safe configuration-outage screen,
  project-reference matching, an independent error-reporting endpoint, release
  identifiers, and production browser smoke monitoring.
- Added authenticated, constant-time cron authorization and bounded workers for
  account deletion and durable media-analysis jobs.
- Added the 30-day deletion queue, cancellation/reactivation behavior, legal
  holds, resumable claims/retries, Storage deletion, Auth deletion, profile
  anonymization, and retention documentation.
- Unified camera/gallery upload validation; added strict MIME-to-extension
  mapping, 250 MB/30-second checks, real dimensions, poster requirements,
  object-URL/recorder cleanup, Storage MIME/size controls, publish-RPC ownership
  checks, fail-closed moderation, and durable post-analysis retries.
- Corrected Stripe and RevenueCat gateway configuration, retry semantics,
  idempotent provider credits, wallet updates, transaction records, boost
  fulfillment, refunds/disputes, and unknown-product handling.
- Made analytics consent-enforced, expanded the data export, added security
  headers, refreshed metadata/sitemap/manifest, removed native preview settings,
  split the production bundles, and enforced a gzip budget.
- Added CodeQL, Dependabot, CODEOWNERS, a pull-request template, a proprietary
  license notice, incident/release/retention/native runbooks, and accessibility
  and deployment smoke tests.

### Verification evidence

| Gate | Result |
|---|---:|
| TypeScript | Pass |
| ESLint error gate | Pass |
| Unit/integration tests | 1,072 passed; 48 environment-dependent skipped |
| Chromium hermetic core-flow smoke | 14 passed |
| Chromium public accessibility smoke | 3 passed |
| Production build | Pass |
| Bundle budget | 223 JavaScript assets pass; largest 492.02 KiB gzip |
| Changed Edge Function parse check | 9 passed |
| Git whitespace/error check | Pass |

The skipped database tests require a safe Supabase service-role fixture. They
must be run against staging before promotion; they are not counted as passing.

### Finding disposition

| Finding | Code status | Remaining launch evidence |
|---|---|---|
| P0-01 blank bootstrap | Fixed in code | Set Lovable production variables and independent monitoring URL; run live smoke |
| P0-02 project identity | Fixed in repository | Verify the documented Lovable/Supabase mapping in both dashboards |
| P0-03 permanent deletion | Implemented | Deploy migration/function; run aged test-user deletion across DB/Auth/Storage/backups |
| P0-04 public privileged cron | Fixed in code | Configure a 32+ byte `CRON_SECRET` and authenticated schedules |
| P0-05 upload trust boundary | Partially fixed | Deploy bucket/RPC controls; add server content sniffing/duration probe and quotas |
| P0-06 fail-open moderation | Fail-closed queue implemented | Replace public raw-media ingress with private quarantine/promotion and test outage/manual review |
| P0-07 video URL in image field | Fixed in code | Run staging poster-failure acceptance test |
| Payments conditional P0 | Code paths hardened | Complete real Stripe/RevenueCat sandbox lifecycle and reconciliation |
| Native conditional P0 | Unsafe preview config removed | Generate/sign apps and complete every native release gate |
| P1-01 consent | Fixed in code | Confirm policy/lawful-basis wording with counsel |
| P1-02 monitoring | Integration point fixed | Supply independent provider endpoint and alert routing |
| P1-03 deployment smoke | Fixed in code | Enable workflow and verify host headers/routes |
| P1-04 governance | Repository files added | Enable branch/environment protection in GitHub settings |
| P1-05 historical secrets | Not closable in source | Inventory and rotate every historical credential; decide on history rewrite |
| P1-06 export | Materially expanded | Build server-side resumable export for very large/sensitive accounts |
| P1-07 camera/upload reliability | Fixed in code | Run physical iOS/WebView device matrix |
| P1-08 payload | Fixed and budgeted | Capture production Core Web Vitals; continue route-level optimization |
| P1-09 accessibility | Browser smoke added; auth landmark fixed | Add axe/manual VoiceOver/TalkBack and caption workflow evidence |
| P1-10 headers | Header policy added | Confirm Lovable serves it and tune CSP from production violations |
| P1-11 recovery | Runbooks and targets added | Enable/verify backups/PITR and complete a timed restore drill |
| P1-12 live database | Static controls only | Apply/replay migrations in staging and audit deployed RLS, Storage, auth, secrets, and schedules |
| P1-13 webhook failure semantics | Fixed in code | Validate provider retries and alerting in sandbox |

### Unresolved launch holds

1. **Private media quarantine and server media inspection.** The legacy `media`
   bucket is public. Storage MIME/size policies, owned paths, server-controlled
   names, publish-RPC checks, non-public post status, and fail-closed queues
   reduce risk, but they do not make a raw uploaded object private or prove its
   true duration/content. Launch requires a private ingress bucket and a trusted
   processor that sniffs/decodes, moderates, and promotes approved objects.
2. **Live infrastructure proof.** The new migrations and Edge Functions have not
   been applied to a safe staging database in this workspace. Fresh migration
   replay, RLS/storage abuse tests, scheduler installation, deletion, moderation,
   and rollback must pass there before production.
3. **External security configuration.** Rotate historical credentials, enable
   GitHub branch/environment protection, set production secrets, configure the
   independent monitor, and prove CSP/security headers on the served domain.
4. **Money, backup, and legal evidence.** Complete provider sandbox lifecycles,
   ledger reconciliation, backup/PITR restore rehearsal, retention approval, and
   privacy/terms review. These require provider/operator authority, not code.
5. **Native applications.** Web remediation does not make the ungenerated iOS
   and Android projects store-ready. Keep native marketing disabled until the
   native release checklist is complete.

The detailed findings below preserve the point-in-time evidence that produced
the original red verdict. Use the disposition table above as the current status.

## Executive summary

CrownMe has a substantial feature set, strong legal-page coverage, extensive database migrations, meaningful security regression tests, idempotent post publishing, and a recently green CI run. Those are valuable foundations.

The production product is not presently usable: the custom domain, Lovable app domain, and Lovable preview render a blank page because the deployed app does not have the required Supabase public configuration. The failure occurs while the Supabase module is imported, before React's error boundary or the in-app error reporter can start.

The audit also found launch-blocking security, compliance, and user-generated-content risks: two unauthenticated service-role cron functions, an account-deletion promise without a permanent-deletion worker, upload constraints that can be bypassed at storage level, and moderation that can fail open and publish content before deeper video review. Payments and both native stores have additional conditional blockers if they are included in launch scope.

No software is literally unbreakable. The launch standard should instead be: no open P0 issues, no unaccepted P1 issues, independently verified production controls, tested rollback and restore procedures, monitored critical journeys, and a successful soak period.

## Readiness dashboard

| Area | Status | Launch assessment |
|---|---:|---|
| Production availability | 🔴 | Public app is blank and unusable |
| Authentication and age gate | 🟡 | Server-enforced age confirmation exists; live flow could not be exercised during outage |
| Database/RLS | 🟡 | Strong static coverage and tests; deployed policies could not be queried with current Lovable connector scope |
| Uploads and media | 🔴 | Multiple client defects and no demonstrated server/storage size and MIME enforcement |
| Trust and safety | 🔴 | Moderation can fail open; video may publish before deeper analysis |
| Privacy and data rights | 🔴 | Permanent account deletion is promised but no purge worker was found |
| Payments/Royal Pass | 🔴 if enabled | Publicly triggerable reconciliation/comms jobs and uncompleted real lifecycle validation |
| Web/PWA | 🔴 | Outage, oversized initial shared bundles, no production smoke gate |
| iOS/Android | 🔴 | Native projects, signing, store setup, deep links, push, and purchase validation are incomplete |
| CI and automated tests | 🟡 | Latest CI is green and test volume is strong; governance and deployment checks are incomplete |
| Accessibility | 🟡 | Many accessible component patterns exist; no automated WCAG/axe/Lighthouse gate was found |
| Operations and recovery | 🔴 | No complete incident, backup-restore, RPO/RTO, or on-call runbook was found |
| SEO and public metadata | 🟡 | Good baseline metadata; sitemap and app-link claims/configuration are stale or incomplete |

## P0 — blockers that must be closed before web launch

### P0-01: Production app is blank because Supabase configuration is missing

**Evidence**

- `https://crownmemedia.com`, the Lovable app URL, and the Lovable preview all returned the same blank application shell during the audit.
- Browser console: `Error: supabaseUrl is required.`
- `src/integrations/supabase/client.ts` reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, then immediately calls `createClient`.
- The Supabase module is imported by the error reporter before `installErrorReporter()` and React rendering in `src/main.tsx`. The crash therefore bypasses both the error boundary and error reporting.

**Impact:** 100% production outage with no functional in-app diagnostic or recovery screen.

**Required remediation**

1. Configure the correct `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and expected project reference in Lovable's deployed environment.
2. Validate configuration before constructing the client and render a safe configuration-error page without exposing credentials.
3. Send bootstrap failures to an independent monitoring service that does not depend on Supabase.
4. Add a post-deploy browser smoke test against the custom domain; fail or roll back the release if `#root` is empty, console errors occur, or a known public route cannot render.

**Exit gate:** Custom domain renders home, auth, legal, and 404 routes on desktop and mobile; no bootstrap console errors; synthetic monitor alerts on a forced failure.

### P0-02: Production project identity is inconsistent

**Evidence**

- Lovable project ID: `fcbd98f7-a452-4e42-a0f9-b92cfce5c620`.
- `supabase/config.toml` declares project ID `bailrqskqpmzvsgivhvm`.
- `index.html` preconnects to `pbfuhitldiftvucuqtai.supabase.co`.

These values may represent different systems, an old project, or a generated Lovable ID, but the repository does not document the mapping. Combined with the live missing-variable failure, this is an unsafe release condition.

**Impact:** Risk of deploying against the wrong database, incorrect auth callbacks, data divergence, or silent production misconfiguration.

**Required remediation:** Establish one authoritative production environment manifest, document the Lovable-project-to-Supabase-project mapping, remove stale references, and add a build/deploy assertion that the expected host/project reference is present.

**Exit gate:** A signed-off environment matrix for development, staging, and production matches runtime network requests and Supabase dashboard identifiers.

### P0-03: Permanent account deletion is promised but not implemented

**Evidence**

- The UI tells users their account will be permanently deleted after 30 days.
- `request_account_deletion()` only sets `deletion_requested_at` and `deactivated_at`, and returns a calculated `final_at`.
- No scheduled purge, deletion worker, or production function that removes the user from `auth.users` and handles dependent data was found. References that delete auth users are test/runtime-audit cleanup only.

**Impact:** The product does not fulfill its stated user-data-rights behavior; this creates legal, trust, and app-store review risk.

**Required remediation:** Implement a resumable, auditable deletion pipeline with the 30-day cancellation window; define deletion versus legally required retention for every table/storage object; anonymize retained financial/security records; remove auth identity and user media; notify the user; and alert on stuck jobs.

**Exit gate:** Automated test account is requested, cancelled, requested again, aged past the deadline, then verified absent/anonymized across auth, database, storage, search, analytics, notifications, and backups according to the documented retention policy.

### P0-04: Two public Edge Functions can perform service-role cron work without request authentication

**Evidence**

- `supabase/config.toml` sets `verify_jwt = false` for `royal-pass-comms-cron` and `royal-pass-reconcile`.
- Both functions construct service-role Supabase clients.
- Neither function verifies a cron secret, signed request, service-role JWT, or trusted scheduler identity.
- Reconciliation can make Stripe API calls and perform privileged database writes; comms can scan subscription state and enqueue retention messages.

**Impact:** Any Internet caller can trigger privileged work, consume third-party/API capacity, generate audit noise, and create a cost/denial-of-service surface.

**Required remediation:** Require a high-entropy scheduler secret or verified platform identity with constant-time comparison; reject all other callers; rate-limit and bound work; record authenticated invocation IDs; monitor failed and abnormal invocation rates.

**Exit gate:** Anonymous calls receive 401/403; valid scheduler calls succeed once; replay/concurrency tests cannot duplicate side effects; load test demonstrates bounded cost.

### P0-05: Upload limits and media types are not enforced at the trust boundary

**Evidence**

- Gallery videos enforce the 250 MB/30-second rules, but the in-app camera-result path only probes metadata and accepts the file without equivalent final size, duration, and MIME validation.
- Object extensions are derived from the original filename instead of a strict MIME-to-extension map.
- Storage migrations do not demonstrate `file_size_limit` or `allowed_mime_types` for the public `media` bucket.
- The storage upload policy primarily scopes the object to the user's folder. A direct authenticated client can bypass React validation.

**Impact:** Oversized, unsupported, deceptive, or potentially dangerous media can bypass UI controls, increase storage/egress costs, and break downstream readers.

**Required remediation:** Enforce limits server-side and at bucket configuration; use a MIME allowlist plus content sniffing; generate server-controlled object names/extensions; quarantine uploads; validate actual duration/dimensions after upload; reject mismatches; apply per-user quotas and rate limits.

**Exit gate:** Direct storage/API tests prove that invalid MIME, spoofed extension, oversized files, over-duration video, cross-user paths, and quota abuse are rejected independently of the client.

### P0-06: User-generated-content moderation can fail open

**Evidence**

- Upload moderation catches invocation/network failures, logs a warning, and continues publishing.
- Video posts can be published before deeper analysis finishes; the deeper path is asynchronous after publish.
- The `media` bucket is publicly readable.

**Impact:** Harmful, illegal, or policy-violating content can become public precisely when the moderation service is unavailable. This is a severe safety and store-policy risk for a social product.

**Required remediation:** Default new content to `processing`/`pending_review`; keep original media private or served by signed URLs until approved; fail closed on moderation errors; add retry/dead-letter queues, moderator escalation, CSAM-safe handling procedures, hashing/vendor escalation where legally appropriate, and operational alerts.

**Exit gate:** Forced moderation outage leaves content non-public; retry and manual review work; rejected media cannot be fetched publicly; reviewer decisions and appeals are auditable.

### P0-07: A video URL can be written into an image field

**Evidence:** When poster generation produces no image, `Upload.tsx` sets `imageUrls = [videoUrl]`, then writes `image_url: imageUrls[0]`.

**Impact:** Feed images, share previews, battle cards, and consumers that assume `image_url` is an image can break or misclassify content.

**Required remediation:** Require a generated/validated poster, use a known image placeholder, or make the field nullable with every reader explicitly video-aware. Never store video in an image field.

**Exit gate:** Poster-generation failure test publishes a valid video without a non-image `image_url`, and every feed/share/battle surface renders a deterministic fallback.

## Conditional P0 blockers

These are P0 if the relevant feature is included in launch scope.

### Payments and Royal Pass

- The real Stripe staging lifecycle is explicitly deferred in `docs/royal-pass-launch-checklist.md`.
- `revenuecat-webhook` performs its own static Authorization verification but is not explicitly listed in `supabase/config.toml`; if the platform default verifies JWT, RevenueCat may be rejected before application code executes.
- The Stripe payments webhook returns HTTP 200 for an invalid/missing environment query parameter, which can hide configuration mistakes and suppress provider retries.

**Required gate before enabling money flows:** Authenticated cron fixes; explicit webhook gateway settings; real test-mode checkout, renewal, cancellation, refund, dispute, retry, duplicate, out-of-order, and entitlement-revocation tests; ledger reconciliation; alerting; rollback drill; no client-authoritative balance mutation.

### iOS and Android stores

- `capacitor.config.ts` still uses a Lovable-generated bundle ID and a remote preview `server.url` with `cleartext: true`.
- No committed/generated `ios/` or `android/` platform projects were found.
- Native signing, Apple/Google login, APNs/FCM, deep links, privacy declarations, store review accounts, and RevenueCat sandbox acceptance criteria remain unchecked.
- Android Digital Asset Links are absent: `/.well-known/assetlinks.json` returned 404.

**Required gate:** Complete every release criterion in `docs/NATIVE_APP_PLAN.md` on physical iOS and Android devices, including signed artifacts, purchase/refund tests, account deletion, deep links, permission UX, crash-free cold starts, and store compliance. Web/PWA readiness does not imply native readiness.

## P1 — high-priority reliability, security, privacy, and quality work

### P1-01: Consent banner does not control CrownMe analytics

`CookieConsentBanner` stores accepted/rejected status, but `src/lib/analytics.ts` does not read that status before writing authenticated-user events. The product therefore continues first-party behavioral analytics after a user selects “Reject non-essential.” Align behavior, banner language, privacy policy, lawful basis, and retention. Add consent-state tests.

### P1-02: Error monitoring has a single point of failure

Client errors are written back to Supabase. A Supabase bootstrap/configuration/outage failure therefore prevents reporting. The error boundary also states “This has been reported” even though `componentDidCatch` only logs to the console. Add an independent error/uptime provider, release identifiers, source maps handled securely, alert routing, and privacy scrubbing.

### P1-03: No production deployment smoke gate

CI can be green while production is blank. Add a deploy workflow that validates DNS/TLS, security headers, JS asset loading, console/network errors, public routes, auth page, and one read-only Supabase call. Automatically stop promotion or roll back on failure.

### P1-04: Repository governance is below launch standard

At audit time the public GitHub repository had no main-branch protection, Dependabot alerts/security updates were disabled, and no code-scanning analysis was present. Secret scanning and push protection were enabled, which is positive. Require PR review and green checks, prevent force pushes/deletions, enable dependency alerts/updates and CodeQL (or equivalent), define CODEOWNERS, and protect production deployment environments.

### P1-05: Removed environment files remain in public Git history

`.env` and `.env.development` were removed from the current tree but exist in history. The historical Supabase publishable key is intended to be public, but the old `VITE_PAYMENTS_CLIENT_TOKEN` must be assessed and rotated if it has any authority. Inventory and rotate all historical credentials; do not assume deletion from HEAD revokes exposure.

### P1-06: Data export is incomplete

The client-side export covers several core entities and records partial failures in a manifest, but it does not demonstrate complete coverage of legal acceptances, reports/appeals, blocks, saved items, notifications, sensitive/private profile data, subscriptions, and payment history. Define the authoritative export schema, produce it server-side, make large exports resumable, secure the download, and test completeness/deletion interplay.

### P1-07: Remaining upload and camera reliability defects

- The unmount object-URL cleanup effect captures initial empty state because it has an empty dependency list.
- `MediaRecorder` construction lacks a user-friendly failure path on unsupported browsers.
- Composite recording tracks are not clearly stopped after recording.
- Filename-derived extensions allow uppercase, unsupported, or misleading values.

Add unit and device tests covering repeated capture/removal, component unmount, iOS/WebView recorder failures, poster failures, trim output, and resource release.

### P1-08: JavaScript payload is excessive

The audited production build included these uncompressed/gzip approximate sizes:

| Chunk | Raw | Gzip |
|---|---:|---:|
| `vendor-misc` | 3.43 MB | 958 KB |
| `vendor-mapbox` | 1.78 MB | 490 KB |
| `vendor-lucide` | 779 KB | 137 KB |
| main `index` | 487 KB | 133 KB |

The shared `vendor-misc` and icon chunks can delay interactive startup, especially on mobile. Mapbox should load only when map functionality is requested. Replace whole-library icon imports where possible, split feature dependencies, measure route-level Web Vitals, and enforce bundle budgets. The `esnext` build target also needs an explicit supported-browser policy and real-device validation.

### P1-09: Accessibility is not release-gated

The code uses many good `aria-*`, live-region, label, and focus-visible patterns, but no axe, pa11y, Lighthouse CI, or equivalent automated accessibility suite was found. Add WCAG 2.2 AA checks for public/auth/core flows, keyboard-only and screen-reader manual testing, reduced-motion verification, contrast checks, focus management, captions/transcripts for user video, and accessible moderation/reporting paths.

### P1-10: Security headers are incomplete

The live domain provided HSTS, `nosniff`, and a strict-origin referrer policy. It did not demonstrate a Content Security Policy, `Permissions-Policy`, clickjacking defense through `frame-ancestors`/`X-Frame-Options`, or cross-origin isolation policy. Add a tested CSP starting in report-only mode, restrict camera/microphone/geolocation/payment permissions, and define embedding policy without breaking Supabase, Stripe, media, or maps.

### P1-11: Operations and disaster recovery are undocumented/unproven

No complete incident-response/on-call runbook, status page, backup/PITR policy, restore drill, or agreed RPO/RTO was found. Document ownership and escalation, confirm Supabase backup/PITR tier, test restoration to an isolated project, document storage backup/retention, create money/UGC incident playbooks, and monitor critical queues and scheduled jobs.

### P1-12: Live database security remains unverified

Static review found RLS enabled for every textual table creation and extensive security tests. No `DISABLE ROW LEVEL SECURITY` occurrence was found. However, the Lovable database query was denied with HTTP 403 because the connector lacks `projects:write`, so the deployed database, bucket configuration, secrets, auth settings, scheduled jobs, extensions, and migration parity were not directly inspected. This verification is mandatory before launch.

### P1-13: Payment webhook failure semantics need correction

Invalid or missing environment configuration should return a provider-visible failure where retry is safe, not unconditional success. Define strict live/test endpoints, reject ambiguous environment state, monitor signature failures and event lag, and preserve idempotent behavior.

## P2 — polish and scale work

1. Refresh `sitemap.xml`; its `lastmod` values predate current legal/app changes, and it conflicts with `robots.txt` for `/verify-age`.
2. Add Apple Universal Links and Android App Links association files when native domains/bundle IDs are final.
3. Replace manifest screenshots that reuse the same landscape marketing image for both wide and narrow form factors.
4. Remove or qualify structured-data claims for iOS/Android until store listings exist. Review the structured `SearchAction` targeting a robots-disallowed route.
5. Add a useful `<noscript>` experience and public service-status/contact path.
6. Reduce very large components and generated/shared type surfaces; incrementally enable `strictNullChecks` and `noImplicitAny` instead of retaining the permissive TypeScript baseline indefinitely.
7. Define repository licensing/IP posture. A public repository with no declared license creates ambiguity and may expose proprietary product logic without granting use rights.
8. Add release tags, generated release notes, migration/runbook links, and a documented rollback point for every production release.

## Controls that are already strong or promising

- Latest audited GitHub Actions run passed after the environment/CI cleanup.
- Existing evidence records 1,051 passing unit tests, 48 skipped tests, and 28 passing desktop-Chromium/mobile-WebKit smoke tests.
- Security-oriented tests cover wallets, privilege escalation, profile-field lockdown, storage policy behavior, battle voting, and other high-risk areas.
- Static migrations consistently enable RLS for created tables.
- Legal center coverage is extensive and includes Terms, Privacy, Community Guidelines, Cookie Policy, DMCA, Virtual Goods, Subscription Terms, CSAE, EULA, Acceptable Use, legal contact, and sensitive-content policy.
- Age confirmation has a server RPC in addition to client checks.
- Post publishing uses an idempotent RPC, reducing duplicate posts from retries.
- Gallery upload validation now enforces 250 MB and 30-second limits and records real video dimensions.
- Payment code contains signed webhook verification, event idempotency, ledger-oriented handling, feature flags, and a rollback outline.
- Live headers include HSTS, `X-Content-Type-Options: nosniff`, and a strict-origin referrer policy.
- GitHub secret scanning and push protection are enabled.
- SEO/social metadata, canonical URL, JSON-LD, viewport, language, robots file, and a PWA manifest are present.

These strengths reduce remediation effort, but none offset an open P0.

## Required launch sequence

### Phase 0 — restore and freeze

1. Freeze production feature changes.
2. Restore the correct Lovable environment configuration.
3. Add independent uptime/error monitoring and the custom-domain smoke gate.
4. Reconcile all production project identifiers.

### Phase 1 — close security, safety, and rights blockers

1. Authenticate cron functions.
2. Implement and verify permanent deletion.
3. Move upload validation to storage/server trust boundaries.
4. Quarantine media and make moderation fail closed.
5. Fix video poster semantics and camera parity.
6. Run a live Supabase/RLS/storage/secrets/scheduler audit.

### Phase 2 — prove critical journeys

Run production-like end-to-end tests for:

- Sign up, age confirmation, email verification, login/logout/recovery, OAuth, session expiry.
- Profile privacy, block/report/appeal, follow/unfollow, comments, DMs, notifications.
- Photo, gallery video, camera video, poster failure, moderation outage, oversized/spoofed files, retry, duplicate submission, removal.
- Battle creation, joining, realtime disconnect/reconnect, duplicate voting, winner/tie settlement, moderation.
- Data export, deletion cancellation, final deletion, retained-record anonymization.
- If enabled: checkout, renewal, cancellation, refund, dispute, webhook replay/out-of-order delivery, ledger reconciliation.

### Phase 3 — operational readiness

1. Enable branch and deployment protection, dependency alerts, code scanning, and owners.
2. Verify backups/PITR and complete a restore drill.
3. Write incident, moderation-escalation, payment, breach, and rollback runbooks.
4. Add accessibility, performance, and security-header gates.
5. Conduct a 72-hour production-like soak with synthetic traffic and no unexplained critical errors.

### Phase 4 — launch decision

Launch only when:

- All P0 items are closed with linked evidence.
- Every P1 is closed or explicitly accepted by a named owner with expiry date and compensating control.
- Live database and storage controls match the reviewed migration intent.
- Production smoke, core E2E, security, accessibility, performance, backup restore, and rollback checks pass.
- On-call ownership, alert routing, status communications, and store/reviewer support are active.

## Suggested release SLOs and rollback triggers

Finalize targets based on business needs, but define them before launch. A sensible starting point is:

- Availability: 99.9% monthly for the web app and critical APIs.
- Synthetic home/auth checks: every 1–5 minutes from at least two regions.
- Critical auth/upload/payment failures: alert within 5 minutes.
- Error-free sessions and Core Web Vitals: tracked by release, device class, and route.
- Cron/queue lag, moderation backlog, webhook lag, and deletion backlog: explicit alerts.
- Automatic rollback/promotion stop on blank root, failed asset load, severe console error, auth bootstrap failure, or migration incompatibility.

## Audit limitations

- The production outage prevented authenticated user-journey and visual/accessibility testing of the live UI.
- The Lovable connector could identify the project but could not query the live database because its token lacks the required `projects:write` scope.
- Static migration review cannot prove deployed migration parity, active bucket limits, dashboard auth settings, secrets, scheduled jobs, backups, or live RLS behavior.
- Full service-role database E2E and real Stripe/RevenueCat lifecycle tests were not run because production/staging credentials and safe test environments were not available in this audit context.
- BrowserStack was intentionally optional and remained disabled without credentials. Local Playwright coverage is evidence of browser smoke behavior, not a substitute for a maintained real-device matrix.

## Evidence summary

- Public domains inspected in a real browser, including console and DOM state.
- Live response headers, metadata, robots, sitemap, manifest, and well-known paths reviewed.
- Repository, GitHub settings, CI result, build artifacts, source, tests, migrations, Edge Functions, and operational documents reviewed.
- Build evidence: largest JavaScript chunks measured both raw and gzip.
- Source searches performed for RLS coverage, storage constraints, account purging, cron authentication, analytics consent, monitoring, accessibility tooling, backup/DR, and native release requirements.

This report is a point-in-time assessment, not a certification. Re-run the live portions after P0 remediation and preserve the resulting evidence with the release.
