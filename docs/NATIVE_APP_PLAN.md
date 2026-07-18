# CrownMe — Native App Preparation (v1.1)

> v1.0 PWA at `crownmemedia.com` remains the primary launch target this week.
> Everything in this doc is **scaffolding for v1.1** — do not ship to the App
> Store or Play Store until every section below is marked ready.

---

## Readiness Matrix

| Surface | Status | Blockers remaining |
|---|---|---|
| **PWA launch** | ✅ READY | None — click Publish in Lovable |
| **Android native** | 🟡 SCAFFOLDED | `npx cap add android` locally; signed AAB; Play Console setup |
| **iOS native** | 🟡 SCAFFOLDED | `npx cap add ios` locally; Apple Developer membership; Sign in with Apple; IAP gating verified |
| **RevenueCat** | 🟡 SCAFFOLDED | SDK initialization and native purchase UI; production SDK keys; store products; webhook secret |
| **Native push** | 🟡 CODE READY | APNs cert (iOS), FCM project (Android), `send-native-push` function |
| **App Store submission** | ❌ NOT READY | All iOS items above + reviewer demo account + privacy nutrition label |
| **Play Store submission** | ❌ NOT READY | Signed AAB + Data Safety form + content rating + reviewer demo account |

---

## What this PR added

- `capacitor.config.ts` — production appId `com.crownmemedia.app`, appName `CrownMe`, splash + push plugin config, and a release-safe local `dist/` bundle (no remote preview URL).
- Capacitor + RevenueCat npm deps installed (`@capacitor/core`, `ios`, `android`, `push-notifications`, `app`, `splash-screen`, `@revenuecat/purchases-capacitor`, `@capacitor/cli`, `@capacitor/assets`).
- `src/lib/purchaseGate.ts` — `shouldUseIAP()`, `purchaseProvider()`, `isAppleStrict()`.
- `src/lib/nativePush.ts` — registers APNs/FCM token into `public.push_subscriptions` (reusing existing table, `endpoint = "ios:<token>"` / `"android:<token>"`, `user_agent = platform`). Deep-link handler reuses `routeNotification`.
- `supabase/functions/revenuecat-webhook/` — idempotent receiver mapping RC events to `royal_pass_subscriptions`, `verification_requests`, `shekel_ledger`, `payment_transactions`. Static Authorization header verified against `REVENUECAT_WEBHOOK_AUTH` secret.

---

## Steps the project owner must run locally

Lovable's sandbox cannot create `ios/` or `android/` folders. After this PR:

```bash
# 1. Export the project to GitHub from Lovable (top-right menu).
# 2. Clone locally.
git pull
npm install

# 3. Add native platforms.
npx cap add android
npx cap add ios          # Mac + Xcode required

# 4. Build web bundle and sync.
npm run build
npx cap sync

# 5. Open IDEs.
npx cap open android     # Android Studio
npx cap open ios         # Xcode
```

The checked-in `capacitor.config.ts` is release-safe and intentionally has no
`server.url`. If device hot reload is needed, use a temporary local development
override and never commit that override to a release branch.

### App icons + splash
Drop a 1024×1024 master icon at `resources/icon.png` and a 2732×2732 splash at
`resources/splash.png` (dark `#0b0612`), then run:
```bash
npx capacitor-assets generate
```

---

## Database changes still required (v1.1 migration, not in this PR)

These need user approval and will be queued in a follow-up migration:

```sql
-- 1. Track native push device type without breaking web rows.
alter table public.push_subscriptions
  add column if not exists platform text not null default 'web'
    check (platform in ('web','ios','android'));

-- 2. RevenueCat event idempotency log.
create table if not exists public.revenuecat_events (
  event_id text primary key,
  received_at timestamptz not null default now()
);
grant select, insert on public.revenuecat_events to service_role;
alter table public.revenuecat_events enable row level security;

-- 3. Mirror RevenueCat product ids on existing catalog tables.
alter table public.shekel_bundles add column if not exists revenuecat_product_id text;
alter table public.royal_pass_plans add column if not exists revenuecat_product_id text;

-- 4. Distinguish provider on payouts/ledger surfaces.
alter table public.royal_pass_subscriptions
  add column if not exists provider text not null default 'stripe'
    check (provider in ('stripe','revenuecat'));
alter table public.royal_pass_subscriptions
  add column if not exists provider_subscription_id text;
create unique index if not exists royal_pass_provider_sub_idx
  on public.royal_pass_subscriptions(provider_subscription_id)
  where provider_subscription_id is not null;
```

