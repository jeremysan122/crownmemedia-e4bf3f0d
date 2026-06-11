# DM Royal Gifts — Polish + Hardening

A premium, atomic, real-time DM gifting flow for CrownMe. Scoped to existing gift/messages stack; only edits the surface needed.

## 1. Database & RPC (single migration)

- Extend `public.messages` with optional metadata so a gift receipt is a first-class message type:
  - `kind text` (default `'text'`, allowed: `'text' | 'gift'`)
  - `gift_transaction_id uuid` (nullable, FK → `gift_transactions.id`)
  - `gift_seen_at timestamptz` (nullable — set when recipient opens thread; gates animation replay)
- New RPC `public.send_dm_gift(p_gift_id, p_recipient_id, p_quantity, p_dedupe_key)` — `SECURITY DEFINER`, atomic:
  1. Validate sender ≠ recipient, neither banned/suspended/deleted, no blocks either way, DM allowed (respects existing `can_dm` helper if present, else `messages` RLS check).
  2. Call existing `private.send_royal_gift` (debits wallet, inserts ledger, creates `gift_transactions` row).
  3. INSERT into `messages` with `kind='gift'`, `gift_transaction_id`, safe `content` ("🎁 Royal gift sent").
  4. INSERT `notifications` row (`type='dm_gift'`, payload `{ link: '/messages/<thread>', sender_username, gift_name }`).
  5. All in one transaction — any failure rolls back the debit.
  6. Dedupe via `client_dedupe_key` on `gift_transactions` (already unique).
- New RPC `public.mark_dm_gift_seen(p_message_id)` — recipient-only, sets `gift_seen_at` once.
- RLS additions:
  - `messages` already restricts to participants; add WITH CHECK so non-sender cannot insert `kind='gift'` rows directly (only RPC, via `security definer`).
  - `gift_transactions` SELECT: sender OR receiver (already in place — verify).
- Realtime: ensure `messages` and `notifications` are in `supabase_realtime` publication.

## 2. Client — Sending

- Refactor `src/components/gifts/RoyalGiftStore.tsx` → drop the manual `messages.insert` after RPC; call new `send_dm_gift` RPC with idempotency key from `makeGiftIdempotencyKey()`. Disables the send button while in-flight; on success, navigate to thread.
- `src/hooks/useGiftSend.ts` → add `sendDmGift` variant reusing the same retry/fatal-classifier + error logging.
- `src/components/gifts/GiftDmPicker.tsx` → already covers recent/following/search; add:
  - Followers tab (reuses `fetchFollowerRecipients`).
  - Disabled-state rendering for blocked/unavailable (filtered server-side already; UI tooltip "Unavailable").
  - Self filter (already enforced).

## 3. Client — Receiving (inbox + thread)

- `src/pages/Messages.tsx`:
  - Render gift messages with new `GiftReceiptCard` (royal styling: gradient border, crown glow, gift icon, sender chip, name + rarity badge, shekel value, timestamp).
  - On thread open, call `mark_dm_gift_seen` for each unseen gift message; trigger `GiftAnimationOverlay` once per unseen receipt; "Tap to replay" button after.
  - Thread list row: crown badge + soft glow when most recent message `kind='gift'` and unread.
  - Subscribe via existing `useRealtimeChannel` to `messages` inserts for the open thread + the thread-list query; realtime fallback already handled by hook's resync-on-online/visibility.
- Notification bell: existing `NotificationToaster` handles new `dm_gift` type; ensure deep link `/messages/<thread>` routes correctly.

## 4. Analytics

- Add `src/lib/analytics.ts` events (or extend existing): `dm_gift_picker_opened`, `_recipient_selected`, `_send_started`, `_send_success`, `_send_failed` (with sanitized error code only), `_received`, `_animation_opened`, `_notification_clicked`. No PII, no balances, no message text.

## 5. Tests

- Unit: `src/hooks/__tests__/useGiftSend.test.ts` — extend with `sendDmGift` happy path + dedupe behavior (mocked).
- E2E (Playwright, `e2e/dm-gift-flow.spec.ts`): sender picks recipient → sends → wallet debited once → receipt visible in thread → recipient sees crown badge + animation on open.
- RLS test (`src/lib/__tests__/dmGiftRls.test.ts`): third user cannot read sender/recipient gift message, cannot debit other wallet, cannot spoof `sender_id`.

## 6. Verification

- `supabase--linter` after migration.
- Targeted vitest run on new/changed tests.
- Browser walkthrough via Playwright: send gift via DM, verify realtime arrival in second session, verify animation plays once and `mark_dm_gift_seen` sets timestamp.

## Files

**New:**
- `supabase/migrations/<ts>_dm_gift_messages.sql`
- `src/components/messages/GiftReceiptCard.tsx`
- `src/hooks/useDmGiftThread.ts` (open-thread seen-marker + animation queue)
- `e2e/dm-gift-flow.spec.ts`
- `src/lib/__tests__/dmGiftRls.test.ts`

**Edited:**
- `src/components/gifts/RoyalGiftStore.tsx` (use RPC, remove manual `messages.insert`)
- `src/components/gifts/GiftDmPicker.tsx` (followers tab, disabled states)
- `src/hooks/useGiftSend.ts` (`sendDmGift`)
- `src/pages/Messages.tsx` (gift rendering, badge, realtime)
- `src/lib/analytics.ts` (new events)
- `src/hooks/__tests__/useGiftSend.test.ts`

## Out of scope

- Push-notification body changes (existing safe-text path already used).
- Refund UX beyond "show updated state if `gift_transactions.status` flips" — recipient card reads status from row; no admin UI built here.
