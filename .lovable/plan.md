This is a large multi-area change. I'll ship it in clearly-scoped slices so each is reviewable and the app stays green between them. Say "go" after any slice and I'll continue with the next.

## Slice 1 — Verification copy: 10k everywhere, not 100k
- `src/pages/Settings.tsx`: "Standard (100k+ followers) or $1.99/mo fast-track" → "Standard (10,000 followers) or $1.99/mo fast-track".
- `src/pages/Verification.tsx`: rewrite the requirements bullet so it says "10,000 CrownMe followers + activity requirements" instead of "100k+ external followers". Keep the $1.99/mo fast-track copy intact.
- Sanity-check the existing Standard Verification progress card already says "At least 10,000 followers" — yes, confirmed in the screenshot.

## Slice 2 — Expand Standard Verification eligibility (server-side)
Migration to extend `verification_eligibility_progress` and `request_standard_verification` with new performance checks:
- `followers` ≥ 10,000 (existing)
- `profile_photo`, `bio ≥ 20 chars`, `account_age ≥ 30d`, `good_standing` (existing)
- `posts_or_scrolls` ≥ 25 (was 5)
- `battles_won` ≥ 25 — counted from `battles` where winner = user
- `crowns_held` ≥ 10 — from `crowns` (active)
- `votes_received` ≥ 50,000 — sum across the user's posts/battles
- `email_verified` — `auth.users.email_confirmed_at IS NOT NULL`
- `phone_verified` — only enforced when phone verification is enabled in `platform_settings`
- `no_serious_recent_violations` — no active `user_strikes` of severity 'severe' in last 90d
Update `src/lib/verificationEligibility.ts` `EligibilityCheckKey` union + `CHECK_ORDER` and the test fixture in `verificationEligibility.test.ts`. UI in `Verification.tsx` already renders rows dynamically via `orderedChecks`, so new keys appear automatically with progress bars.
Add a helper line in the UI: "Standard Verification is earned through activity. Paid Verification ($1.99/mo) is optional."

## Slice 3 — Scrolls DM share button
- Add a DM action to the Shorts action rail (`src/pages/Shorts.tsx`) next to crown/comment/share.
- Reuse `DmSharePicker` (already built) wired to `sendDmShare({ kind: "post_share", postId })` — Scrolls are posts of type "video", so the existing `post_share` path covers it. `SharedPostMessage` already renders the unavailable fallback.
- Add a vitest covering: button presence on scroll rail, picker opens, send calls RPC with correct args.

## Slice 4 — Gift modal: fix "Send via DM" + replace "Send on Feed" with "Send to Follower"
- `RoyalGiftStore.tsx` already wires "Send via DM" → `GiftDmPicker` → `performSendViaDm`. I'll audit the picker for: recent chats + following + followers + username search, avatar/display name/verified badge, block + self-gift + unavailable-user filters. Patch any gap.
- Replace the "Send on Feed" button with **"Send to Follower"** that opens `GiftTargetPicker` configured to load the sender's following list first and expose a username search (extend the picker, not navigate to /feed).
- Disabled states for blocked / banned / private / unavailable recipients.
- Vitest: send-via-dm flow, send-to-follower flow, search outside following, self-gift blocked, blocked-user blocked, insufficient funds opens Add Shekels, single wallet debit on double-tap (idempotency key already covers this — keep regression test).

## Slice 5 — Notifications & inbox polish + final pass
- Confirm `send_dm_share` and `send_dm_gift` insert the recipient notification + the realtime message; add polling fallback hook if the user is on `/messages` with realtime down (reuse `useRealtimeFallbackPoll`).
- Manual verification: deep-link from notification to the right thread, mark as read on open.

## Tech notes (for me, not the user)
- All new eligibility data must be computed inside the SECURITY DEFINER RPC — never trust client counts.
- `votes_received` is the hot column; cap the SUM with a single aggregate over `posts.vote_count` (already materialized) to keep the RPC fast.
- `phone_verified` only enforced when `platform_settings.phone_verification_enabled = true`; otherwise the check is omitted from `checks` so it doesn't block users.

Ready to start with **Slice 1**?