---

## RevenueCat setup (dashboard)

1. Create a RevenueCat project, link App Store Connect + Play Console apps.
2. Mirror SKUs:
   - `royal_pass_monthly`, `royal_pass_yearly` → entitlement `royal_pass`
   - `verification_fast_track` → entitlement `verification`
   - `shekels_100`, `shekels_500`, `shekels_1000`, `shekels_5000` → consumable
3. In **Project Settings → Integrations → Webhooks**:
   - URL: `https://<project-ref>.functions.supabase.co/revenuecat-webhook`
   - Authorization header: a long random string — store in Lovable secret `REVENUECAT_WEBHOOK_AUTH`.
4. Public SDK key → Lovable secret `REVENUECAT_PUBLIC_SDK_KEY_IOS` / `_ANDROID`.

---

## Native push (APNs + FCM) setup

- **APNs (iOS)**: APNs key (.p8) + Key ID + Team ID → upload to RevenueCat or
  configure Firebase Cloud Messaging APNs bridge.
- **FCM (Android)**: Firebase project → download `google-services.json` →
  place in `android/app/`. Add `GoogleService-Info.plist` in `ios/App/App/`.
- Add edge function `send-native-push` (sibling of `send-web-push`) that fans
  out to FCM HTTP v1 + APNs based on `push_subscriptions.platform`. Re-use
  the notification-id → payload contract already wired into `send-web-push`.
- Keep payloads minimal (title + deep-link key); never include message body,
  DM contents, or sender name — protects lock-screen previews.

---

## Purchase compliance matrix

| Product | Type | Web (PWA) | Android (Play) | iOS (App Store) |
|---|---|---|---|---|
| Royal Pass subscription | Digital subscription | Stripe | RevenueCat → Play Billing | RevenueCat → Apple IAP |
| Verification fast-track | Digital one-off | Stripe | RevenueCat → Play Billing | RevenueCat → Apple IAP |
| Shekel bundles | Virtual currency (consumable) | Stripe | RevenueCat → Play Billing | RevenueCat → Apple IAP |
| Boosts | Digital consumable | Stripe | RevenueCat → Play Billing | RevenueCat → Apple IAP |
| Creator payouts (Stripe Connect) | Money-out | Stripe Connect | Stripe Connect | Stripe Connect (exempt) |
| Physical merch (if added later) | Physical goods | Stripe / Shopify | Stripe / external link | Stripe / external link (allowed) |

The `shouldUseIAP()` gate **must** be applied to every CTA that lands on a
Stripe checkout: Royal Pass page, Verification page, Shekel store, Boost
modal. When `true`, show the RevenueCat button instead. **Never show a
Stripe button inside the iOS app** — that's the single fastest way to fail
App Review.

---

## App Store / Play Store submission checklist

### Both stores
- App name: **CrownMe**
- Subtitle: *Earn the crown — 18+ social photo competition*
- Category: Social Networking (primary), Entertainment (secondary)
- Support URL: `https://crownmemedia.com/support`
- Marketing URL: `https://crownmemedia.com`
- Privacy policy URL: `https://crownmemedia.com/legal/privacy-policy`
- Terms URL: `https://crownmemedia.com/legal/terms-of-service`
- Account deletion: in-app `Settings → Account → Delete account` **and** public URL `https://crownmemedia.com/legal/account-deletion` (still to create as a static info page).
- Contact email: `support@crownmemedia.com`
- Reviewer demo login: create dedicated `reviewer@crownmemedia.com` test account, give it a verified profile, sample posts, and one DM thread for reproducibility. Document credentials in the App Store / Play Console reviewer notes only — never in code.

