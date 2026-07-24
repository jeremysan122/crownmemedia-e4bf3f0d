# CrownMe RLS and permission contract

Effective revision: `20260722160000_full_social_rls_permission_revision.sql`

This is the security contract for CrownMe as an 18+ social competition platform. The migration is the final authority after the earlier additive-grant wave. It resets browser-role table privileges, enables RLS on every `public` base/partitioned table, and rebuilds grants from the policies that exist at deploy time. Tables with protected columns are then replaced with explicit allowlists.

## Platform-wide rules

| Boundary | Anonymous | Authenticated user | Admin/moderator | Backend/service role |
|---|---|---|---|---|
| `public` schema | `USAGE`; no `CREATE` | `USAGE`; no `CREATE` | Same browser role; authority comes from `user_roles` | Backend-managed |
| Base tables | RLS-filtered reads only | Operation granted only when an RLS policy exists | Same JWT role; policy/RPC checks `has_role` or `is_any_admin` | Server jobs and Edge Functions |
| Writes | No direct table writes | Owner/participant policies only | Role-gated policy or audited RPC | Trusted server workflows |
| Functions | No implicit `PUBLIC EXECUTE` | Explicit RPC grants | Explicit RPC grant plus an internal role check | Explicit server use |
| Future objects | No default `PUBLIC` table/function/sequence rights | Must be deliberately granted | Must be deliberately granted | Migration owner decides |

## Domain matrix

| Domain | Read rule | Write rule | Important enforcement |
|---|---|---|---|
| Profiles | Active profiles expose display fields only; owners use `get_my_profile()` for full settings | Owners can insert/update an explicit preference/profile column list | Names, moderation state, deletion state and verification plan are absent from `profiles_public`; admin status changes use audited `admin_set_profile_status` |
| Posts/feed/search/map | Only approved, due, nonremoved, nonarchived posts whose author is visible | Publish through `publish_post_idempotent`; owners may edit an explicit display-field list and delete their post | No submission keys, AI text, moderation notes/reasons, reviewer data, exact latitude/longitude or capture time |
| Comments/reactions/bookmarks/votes | A child row is visible only through a visible parent post/comment | Authenticated actor must own the action and be able to see the parent | Blocking and account-state checks are server-side; comments also honor `hide_comments` |
| Follows/private accounts | Social graph visibility follows relationship privacy | Public accounts accept immediately; private accounts create a pending request | Direct `follows` mutation is revoked; approval/cancel/decline uses RPCs; blocking removes both-direction relationships and pending requests |
| Blocks/restrictions/mutes | Owner-scoped | Owner-scoped | Blocks affect posts, follows, interactions and DMs in both directions |
| DMs/reactions/attachments | Sender/receiver or thread participants only | Sender identity, block state and recipient `who_can_dm` preference are checked server-side | A `BEFORE INSERT` trigger covers direct messages and SECURITY DEFINER gift/share RPCs; shared posts must be visible to the sender |
| Notifications/push | Recipient/owner only | Server-generated notifications; owner device-subscription management | No anonymous read or write |
| Battles/live battles/tournaments | Public live/completed surfaces; private lifecycle rows are participant/admin scoped | Participant transitions or role-gated RPCs | Existing battle state machines, rate limits and moderation policies remain authoritative |
| Gifts/catalogs | Public gift feed is a non-sensitive projection; catalog price/label fields are public | Gift movement goes through atomic RPCs | Provider `stripe_price_id` values are not browser-readable |
| Wallets/Shekels/boosts | Owner-scoped ledger/balance reads; admin diagnostics role-gated | No direct browser mutations of balances, ledgers, lots or debit operations | Atomic SECURITY DEFINER/private routines own financial state changes |
| Stripe/payouts/Royal Pass | Owner-scoped subscription/payment/payout reads; admin finance views role-gated | Edge/webhook/RPC only | Browser roles cannot insert/update/delete Stripe events, payment state, payout state, grants, reversals or allowances |
| Verification | Owner sees and creates their request; admins see the queue | Owner edits only application fields; decisions use `admin_decide_verification` | Verification documents remain in a private bucket with owner/admin policies |
| Moderation/reports/audit | Reporter sees own case; moderator/admin queues are role-gated | Report submission by actor; decisions and takedowns role-gated/audited | Moderation reports are excluded from Realtime; audit data is not anonymous |
| Achievements/crowns/frames | Public definitions and public showcases; owner progress is owner-scoped | Reward/equip RPCs validate ownership/eligibility | Master asset bucket remains private; published assets use admin policies |
| Storage | Public media buckets allow reads; private evidence, DM and verification buckets do not | Own-folder writes or participant/admin-specific policies | Obsolete authenticated-anywhere upload policies are removed; restrictive extension/MIME policy remains |
| Realtime | Delivery still passes table RLS | Client writes follow the same table/RPC authorization | Messages and notifications are intentional streams; sensitive report tables are excluded |

## Deploy-time invariants

The migration aborts if any of these are false:

- Every `public` base or partitioned table has RLS enabled.
- Anonymous users cannot insert into profiles, posts or messages.
- Authenticated users cannot directly update wallets, insert ledger entries, or insert follow edges.
- Profiles and posts do not have table-wide browser `SELECT` privileges.
- Protected post coordinates/internal fields, profile PII/moderation fields, and Stripe price IDs are not browser-readable.

The repository test `fullSocialRlsRevision.test.ts` locks the final migration and browser call sites. `scripts/production-rls-read-probe.mjs` verifies both row isolation and protected-column behavior with the publishable anonymous key after deployment.

## Deployment order

1. Apply the migration in a staging branch/project and regenerate Supabase types if the remote schema adds any incidental metadata.
2. Run unit/type/build checks, authenticated two-user RLS tests, and the anonymous production probe against staging.
3. Deploy the database migration before or atomically with the client bundle, because the new client uses follow RPCs.
4. Verify public profile, feed, map, search, comments, voting, DMs, private follow approval, wallet, verification, admin moderation and storage uploads.
5. Apply to production, run the anonymous probe, then perform a signed-in owner/stranger/admin smoke test.
