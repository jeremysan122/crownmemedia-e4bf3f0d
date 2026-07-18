# CrownMe Platform Surface Reference

Audited against the repository on 2026-07-17. This document is an inventory, not a claim that every surface has passed production load, abuse, payment, or device testing. The executable contract is `src/lib/__tests__/platformSurfaceAudit.test.ts`.

## Inventory summary

| Surface | Source of truth | Audited count |
| --- | --- | ---: |
| React route declarations | `src/App.tsx` | 125 unique declarations: 105 absolute routes and 20 nested Command Center routes |
| Supabase edge functions | `supabase/functions/*` | 36 deployable functions; all 36 now have an explicit `verify_jwt` policy |
| Generated public-schema functions | `src/integrations/supabase/types.ts` | 244 functions, including API RPCs, trigger helpers, and maintenance functions |
| RPCs invoked by application/edge runtime code | `src/**`, `supabase/functions/**` | 153 unique RPC names; every name exists in the generated catalog |

## Route map

### Public, authentication, marketing, and legal

`/` · `/auth` · `/reset-password` · `/verify-age` · `/unsubscribe` · `/get-royal-pass` · `/royal-pass/about` · `/marketing/:screen`

`/legal` · `/terms` · `/privacy` · `/conduct` · `/cookies` · `/dmca` · `/acceptable-use` · `/eula` · `/subscription-terms` · `/csae-policy` · `/contact-legal` · `/sensitive-content` · `/virtual-goods`

Public share/read routes: `/:username` · `/u/:username` · `/profile/:username` · `/post/:id` · `/p/:id` · `/crown/:slug` · `/c/:mainSlug` · `/c/:mainSlug/:subSlug`

`/email-template-preview` is intentionally mounted behind authenticated administrator access despite its URL remaining stable.

### Authenticated social product

`/onboarding` · `/feed` · `/discover` · `/upload` · `/scrolls` · `/shorts` · `/notifications` · `/messages` · `/messages/:otherId` · `/pending`

`/me` · `/edit-profile` · `/insights` · `/creator` · `/drafts` · `/archived` · `/wallet` · `/verification` · `/invite`

### Battles, maps, rankings, achievements, and rewards

`/battles` · `/battles/live` · `/battles/history` · `/battles/posts` · `/battles/analytics` · `/battles/:id` · `/battles/:battleId/lobby` · `/live/:battleId` · `/tournaments` · `/tournaments/:id`

`/map` · `/crown-map` · `/leaderboard` · `/leaderboard/c/:mainSlug`

`/achievements` · `/crowns` · `/crown/:slug` · `/frames` · `/rewards` · `/rewards/crowns` · `/rewards/frames` · `/rewards/history`

### Commerce, account, safety, and appeals

`/royal-pass` · `/store` · `/store/success`

`/settings` · `/settings/crowns` · `/settings/frames` · `/preferences` · `/muted-words` · `/blocked` · `/restricted` · `/account/legal`

`/reports/mine` · `/reports/:reportId/appeal` · `/appeals/sensitive` · `/appeals/sensitive/new` · `/appeals/sensitive/new/:postId`

### Staff and administration

`/admin` · `/admin/moderation` · `/admin/audit-log` · `/admin/verify` · `/admin/verification` · `/admin/voting-verify` · `/admin/creator-program` · `/admin/rewards` · `/admin/bundles` · `/admin/broadcast` · `/admin/categories` · `/admin/reserved-usernames` · `/admin/compliance` · `/admin/system-audit` · `/admin/race-audit` · `/admin/royal-shields` · `/admin/sensitive-appeals` · `/admin/crowns/asset-review`

Command Center base: `/admin/command-center`

Nested Command Center routes: `realtime` · `security` · `finance` · `stripe-health` · `db-health` · `cloud-spend` · `users` · `content` · `reports` · `broadcasts` · `support` · `settings` · `audit` · `error-logs` · `feature-flags` · `platform-health` · `live-battle-reports` · `achievements` · `achievement-author`

All `/admin` routes are wrapped by both authentication and staff-role gates. Sensitive internal preview tooling additionally requires an administrator role.

## Edge functions

### Gateway JWT required