### App Store (iOS) extras
- Age rating: **17+** (Frequent/Intense Sexual Content & Nudity OFF unless sensitive content is enabled by the user; Mature/Suggestive Themes ON; User-Generated Content ON).
- Sign in with Apple — required because Google Sign-In is offered.
- App Privacy nutrition label:
  - Contact Info: Name, Email, Phone Number (optional) — linked to identity.
  - User Content: Photos/Videos, Messages, Other User Content.
  - Identifiers: User ID.
  - Usage Data: Product Interaction, Crash Data.
  - Location: Coarse (city) — for leaderboards.
  - Purchases: Purchase History.
- In-app purchases: list every RevenueCat SKU with localized name + price.
- Export compliance: standard HTTPS only → `ITSAppUsesNonExemptEncryption = false`.

### Play Store (Android) extras
- Content rating questionnaire → Mature 17+.
- Data Safety form:
  - Collects: Name, Email, Photos, Messages, User IDs, Coarse Location, Purchase History, Crash Logs.
  - Shares with third parties: Stripe (payments), RevenueCat (purchases), Lovable Cloud (auth/db/storage), Mapbox (maps), Resend (transactional email).
  - Encryption in transit: Yes. Data deletion: Yes (in-app + URL).
- Target SDK: 34+ (Capacitor 6 default).
- Signed Android App Bundle (AAB) — Play App Signing enabled.

### Required UGC features (already in app, confirm before submission)
- Report content (post, comment, DM, user, profile) — present in CrownMe.
- Block user — present.
- Mute words/threads — present.
- Sensitive-content opt-in/out — present (`/legal/sensitive-content-policy`).
- Community Guidelines — published at `/legal/community-guidelines`.
- CSAE policy + reporting endpoint — published at `/legal/csae-policy`.
- Moderation queue + appeals — admin portal `AdminModeration` + `SensitiveAppeal`.

---

## Native QA checklist (run before any store submission)

- [ ] Android release AAB builds without warnings.
- [ ] iOS Archive succeeds with no signing errors.
- [ ] Cold start under 3s on a mid-tier device.
- [ ] Login (email + Google + Apple on iOS) works.
- [ ] Feed, Scrolls, Battles, Crown Map, Discover all load.
- [ ] Upload from camera + photo library works (permissions prompt fires).
- [ ] DMs send + receive; typing indicator + read state.
- [ ] Native push permission prompt appears once; opt-out path documented.
- [ ] Deep links resolve: `/post/:id`, `/u/:username`, `/battles/:id`, `/rewards`, `/wallet`, `/messages/:threadId`, `/verification`, `/notifications`.
- [ ] RevenueCat sandbox purchase succeeds for Royal Pass, Verification, each Shekel SKU, each Boost SKU.
- [ ] RevenueCat sandbox refund revokes entitlement.
- [ ] Stripe checkout buttons are **invisible** on iOS for all digital-goods surfaces.
- [ ] Web/PWA Stripe checkout still works after deploy.
- [ ] Royal Pass / Verification status updates within 30s of RC webhook.
- [ ] Shekel balance increments after RC sandbox purchase; no double-credit on webhook retry.
- [ ] Account deletion completes in-app.
- [ ] Report / block flows reachable within 2 taps.
- [ ] No high/critical npm vulnerabilities (`bun audit`).
- [ ] No high/critical Supabase security findings.

---

## Tests to add (planning queue)

- `src/lib/__tests__/purchaseGate.test.ts` — gate returns `web` outside Capacitor, `ios`/`android` when mocked.
- `src/lib/__tests__/nativePushRegistration.test.ts` — mocks `@capacitor/push-notifications`, asserts upsert payload shape.
- `supabase/functions/revenuecat-webhook/_test.ts` — idempotency (replay returns `duplicate:true`), entitlement activation for each event type, refund revokes Royal Pass, shekel credit no-doubles.
- E2E (Playwright) — Stripe checkout still completes on PWA after RC code is shipped.
- Native smoke (manual + scripted via `npx cap run`) — reviewer demo account purchase + refund cycle.

---

## Final recommendation

The PWA remains the current production surface. Native Android and iOS
scaffolding is present, but RevenueCat currently has only the webhook and
platform-gating foundations—not SDK initialization or native purchase UI.
Neither native surface is submission-ready until every remaining item above is
implemented and verified against store sandbox purchase and refund flows.
