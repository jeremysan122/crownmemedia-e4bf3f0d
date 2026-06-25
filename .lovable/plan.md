# CrownMe Launch Plan

## v1.0 — Public PWA Launch (this week)

**Status: READY TO PUBLISH ✅**

### Verified
- ✅ Security scan: 0 findings (Supabase, agent, connector scanners all clean)
- ✅ Dependency scan: 0 high/critical npm vulnerabilities
- ✅ Stripe go-live: all 5 steps completed, live checkout ready
- ✅ PWA: `site.webmanifest` with id, icons, shortcuts, screenshots, standalone display
- ✅ Web push service worker (`public/sw.js`) — handles `push` and `notificationclick`
- ✅ Head metadata: title, description, canonical, OG, Twitter card, JSON-LD WebApplication
- ✅ Sitemap + robots.txt
- ✅ Edge functions migrated to Lovable-managed Stripe gateway:
  `create-checkout`, `create-royal-pass-checkout`, `create-verification-checkout`,
  `payments-webhook` (with Connect events merged), `verify-purchase`,
  `royal-pass-portal`, `royal-pass-cancel`, `create-connect-account`,
  `connect-account-status`, `request-payout`
- ✅ Cron jobs scheduled: `snapshot-ranks`, `process-email-queue`, `streak-reminder`
- ✅ Cookie consent banner
- ✅ Error reporter installed (filters benign auth-session messages)
- ✅ Embedded checkout uses `redirect_on_completion: never` (preserves session)
- ✅ Streak reminder + analytics deeplink to `/rewards`
- ✅ Admin portal: all routes reachable + protected by `AdminRoute`

### Launch action
Click **Publish** in Lovable → site goes live at `crownmemedia.com`.
DNS already configured (custom domain active).

---

## v1.1 — Native App Stores (queued for after PWA proves stable)

> **Update:** Capacitor + RevenueCat scaffolding is now in the repo.
> See `docs/NATIVE_APP_PLAN.md` for the full readiness matrix, local
> `npx cap add` instructions, RevenueCat dashboard setup, and the
> App Store / Play Store submission checklist.

### Capacitor shell
1. `bun add @capacitor/core @capacitor/ios @capacitor/android`
2. `bun add -D @capacitor/cli`
3. `npx cap init crownmemedia app.lovable.fcbd98f7a4524e42a0f9b92cfce5c620`
4. Add `server.url` pointing to preview for hot-reload during dev
5. User exports to GitHub → `npx cap add ios && npx cap add android`

### Native push
- Add `@capacitor/push-notifications`
- Bridge native APNs/FCM tokens into existing `push_subscriptions` table
- Reuse `send-web-push` for web; add `send-native-push` for FCM/APNs

### Assets
- App icon (1024×1024 master) → run `npx @capacitor/assets generate`
- Splash screens (2732×2732 master) — dark royal background `#0b0612`
- Adaptive icon foreground/background for Android

### Play Store prep (lower-risk, start here)
- Privacy policy URL (already at `/legal/privacy-policy`)
- Data Safety form: media, location (city), payments, messaging
- Content rating: Mature 17+ (sensitive content, social, IAP)
- Age gate already enforced at `/verify-age`
- Screenshot set: phone (4–8), 7" tablet, 10" tablet
- AAB signed upload

### iOS purchase-rule review
**Critical decision before iOS submission:** Apple requires IAP (15–30% cut) for
digital goods consumed inside the app. Affected surfaces:
- Shekel bundles → MUST use IAP on iOS
- Royal Pass subscription → MUST use IAP on iOS
- Verification subscription → MUST use IAP on iOS
- Boosts (consumed inside app) → MUST use IAP on iOS
- Creator payouts (Stripe Connect) → exempt (real-world money out, not in)

### IAP strategy (iOS only)
- `@revenuecat/purchases-capacitor` (handles both App Store + Play Billing,
  unified webhooks → existing `payments-webhook` via RevenueCat → Lovable bridge)
- Mirror Shekel SKUs in App Store Connect (consumable) and Play Console
- Royal Pass → App Store auto-renewing subscription group

### iOS-vs-web purchase gating
```ts
// src/lib/purchaseGate.ts
export function shouldUseIAP() {
  return Capacitor.getPlatform() === "ios";
}
```
- Hide Stripe checkout buttons when `shouldUseIAP()`; show IAP buttons instead
- Same gating for Royal Pass + Verification CTAs

### Native QA checklist
- [ ] Cold start < 3s
- [ ] Deep links: `/post/:id`, `/u/:username`, `/battles/:id`, `/rewards`
- [ ] Push permission prompt (iOS + Android 13+)
- [ ] Camera permission + photo library
- [ ] Sign-in with Apple (required by App Store when other social logins exist)
- [ ] Offline error state (no app-shell SW — show inline retry)
- [ ] Safe area insets on notched devices
- [ ] Back-button behavior (Android)
- [ ] IAP sandbox purchase + restore
- [ ] Webhook reaches `payments-webhook` from RevenueCat sandbox
- [ ] Account deletion in-app (App Store requirement)
- [ ] Report/block flows reachable in 2 taps (App Store UGC requirement)

---

## Out of scope for v1.0
- Capacitor wrapper
- Native push (web push works in PWA on Android + desktop; iOS web push works on iOS 16.4+ for installed PWAs)
- App Store / Play Store submissions
- IAP integration