| Function | Primary responsibility |
| --- | --- |
| `achievements-process-batch` | Admin/service achievement pipeline |
| `admin-royal-runtime-audit` | Admin-only Royal Pass lifecycle audit |
| `analyze-post-media` | Authenticated post-safety enrichment |
| `connect-account-status` | User-owned Stripe Connect state |
| `create-connect-account` | User-owned Connect onboarding |
| `create-royal-pass-gift-checkout` | Authenticated gift checkout |
| `crown-asset-uploader` | Admin crown-asset ingestion |
| `generate-alt-text` | Authenticated AI accessibility text |
| `get-mapbox-token` | Authenticated map token vending |
| `livekit-room-control` | Host/moderator live-room control |
| `livekit-token` | Authenticated live-room admission |
| `moderate-media` | Authenticated pre-publication media gate |
| `process-email-queue` | Service-role email queue worker |
| `request-payout` | Authenticated creator payout request |
| `royal-pass-cancel` | User-owned subscription cancellation |
| `royal-pass-comms-cron` | Service-role retention communications |
| `royal-pass-portal` | User-owned billing portal session |
| `royal-pass-reconcile` | Service-role subscription reconciliation |
| `royal-pass-sync` | Admin subscription repair |
| `seed-reserved-usernames` | Administrator-only namespace seed |
| `send-test-emails` | Authenticated self-test/admin email QA |
| `send-transactional-email` | Authenticated/service email enqueue |
| `streak-reminder` | Service-role scheduled reminder scan |
| `verify-purchase` | User-owned Checkout verification fallback |

### Public gateway with handler-level verification

| Function | Handler-level trust boundary |
| --- | --- |
| `auth-email-hook` | Dedicated bearer secret |
| `create-checkout` | Validates the supplied user JWT in the handler |
| `create-royal-pass-checkout` | Validates the supplied user JWT in the handler |
| `create-verification-checkout` | Validates the supplied user JWT in the handler |
| `handle-email-suppression` | Provider webhook authentication |
| `handle-email-unsubscribe` | Signed unsubscribe token |
| `payments-webhook` | Stripe HMAC signature and event idempotency |
| `preview-transactional-email` | Dedicated Lovable API bearer secret |
| `revenuecat-webhook` | Constant-time RevenueCat authorization secret |
| `send-web-push` | Server trigger secret verified by database RPC |
| `snapshot-ranks` | Cron secret or administrator JWT |
| `web-push-public-key` | Deliberately public VAPID public key |

The source policy is now explicit for all 36 functions. Production still must prove that the managed gateway honors `verify_jwt = false` for Stripe and RevenueCat; that external ingress issue is tracked as a P0 launch gate.

`royal-pass-reconcile` now requires both gateway JWT validation and a constant-time service-role bearer check. No repository migration owns that schedule, so the production scheduler must be located or created before this change is deployed, configured to send the service-role bearer, and verified with both an authorized success and unauthorized 401 canary.

## Runtime RPC catalog

The repository invokes 153 unique RPCs from browser or edge-function runtime code. The generated database types expose 244 public-schema functions in total; the difference consists primarily of triggers, maintenance jobs, accounting primitives, and compatibility helpers that are not called directly by TypeScript runtime code.

### Profile, content, search, and account

`cancel_account_deletion` · `check_username_available` · `confirm_my_age` · `count_post_votes_by_type` · `deactivate_my_account` · `delete_email` · `get_my_admin_roles` · `get_my_profile` · `get_post_share_status` · `get_post_vote_stats` · `get_public_crown_by_slug` · `get_user_liked_post_ids` · `publish_post_idempotent` · `reactivate_my_account` · `record_profile_visit` · `request_account_deletion` · `search_public_posts` · `update_my_preferences`

### Battles, live rooms, tournaments, and reposts

`accept_battle` · `broadcast_live_battle_typing` · `bump_live_battle_peak_viewers` · `check_repost_eligibility` · `create_battle_challenge` · `create_live_battle` · `create_rematch` · `create_repost` · `create_tournament` · `decline_battle` · `get_battle_official_result` · `get_battler_battle_analytics` · `get_live_battle_comments` · `get_live_battle_highlight` · `get_live_battle_vote_timeline` · `live_battle_accept` · `live_battle_cancel` · `live_battle_decline` · `live_battle_end` · `live_battle_log_action` · `live_battle_report` · `live_battle_send_emote` · `live_battle_start` · `live_battle_viewer_count` · `live_battle_viewer_heartbeat` · `live_battle_vote` · `resolve_tournament_match` · `schedule_live_battle` · `set_battle_moderation` · `set_lobby_ready` · `start_battle_from_lobby` · `start_tournament_match` · `undo_repost`

### Messaging, gifts, notifications, and social growth

`get_my_unread_dm_counts` · `get_my_unread_notification_counts` · `get_or_create_my_invite_code` · `invite_leaderboard` · `mark_all_messages_read` · `mark_all_notifications_read` · `mark_dm_gift_seen` · `redeem_invite_code` · `resolve_gift_recipient` · `send_dm_gift` · `send_dm_share` · `send_live_battle_gift` · `send_royal_gift`

### Wallet, rewards, achievements, and Royal Pass

`achievement_rarity` · `apply_to_creator_program` · `assert_royal_shield_invariants` · `bump_filter_streak` · `check_and_award_frames` · `claim_daily_reward` · `claim_daily_royal_boost` · `debit_boost_token` · `debit_shekels` · `emit_achievement_event` · `ensure_my_wallet` · `equip_achievement_crown` · `equip_avatar_frame` · `equip_badge` · `equip_frame` · `equip_title` · `evaluate_user_crowns` · `founder_program_public_status` · `get_creator_dashboard` · `get_crown_rarity_stats` · `grant_pass_invite_bonus` · `grant_royal_monthly_benefits` · `handle_royal_dispute_created` · `handle_royal_dispute_funds_withdrawn` · `handle_royal_dispute_lost` · `handle_royal_dispute_reinstated` · `handle_royal_dispute_won` · `handle_royal_refund` · `handle_store_refund` · `has_active_boost` · `is_royal_pass_active` · `log_royal_shield_event` · `my_achievement_crowns` · `my_achievements` · `my_frame_progress` · `my_owned_avatar_frames` · `my_royal_shield_summary` · `my_weekly_quests` · `profile_decorations` · `profile_showcased_achievements` · `purchase_boost` · `recent_achievement_unlocks` · `record_failed_royal_boost` · `record_qualified_active_day` · `royal_entitlements` · `royal_pass_daily_boost_status` · `royal_pass_finance_metrics` · `run_achievement_pipeline` · `set_frames_hidden` · `spin_daily_wheel`

### Verification, push, rate limits, queues, and system helpers

`compute_daily_usage_rollup` · `enforce_rate_limit` · `enqueue_email` · `is_feature_enabled` · `move_to_dlq` · `read_email_batch` · `request_standard_verification` · `save_push_subscription` · `submit_verification_request` · `verify_web_push_trigger_secret`

### Staff and administrative RPCs

`admin_achievement_stats` · `admin_broadcast_notification` · `admin_claim_reserved_username` · `admin_crown_asset_review` · `admin_decide_sensitive_appeal` · `admin_decide_verification` · `admin_grant_royal_pass` · `admin_hide_live_battle_comment` · `admin_list_boost_bundles` · `admin_list_live_battle_reports` · `admin_list_moderation_posts` · `admin_list_royal_pass_sync_audit` · `admin_list_shekel_bundles` · `admin_list_users` · `admin_moderate_comment` · `admin_platform_health_summary` · `admin_royal_pass_reconciliation_snapshot` · `admin_royal_shield_accounting` · `admin_set_creator_reward` · `admin_set_creator_status` · `admin_set_post_removed` · `admin_storage_usage` · `admin_update_live_battle_report_status` · `admin_update_post` · `admin_update_posts_bulk` · `admin_upsert_spin_prize` · `admin_user_growth_summary` · `admin_verify_crown_asset` · `has_role`

The contract test fails if a runtime RPC disappears from generated types, if an edge function lacks an explicit gateway setting, or if a documented route is removed.

## What this inventory does not prove

- Native Stripe/RevenueCat webhook delivery through the managed production gateway.
- Peak-load behavior, multi-region failover, backup restoration time, or disaster recovery.
- App Store and Play Store review, native push receipt, background behavior, battery use, or the complete device matrix.
- Human moderation staffing, legal-response SLAs, fraud operations, or abuse response at major-platform scale.
- Recommendation quality, creator liquidity, retention, or marketplace network effects.

Those require controlled staging/production exercises and operational evidence in addition to source review.
